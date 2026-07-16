// Canonical metric registry (semantic layer).
//
// Single source of truth for the recurring business metrics this app uses.
// Before this module, each metric's SQL was re-derived ad-hoc inside the LLM
// system prompt and duplicated across the margin guards in chatController.js.
// That scattering is what the "self-service analytics" blog calls the
// prompt-stacking anti-pattern: every new phrasing needed another prompt
// example, and the margin keyword/pattern lists drifted out of sync.
//
// Now: define each metric ONCE here with its exact SQL expression and a
// `requiresMarginAccess` flag. The system prompt renders these by name, and
// the margin guards derive their keyword/pattern lists from the same data —
// so margin protection and metric definitions can never disagree.
//
// To add a metric: append to METRICS. To change a formula: edit it here only.

/**
 * @typedef {Object} Metric
 * @property {string}   id                  Stable identifier (kebab/snake).
 * @property {string}   label               Human label / suggested column alias.
 * @property {string[]} aliases             Natural-language terms that map to this metric.
 * @property {string}   sql                 Exact DuckDB aggregate expression (no alias).
 * @property {string}   description         One-line description shown to the LLM.
 * @property {boolean}  requiresMarginAccess True if the metric exposes cost/margin data.
 * @property {string}  [note]               Optional gotcha / anti-pattern reminder.
 */

/** @type {Metric[]} */
export const METRICS = [
  {
    id: 'ventas',
    label: 'Total_Ventas',
    aliases: ['ventas', 'ingresos', 'facturación', 'total vendido', 'venta total'],
    sql: 'SUM(LineTotal)',
    description: 'Ventas / ingresos totales en dólares.',
    requiresMarginAccess: false,
  },
  {
    id: 'unidades',
    label: 'Unidades',
    aliases: ['unidades', 'cantidad vendida', 'volumen', 'piezas'],
    sql: 'SUM(Quantity)',
    description: 'Unidades vendidas.',
    requiresMarginAccess: false,
    note: 'Alias "Unidades" o "Unidades_Vendidas", NUNCA "Cantidad_Total".',
  },
  {
    id: 'facturas',
    label: 'Facturas',
    aliases: ['facturas', 'documentos', 'número de facturas', 'pedidos', 'transacciones'],
    sql: 'COUNT(DISTINCT DocNum)',
    description: 'Número de facturas / documentos únicos.',
    requiresMarginAccess: false,
  },
  {
    id: 'ticket_promedio',
    label: 'Ticket_Promedio',
    aliases: ['ticket promedio', 'valor promedio por factura', 'compra promedio'],
    sql: 'ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0), 2)',
    description: 'Valor promedio por factura (no por línea).',
    requiresMarginAccess: false,
    note: 'NUNCA uses AVG(LineTotal) (promedio por línea) ni SUM(LineTotal)/COUNT(*) (cuenta líneas).',
  },
  {
    id: 'precio_promedio',
    label: 'Precio_Promedio',
    aliases: ['precio promedio', 'precio de venta promedio', 'ASP'],
    sql: 'ROUND(SUM(LineTotal) / NULLIF(SUM(Quantity), 0), 2)',
    description: 'Precio de venta promedio ponderado por cantidad.',
    requiresMarginAccess: false,
  },
  {
    id: 'descuento_pct',
    label: 'DescuentoPct',
    aliases: ['descuento', 'descuento promedio', 'precio lista vs venta'],
    sql: 'ROUND((PriceBefDi - Price) / NULLIF(PriceBefDi, 0) * 100, 2)',
    description: 'Descuento efectivo (precio lista vs. precio de venta), en %.',
    requiresMarginAccess: false,
    note: 'Para promedio por dimensión, envuelve en AVG(...).',
  },
  // ---- Margin-restricted metrics (hidden from users without canViewMargin) ----
  {
    id: 'margen',
    label: 'Margen',
    aliases: ['margen', 'rentabilidad', 'margen bruto'],
    sql: 'ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2)',
    description: 'Margen bruto en %.',
    requiresMarginAccess: true,
    note: 'Usa esta fórmula, NO la columna Margen. Excluye LineTotal <= 0.',
  },
  {
    id: 'utilidad',
    label: 'Utilidad',
    aliases: ['utilidad', 'ganancia', 'margen absoluto'],
    sql: 'SUM(LineTotal) - SUM(LineCost)',
    description: 'Utilidad / ganancia bruta absoluta en dólares.',
    requiresMarginAccess: true,
  },
  {
    id: 'costo',
    label: 'Costo',
    aliases: ['costo', 'costos'],
    sql: 'SUM(LineCost)',
    description: 'Costo total de la mercadería vendida.',
    requiresMarginAccess: true,
  },
];

