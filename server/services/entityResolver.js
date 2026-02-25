/**
 * Entity Resolver: Pre-query string normalization and value matching
 *
 * Purpose: Resolve user's natural language terms (e.g., "iluminacion") to exact
 * database values (e.g., "Iluminación") BEFORE calling the LLM.
 *
 * Matching strategy (in priority order):
 * 1. Exact substring match (normalized) — fastest, highest confidence
 * 2. Person-name word match — "Ronny" matches "Ronny Marcillo"
 * 3. Fuzzy match (Levenshtein) — catches typos like "iluminasion" → "Iluminación"
 */

// Normalize: lowercase + strip accents using Unicode NFD decomposition
function normalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Levenshtein distance (space-optimized, single-row DP)
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  // Early exit if length difference alone exceeds any useful threshold
  if (Math.abs(m - n) > 3) return Math.abs(m - n);
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

// Max edit distance allowed for a word of given length
// Short words are risky — require exact match to avoid false positives
function fuzzyThreshold(len) {
  if (len < 5) return 0;  // "foco", "led" → exact only
  if (len < 8) return 1;  // "cables" → 1 edit
  return 2;               // "iluminasion" → 2 edits
}

// Split a query into searchable content words (strip punctuation, skip stop words)
const STOP_WORDS = new Set([
  'de', 'el', 'la', 'los', 'las', 'en', 'a', 'y', 'o', 'que', 'por',
  'para', 'con', 'me', 'te', 'se', 'nos', 'le', 'un', 'una', 'del', 'al',
  'es', 'son', 'fue', 'ser', 'hacer', 'ventas', 'venta', 'mes', 'ano',
  'quiero', 'dame', 'dime', 'muestra', 'cuanto', 'cuantos', 'mostrar',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre', 'top', 'ranking',
  'total', 'suma', 'promedio', 'por', 'favor', 'comparar', 'entre',
]);

function queryWords(normalizedQuery) {
  return normalizedQuery
    .replace(/[¿?¡!,.()\[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * Scan user query and match terms to exact database values
 * @param {string} query - User's natural language query
 * @param {object} metadata - Result from dataService.getMetadata()
 * @returns {array} Array of {column, exactValue} for resolved entities
 */
export function resolveEntities(query, metadata) {
  if (!query || !metadata) return [];

  const normalizedQuery = normalize(query);
  const words = queryWords(normalizedQuery);
  const resolved = [];

  // Track what we've already added (column → Set of exactValues) to avoid duplicates
  const seen = {};

  const addMatch = (column, exactValue) => {
    if (!seen[column]) seen[column] = new Set();
    if (seen[column].has(exactValue)) return;
    seen[column].add(exactValue);
    resolved.push({ column, exactValue });
  };

  // Define which metadata columns to match against
  const dimensions = [
    { column: 'ItmsgrpName',        values: metadata.grupos          || [], isPersonName: false },
    { column: 'SubFamiliaName',     values: metadata.subfamilias     || [], isPersonName: false },
    { column: 'Categoria',          values: metadata.categorias      || [], isPersonName: false },
    { column: 'Categoria_SN',       values: metadata.categoria_sn    || [], isPersonName: false },
    { column: 'SubCategoria_SN',    values: metadata.subcategoria_sn || [], isPersonName: false },
    { column: 'ProvinciaPrincipal', values: metadata.provincias      || [], isPersonName: false },
    { column: 'NombreSupervisor',   values: metadata.supervisores    || [], isPersonName: true  },
    { column: 'NombreVendedor',     values: metadata.vendedores      || [], isPersonName: true  },
  ];

  for (const dim of dimensions) {
    for (const value of dim.values) {
      if (!value || value.length < 3) continue;

      const normalizedValue = normalize(value);

      // ── Priority 1: Exact substring match ──────────────────────────────────
      if (normalizedQuery.includes(normalizedValue)) {
        addMatch(dim.column, value);
        continue;
      }

      // ── Priority 2: Person-name word match ─────────────────────────────────
      // "Ronny" in query matches "Ronny Marcillo" in DB
      if (dim.isPersonName) {
        const nameParts = normalizedValue.split(/\s+/);
        let matched = false;
        for (const part of nameParts) {
          if (part.length < 3) continue;
          if (normalizedQuery.includes(part)) {
            addMatch(dim.column, value);
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }

      // ── Priority 3: Fuzzy match (Levenshtein) ──────────────────────────────
      // Compare each query word against each word in the DB value
      const valueWords = normalizedValue.split(/\s+/).filter(w => w.length >= 4);

      for (const qw of words) {
        const threshold = fuzzyThreshold(qw.length);
        if (threshold === 0) continue; // short word — skip fuzzy

        for (const vw of valueWords) {
          // Only compare words of similar length (heuristic to cut computation)
          if (Math.abs(qw.length - vw.length) > threshold) continue;

          const dist = levenshtein(qw, vw);
          if (dist <= threshold && dist > 0) { // dist > 0 means not already caught by exact match above
            addMatch(dim.column, value);
            break;
          }
        }
        if (seen[dim.column]?.has(value)) break; // already matched, skip remaining words
      }
    }
  }

  return resolved;
}
