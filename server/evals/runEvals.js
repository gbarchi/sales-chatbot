// Offline eval harness for the NL->SQL pipeline.
//
// Drives the REAL running server over HTTP (login + /api/chat) so every case
// exercises the full path: margin guards -> entity resolution -> LLM prompt
// (with the canonical metric registry) -> DuckDB execution -> response.
// Assertions are shape/structure based (chart type, columns, SQL substrings,
// permission blocks) so they survive data drift instead of pinning to exact
// numbers.
//
// Why this exists: before it, prompt/metric changes shipped unmeasured and the
// "Known Query Gaps" accumulated. This converts that informal bug list into a
// regression net and a baseline accuracy number to gate changes (~90% target).
//
// Usage:
//   1. Start the server first:  npm start   (loads the CSV into DuckDB)
//   2. In another shell:        npm run eval
//   Optional category filter:   npm run eval -- permissions
//   Optional base URL:          EVAL_BASE_URL=http://localhost:3001 npm run eval
//
// LLM output is non-deterministic, so a case may flip occasionally; treat the
// aggregate per-category accuracy as the signal, not any single run.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3001';

// Default seed credentials (see userService.createDefaultUsers). Seed passwords
// may have been rotated in a given environment, so each is overridable via env
// (e.g. EVAL_SUPERVISOR_PW=...). Roles that fail to log in have their cases
// SKIPPED (not failed) so a rotated password never red-lines the whole suite.
const CREDENTIALS = {
  gerente:    { username: process.env.EVAL_GERENTE_USER    || 'gerente',          password: process.env.EVAL_GERENTE_PW    || 'gerente123' },
  vendedor:   { username: process.env.EVAL_VENDEDOR_USER   || 'alejandro.moreno', password: process.env.EVAL_VENDEDOR_PW   || 'vendedor123' },
  supervisor: { username: process.env.EVAL_SUPERVISOR_USER || 'angel.figueroa',   password: process.env.EVAL_SUPERVISOR_PW || 'supervisor123' },
};

const cases = JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf8'));
const categoryFilter = process.argv[2] || null;

function extractCookie(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return list.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}

async function login(role) {
  const creds = CREDENTIALS[role];
  if (!creds) throw new Error(`No credentials configured for role "${role}"`);
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    throw new Error(`Login failed for ${role} (${creds.username}): ${body.message || res.status}`);
  }
  return extractCookie(res);
}

// POST a chat query, retrying once on 429 (rate limit) after a short wait.
async function chat(cookie, query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      // lean: skip the analysis + follow-up LLM calls we never assert on (~2/3 fewer tokens).
      body: JSON.stringify({ query, lean: true }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 6000));
      continue;
    }
    return res.json();
  }
  return { type: 'error', message: 'rate-limited after retries' };
}

const ci = (s) => (s || '').toLowerCase();

// Returns an array of failure reasons (empty array = pass).
function checkExpectations(resp, expect) {
  const reasons = [];
  const sql = ci(resp.sql);

  if (expect.type && resp.type !== expect.type) {
    reasons.push(`type "${resp.type}" != expected "${expect.type}"`);
  }
  if (expect.messageIncludes && !ci(resp.message).includes(ci(expect.messageIncludes))) {
    reasons.push(`message lacks "${expect.messageIncludes}"`);
  }
  for (const sub of expect.sqlIncludes || []) {
    if (!sql.includes(ci(sub))) reasons.push(`SQL lacks "${sub}"`);
  }
  if (expect.sqlIncludesAny && !expect.sqlIncludesAny.some((s) => sql.includes(ci(s)))) {
    reasons.push(`SQL lacks any of [${expect.sqlIncludesAny.join(', ')}]`);
  }
  for (const sub of expect.sqlExcludes || []) {
    if (sql.includes(ci(sub))) reasons.push(`SQL must not contain "${sub}"`);
  }
  if (expect.chartTypeIn && !expect.chartTypeIn.includes(resp.chartType)) {
    reasons.push(`chartType "${resp.chartType}" not in [${expect.chartTypeIn.join(', ')}]`);
  }
  const rows = resp.rowCount ?? resp.data?.length ?? 0;
  if (expect.minRows != null && rows < expect.minRows) {
    reasons.push(`rowCount ${rows} < minRows ${expect.minRows}`);
  }
  if (expect.maxRows != null && rows > expect.maxRows) {
    reasons.push(`rowCount ${rows} > maxRows ${expect.maxRows}`);
  }
  return reasons;
}