// --- Precomputed once at module load (the registry is a compile-time constant) ---
const stripAccents = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const squashSql = (s) => s.replace(/\s+/g, '').toUpperCase();

// Margin/cost intent keywords: leading token of each margin-metric alias, accent-free.
const MARGIN_INTENT_KEYWORDS = [...new Set(
  METRICS.filter((m) => m.requiresMarginAccess).flatMap((m) => m.aliases.map((a) => stripAccents(a).split(' ')[0]))
)];

// SQL guard: any LineCost reference covers every margin metric (they all SUM(LineCost)).
const MARGIN_SQL_PATTERNS = [/LINECOST/];

// Squashed metric expressions for whitespace/case-insensitive provenance matching.
const SQUASHED_METRICS = METRICS.map((m) => ({ label: m.label, sql: squashSql(m.sql) }));

/**
 * Natural-language keywords that signal margin/cost intent, derived from the
 * margin-restricted metrics so the pre-LLM intent check stays in sync with the
 * registry. Accent-free + lowercase to match the caller's normalized query.
 * @returns {string[]}
 */
export function getMarginIntentKeywords() {
  return MARGIN_INTENT_KEYWORDS;
}

/**
 * Regex patterns that detect margin/cost access in generated SQL (matched
 * against UPPERCASED SQL).
 * @returns {RegExp[]}
 */
export function getMarginSqlPatterns() {
  return MARGIN_SQL_PATTERNS;
}

/**
 * Metrics visible to a user given their margin permission.
 * @param {boolean} canViewMargin
 * @returns {Metric[]}
 */
export function getVisibleMetrics(canViewMargin) {
  return canViewMargin === false ? METRICS.filter((m) => !m.requiresMarginAccess) : METRICS;
}

/**
 * Identify which canonical metrics appear in a generated SQL string. Used for
 * provenance: if a query's SQL contains a registry metric's exact expression,
 * the answer came from the semantic layer (and we can name the metric);
 * otherwise it's free-form raw SQL. Whitespace-insensitive, case-insensitive.
 * @param {string} sql
 * @returns {string[]} labels of matched metrics (e.g. ['Total_Ventas', 'Margen'])
 */
export function detectMetricsInSql(sql) {
  if (!sql) return [];
  const norm = squashSql(sql);
  return SQUASHED_METRICS.filter((m) => norm.includes(m.sql)).map((m) => m.label);
}

/**
 * Render the canonical metric definitions as a system-prompt block. Margin
 * metrics are omitted entirely when the user lacks access, matching the
 * existing schema-column filtering.
 * @param {boolean} canViewMargin
 * @returns {string}
 */
export function renderMetricsForPrompt(canViewMargin) {
  const visible = getVisibleMetrics(canViewMargin);
  const lines = visible.map((m) => {
    const note = m.note ? `  (${m.note})` : '';
    return `- ${m.description} → ${m.sql} AS ${m.label}${note}`;
  });
  return `MÉTRICAS CANÓNICAS (usa SIEMPRE estas definiciones exactas; NO inventes fórmulas alternativas):
${lines.join('\n')}
- Todos los montos están en DÓLARES ($). Los rangos de fecha personalizados y los JOIN estándar YA están soportados por estas métricas — no las evites por ese motivo.`;
}
