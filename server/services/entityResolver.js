/**
 * Entity Resolver: Pre-query string normalization and value matching
 *
 * Purpose: Resolve user's natural language terms (e.g., "iluminacion") to exact
 * database values (e.g., "Iluminación") BEFORE calling the LLM.
 *
 * This approach:
 * - Handles accents automatically (normalize both sides, compare)
 * - Works for all dimension columns (families, supervisors, provinces, categories)
 * - Scales automatically when DB values change (no prompt updates needed)
 * - Reduces LLM burden from "know exact values" to "generate SQL structure"
 */

// Normalize: lowercase + strip accents using Unicode NFD decomposition
function normalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  const resolved = [];

  // Define which metadata columns to match against
  const dimensions = [
    { column: 'ItmsgrpName',        values: metadata.grupos      || [] },
    { column: 'SubFamiliaName',     values: metadata.subfamilias || [] },
    { column: 'Categoria',          values: metadata.categorias  || [] },
    { column: 'ProvinciaPrincipal', values: metadata.provincias  || [] },
    { column: 'NombreSupervisor',   values: metadata.supervisores|| [] },
  ];

  // For each dimension, try to find matches in the user's query
  for (const dim of dimensions) {
    for (const value of dim.values) {
      if (!value || value.length < 3) continue; // Skip null/empty and very short strings

      const normalizedValue = normalize(value);
      // Check if this DB value's normalized form appears in the query
      if (normalizedQuery.includes(normalizedValue)) {
        resolved.push({
          column: dim.column,
          exactValue: value  // Return the exact DB value, not the normalized version
        });
      }
    }
  }

  return resolved;
}