async function main() {
  const selected = categoryFilter ? cases.filter((c) => c.category === categoryFilter) : cases;
  if (selected.length === 0) {
    console.error(`No cases for category "${categoryFilter}". Categories: ${[...new Set(cases.map((c) => c.category))].join(', ')}`);
    process.exit(1);
  }

  console.log(`\nRunning ${selected.length} eval case(s) against ${BASE_URL}${categoryFilter ? ` [category: ${categoryFilter}]` : ''}\n`);

  // Log in once per distinct role used by the selected cases. A failed login
  // skips that role's cases (rotated password) rather than aborting the run —
  // unless ALL logins fail, which means the server is down.
  const cookies = {};
  const rolesNeeded = [...new Set(selected.map((c) => c.role))];
  for (const role of rolesNeeded) {
    try {
      cookies[role] = await login(role);
    } catch (e) {
      console.warn(`⚠ Skipping role "${role}" — ${e.message}`);
      console.warn(`  (Set EVAL_${role.toUpperCase()}_PW=... to supply the real password.)`);
    }
  }
  if (Object.keys(cookies).length === 0) {
    console.error('\n✗ No roles could log in. Is the server running on ' + BASE_URL + '? Start it with `npm start`.');
    process.exit(1);
  }

  const stats = {}; // category -> {pass, total, gapPass, gapTotal}
  const failures = [];
  let skipped = 0;

  for (const c of selected) {
    if (!cookies[c.role]) {
      skipped++;
      console.log(`∅ [${c.category}] ${c.id} — skipped (no login for role "${c.role}")`);
      continue;
    }
    const resp = await chat(cookies[c.role], c.query);
    const reasons = checkExpectations(resp, c.expect);
    const pass = reasons.length === 0;

    const s = (stats[c.category] ||= { pass: 0, total: 0, gapPass: 0, gapTotal: 0 });
    s.total++;
    if (pass) s.pass++;
    if (c.knownGap) { s.gapTotal++; if (pass) s.gapPass++; }

    const tag = c.knownGap ? ' (known-gap)' : '';
    console.log(`${pass ? '✓' : '✗'} [${c.category}] ${c.id}${tag}`);
    if (!pass) {
      failures.push({ id: c.id, reasons });
      reasons.forEach((r) => console.log(`    - ${r}`));
    }
  }

  console.log('\n──────── Summary by category ────────');
  let totPass = 0, tot = 0;
  for (const [cat, s] of Object.entries(stats)) {
    totPass += s.pass; tot += s.total;
    const gap = s.gapTotal ? `  (known-gap ${s.gapPass}/${s.gapTotal})` : '';
    console.log(`  ${cat.padEnd(14)} ${s.pass}/${s.total}  ${Math.round((s.pass / s.total) * 100)}%${gap}`);
  }
  const overall = tot ? Math.round((totPass / tot) * 100) : 0;
  console.log('─────────────────────────────────────');
  console.log(`  OVERALL        ${totPass}/${tot}  ${overall}%   (gate: 90%)`);
  if (skipped) console.log(`  (${skipped} case(s) skipped — role login unavailable)`);
  console.log('');

  // Gate on cases actually run, excluding known-gap cases (the baseline we
  // expect to stay red until the registry absorbs them) and skipped cases.
  let nonGapPass = 0, nonGapTotal = 0;
  for (const s of Object.values(stats)) {
    nonGapPass  += s.pass  - s.gapPass;
    nonGapTotal += s.total - s.gapTotal;
  }
  const nonGapPct = nonGapTotal ? Math.round((nonGapPass / nonGapTotal) * 100) : 0;
  console.log(`  Excluding known-gaps: ${nonGapPass}/${nonGapTotal}  ${nonGapPct}%   (gate: 90%)\n`);
  process.exit(nonGapTotal > 0 && nonGapPct >= 90 ? 0 : 1);
}

main().catch((e) => {
  console.error('Eval runner crashed:', e);
  process.exit(1);
});
