import dataService from '../services/dataService.js';
import llmService from '../services/llmService.js';
import { userService } from '../services/userService.js';
import { resolveEntities } from '../services/entityResolver.js';

// Apply explicit chart type request if LLM missed the userExplicitRequest flag.
// Mirrors the phrasing list from the system prompt so both sources stay in sync.
function applyExplicitChartRequest(query, llmResponse) {
  if (!llmResponse?.chartConfig || llmResponse.chartConfig.userExplicitRequest) return;

  const msgLower = query.toLowerCase();
  const checks = [
    {
      type: 'table',
      phrases: [
        'en una tabla', 'en tabla', 'como tabla', 'formato tabla', 'quiero tabla',
        'quiero una tabla', 'muéstrame en tabla', 'muéstrame como tabla', 'dame una tabla',
        'en formato de tabla', 'tabla detallada', 'en formato tabla', 'detalle', 'detalle por',
        'listado', 'listado de', 'a que clientes', 'a que productos', 'a que provincias',
        'por cada cliente', 'para cada cliente', 'de cada cliente', 'cuales son los clientes',
        'lista de clientes', 'quiénes son los clientes', 'quienes son los clientes'
      ]
    },
    { type: 'bar',  phrases: ['en barras', 'en un gráfico de barras', 'gráfico de barras', 'como barras', 'en forma de barras'] },
    { type: 'line', phrases: ['en líneas', 'en un gráfico de líneas', 'gráfico de líneas', 'como líneas'] },
    { type: 'pie',  phrases: ['en pie', 'pie chart', 'gráfico circular', 'gráfico de pastel', 'como pastel'] },
    { type: 'area', phrases: ['en un gráfico de área', 'gráfico de área', 'en área', 'como área', 'en areas', 'en áreas', 'en un gráfico de areas', 'gráfico de areas'] },
  ];

  for (const { type, phrases } of checks) {
    if (phrases.some(p => msgLower.includes(p))) {
      llmResponse.chartType = type;
      llmResponse.chartConfig.userExplicitRequest = true;
      return;
    }
  }
}

// Detect if a query mentions an ambiguous vendedor first name (matches multiple people)
function detectAmbiguousVendedor(query, vendedores) {
  const firstNameMap = {};
  for (const name of vendedores) {
    const firstName = name.split(' ')[0].toLowerCase();
    if (!firstNameMap[firstName]) firstNameMap[firstName] = [];
    firstNameMap[firstName].push(name);
  }
  const stopWords = new Set([
    'de', 'el', 'la', 'los', 'las', 'en', 'a', 'y', 'o', 'que', 'por',
    'para', 'con', 'me', 'te', 'se', 'nos', 'le', 'un', 'una', 'del', 'al',
    'es', 'son', 'fue', 'ser', 'hacer', 'ventas', 'mes', 'año', 'clientes',
    'quiero', 'dame', 'dime', 'muestra', 'cuanto', 'cuantos', 'enero',
    'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'
  ]);
  const queryLower = query.toLowerCase();
  const words = queryLower.replace(/[¿?¡!,]/g, '').split(/\s+/);
  for (const word of words) {
    if (word.length < 3 || stopWords.has(word)) continue;
    if (firstNameMap[word] && firstNameMap[word].length > 1) {
      // If a full name from the matches already appears in the query, it's already disambiguated
      const alreadyDisambiguated = firstNameMap[word].some(fullName =>
        queryLower.includes(fullName.toLowerCase())
      );
      if (alreadyDisambiguated) continue;
      const display = word.charAt(0).toUpperCase() + word.slice(1);
      return {
        searchTerm: word,
        matches: firstNameMap[word],
        question: `Encontré ${firstNameMap[word].length} vendedores con el nombre "${display}". ¿A cuál de estos te refieres?`
      };
    }
  }
  return null;
}

// Helper to save query to history
function saveToHistory(userId, query) {
  try {
    if (userId && query) {
      userService.saveQueryHistory(userId, query);
    }
  } catch (error) {
    console.error('Error saving to history:', error);
  }
}

// Check if user's QUERY INTENT is to access margin data (keywords in user's question)
function checkMarginQueryIntent(query, canViewMargin) {
  if (canViewMargin === true) return null;

  // Normalize query: lowercase + remove accents to catch variations
  const queryLower = query.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const marginKeywords = ['margen', 'ganancia', 'utilidad', 'rentabilidad'];

  for (const keyword of marginKeywords) {
    if (queryLower.includes(keyword)) {
      return {
        error: 'No tienes permiso para acceder a información de margen de venta',
        suggestion: 'Consulta a tu gerente o supervisor para acceso a datos de rentabilidad'
      };
    }
  }
  return null;
}

// Auto-relax overly restrictive SQL when a query returns 0 rows.
// Returns a modified SQL string, or null if no relaxation was possible.
function relaxSQL(sql) {
  let relaxed = sql;
  let changed = false;

  // 1. Remove filters on LEFT JOINed aliases that kill the LEFT JOIN
  //    (e.g. AND vs.TotalVenta > 0, AND vs.Column IS NOT NULL)
  const leftJoinAliases = [...sql.matchAll(/LEFT\s+JOIN\s+\w+\s+(\w+)\s+ON/gi)].map(m => m[1]);
  for (const alias of leftJoinAliases) {
    const pattern = new RegExp(`\\s+AND\\s+${alias}\\.\\w+\\s*(?:>\\s*\\d+|>=\\s*\\d+|IS\\s+NOT\\s+NULL)`, 'gi');
    const newSQL = relaxed.replace(pattern, '');
    if (newSQL !== relaxed) { relaxed = newSQL; changed = true; }
  }

  // 2. Remove date filters inside CTE bodies (keep outer WHERE intact)
  //    These are often injected by the LLM but over-restrict comparison/projection queries
  const cteMatch = relaxed.match(/^(WITH[\s\S]+?\)\s*)(SELECT[\s\S]+)$/i);
  if (cteMatch) {
    let ctePart = cteMatch[1];
    const selectPart = cteMatch[2];
    const yearFilter = /\s+AND\s+(?:YEAR\(\w+\)|EXTRACT\(YEAR\s+FROM\s+\w+\))\s*=\s*\d{4}/gi;
    const dateRangeFilter = /\s+AND\s+\w*Fecha\w*\s*(?:>=|<=|>|<)\s*'[^']+'/gi;
    const newCTE = ctePart.replace(yearFilter, '').replace(dateRangeFilter, '');
    if (newCTE !== ctePart) { relaxed = newCTE + selectPart; changed = true; }
  }

  return changed ? relaxed : null;
}

// Check if SQL query attempts to access margin/cost data (forbidden for vendors and supervisors)
function checkMarginAccess(sql, canViewMargin) {
  if (canViewMargin === true) return null; // Admin/gerente can view all data

  const sqlUpper = sql.toUpperCase();

  // Only block actual margin calculations or explicit cost data access
  // Allow queries that just select sales/quantity data
  const forbiddenPatterns = [
    /LINECOST/,  // Any reference to LineCost column
    /\(SUM\(LINETOTAL\)\s*-\s*SUM\(LINECOST\)\)/,  // Margin formula: (SUM(LineTotal) - SUM(LineCost))
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(sqlUpper)) {
      return {
        error: 'No tienes permiso para acceder a información de margen de venta',
        suggestion: 'Consulta a tu gerente o supervisor para acceso a datos de rentabilidad'
      };
    }
  }

  return null;
}

export async function handleChat(req, res) {
  // Track if client disconnected (e.g., Ctrl+R refresh)
  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableFinished) {
      clientDisconnected = true;
    }
  });

  const safeSend = (data, status = 200) => {
    if (clientDisconnected || res.headersSent) return;
    try {
      res.status(status).json(data);
    } catch (e) {
      console.error('Error sending response (client likely disconnected):', e.message);
    }
  };

  // --- Query Logging setup ---
  const startTime = Date.now();
  const logData = {
    user_id:           req.user?.id       ?? null,
    username:          req.user?.username ?? null,
    user_query:        '',
    resolved_entities: null,
    result_type:       'error',  // default; overwritten at each return path
    llm_sql:           null,
    llm_chart_type:    null,
    llm_chart_config:  null,
    llm_explanation:   null,
    llm_raw_response:  null,
    error_message:     null,
    result_row_count:  null,
    duration_ms:       null,
    date_filter:       null
  };

  try {
    const { query, conversationHistory = [], dateFilter = null } = req.body;

    logData.user_query  = query || '';
    logData.date_filter = dateFilter;

    if (!query || typeof query !== 'string') {
      logData.result_type   = 'validation_error';
      logData.error_message = 'Query is required';
      return safeSend({ error: 'Query is required' }, 400);
    }

    // Get user's filter context based on their role
    const userFilter = req.user ? userService.getFilterContext(req.user) : { filter: null, description: null };

    // Block margin queries BEFORE reaching LLM (user intent pre-check)
    // This prevents LLM from inventing alternative margin calculations
    const intentError = checkMarginQueryIntent(query, userFilter?.canViewMargin);
    if (intentError) {
      logData.result_type   = 'blocked';
      logData.error_message = intentError.error;
      return safeSend({
        type: 'error',
        message: intentError.error,
        suggestion: intentError.suggestion
      });
    }

    // Get metadata for context
    const metadata = await dataService.getMetadata();

    // Get vendedores active in the relevant year (not all historical data since 2016)
    const filterYear = dateFilter?.range?.start
      ? new Date(dateFilter.range.start).getFullYear()
      : new Date().getFullYear();
    const vendedoresForYear = await dataService.getVendedoresByYear(filterYear);

    // Check for ambiguous vendedor name before calling LLM
    const ambiguous = detectAmbiguousVendedor(query, vendedoresForYear);
    if (ambiguous) {
      logData.result_type = 'clarification';
      return safeSend({
        type: 'clarification',
        question: ambiguous.question,
        matches: ambiguous.matches,
        searchTerm: ambiguous.searchTerm,
        originalQuery: query
      });
    }

    // Resolve entity references (e.g., "iluminacion" → "Iluminación") before calling LLM
    const resolvedEntities = resolveEntities(query, metadata);
    if (resolvedEntities && resolvedEntities.length > 0) {
      logData.resolved_entities = resolvedEntities;
    }

    // Process query with LLM (including conversation history, date filter, and user filter for context)
    const llmResponse = await llmService.processQuery(query, metadata, conversationHistory, dateFilter, userFilter, resolvedEntities);
    if (clientDisconnected) return;

    // Apply explicit chart type override if LLM missed the userExplicitRequest flag
    applyExplicitChartRequest(query, llmResponse);

    if (llmResponse.error) {
      logData.result_type   = 'error';
      logData.error_message = llmResponse.error;
      logData.llm_raw_response = llmResponse;
      return safeSend({
        type: 'error',
        message: llmResponse.error,
        suggestion: llmResponse.suggestion
      });
    }

    // Capture LLM response fields (common to all non-error paths)
    logData.llm_raw_response = llmResponse;
    logData.llm_sql          = llmResponse.sql          ?? null;
    logData.llm_chart_type   = llmResponse.chartType    ?? null;
    logData.llm_chart_config = llmResponse.chartConfig  ?? null;
    logData.llm_explanation  = llmResponse.explanation  ?? llmResponse.message ?? null;

    // Handle CONVERSATIONAL responses (no SQL needed)
    if (llmResponse.type === 'conversational') {
      logData.result_type      = 'conversational';
      logData.result_row_count = 0;
      saveToHistory(req.user?.id, query);
      return safeSend({
        type: 'conversational',
        message: llmResponse.message,
        explanation: llmResponse.message
      });
    }

    // Handle MULTIPLE queries
    if (llmResponse.multiple && llmResponse.queries && llmResponse.queries.length > 0) {
      const results = [];

      for (const queryItem of llmResponse.queries) {
        if (clientDisconnected) break;

        // Check margin access restrictions for each query
        const marginCheckError = checkMarginAccess(queryItem.sql, userFilter?.canViewMargin);
        if (marginCheckError) {
          logData.result_type   = 'blocked';
          logData.error_message = marginCheckError.error;
          return safeSend({
            type: 'error',
            message: marginCheckError.error,
            suggestion: marginCheckError.suggestion
          });
        }

        let queryData;
        let querySQL = queryItem.sql;
        try {
          queryData = await dataService.executeQuery(querySQL);
        } catch (sqlError) {
          console.error('SQL Error in multi-query (attempt 1):', sqlError.message);
          const fixedSQL = await llmService.fixSQL(query, querySQL, sqlError.message);
          if (fixedSQL) {
            try {
              queryData = await dataService.executeQuery(fixedSQL);
              querySQL = fixedSQL;
              console.log('SQL auto-corrected successfully (multi-query)');
            } catch (retryError) {
              console.error('SQL Error in multi-query (attempt 2):', retryError.message);
              results.push({ error: true, message: 'Error ejecutando la consulta' });
              continue;
            }
          } else {
            results.push({ error: true, message: 'Error ejecutando la consulta' });
            continue;
          }
        }
        {
          const data = queryData;
          if (clientDisconnected) break;

          // Auto-relax SQL if 0 rows returned
          if (!data || data.length === 0) {
            const relaxedSQL = relaxSQL(querySQL);
            if (relaxedSQL) {
              try {
                console.log('[RelaxSQL] Retrying multi-query with relaxed filters');
                const relaxedData = await dataService.executeQuery(relaxedSQL);
                if (relaxedData && relaxedData.length > 0) {
                  data = relaxedData;
                  querySQL = relaxedSQL;
                  console.log(`[RelaxSQL] Multi-query success: ${relaxedData.length} rows`);
                }
              } catch (e) {
                console.log('[RelaxSQL] Multi-query retry failed:', e.message);
              }
            }
          }

          // Skip empty results - don't add to carousel if no data
          if (!data || data.length === 0) continue;

          // For profile queries: override NombreVendedor with current assignment via SlpCode
          // (sales history may contain old vendors; clients.SlpCode has the current assignment)
          if (queryItem.chartType === 'profile' && data.length > 0 && dataService.hasClients) {
            const cardCode = data[0].CardCode;
            if (cardCode) {
              try {
                const vendorRows = await dataService.executeQuery(
                  `SELECT DISTINCT NombreVendedor FROM sales WHERE Slpcode = (SELECT SlpCode FROM clients WHERE CardCode = '${cardCode.replace(/'/g, "''")}' LIMIT 1) LIMIT 1`
                );
                if (vendorRows.length > 0 && vendorRows[0].NombreVendedor) {
                  data[0].NombreVendedor = vendorRows[0].NombreVendedor;
                }
              } catch (e) { /* silent — keep sales vendor as fallback */ }
            }
          }

          const analysis = data && data.length > 0
            ? await llmService.analyzeResults(query, data, queryItem.chartConfig)
            : null;

          results.push({
            data,
            chartType: queryItem.chartType,
            chartConfig: queryItem.chartConfig,
            explanation: queryItem.explanation,
            analysis,
            sql: querySQL,
            rowCount: data.length
          });
        }
      }

      if (clientDisconnected) return;

      // If all multi-queries returned empty results, show a helpful message
      if (results.length === 0) {
        logData.result_type      = 'empty';
        logData.result_row_count = 0;
        logData.llm_sql          = llmResponse.queries?.[0]?.sql ?? null;
        logData.llm_chart_type   = llmResponse.queries?.[0]?.chartType ?? null;
        saveToHistory(req.user?.id, query);
        return safeSend({
          type: 'conversational',
          message: 'No se encontraron datos para ninguna de las consultas. Es posible que el período solicitado no tenga registros disponibles.',
          explanation: 'Sin resultados'
        });
      }

      logData.result_type      = 'multi';
      logData.result_row_count = results.reduce((sum, r) => sum + (r.rowCount || 0), 0);
      logData.llm_sql          = llmResponse.queries?.[0]?.sql ?? null;
      logData.llm_chart_type   = llmResponse.queries?.[0]?.chartType ?? null;
      saveToHistory(req.user?.id, query);

      if (results.length > 0) {
        const last = results[results.length - 1];
        last.followUps = await llmService.generateFollowUps(query, last.data, last.chartConfig);
      }

      return safeSend({
        type: 'multi',
        results,
        totalQueries: results.length
      });
    }

    // Handle SINGLE query (original behavior)

    // Check margin access restrictions for vendors and supervisors
    const marginCheckError = checkMarginAccess(llmResponse.sql, userFilter?.canViewMargin);
    if (marginCheckError) {
      logData.result_type   = 'blocked';
      logData.error_message = marginCheckError.error;
      return safeSend({
        type: 'error',
        message: marginCheckError.error,
        suggestion: marginCheckError.suggestion
      });
    }

    let data;
    let finalSQL = llmResponse.sql;
    try {
      data = await dataService.executeQuery(finalSQL);
    } catch (sqlError) {
      console.error('SQL Error (attempt 1):', sqlError.message);
      const fixedSQL = await llmService.fixSQL(query, finalSQL, sqlError.message);
      if (fixedSQL) {
        try {
          data = await dataService.executeQuery(fixedSQL);
          finalSQL = fixedSQL;
          console.log('SQL auto-corrected successfully');
        } catch (retryError) {
          console.error('SQL Error (attempt 2):', retryError.message);
          logData.result_type   = 'error';
          logData.error_message = retryError.message;
          return safeSend({
            type: 'error',
            message: 'Error ejecutando la consulta. Por favor intenta reformular tu pregunta.'
          });
        }
      } else {
        logData.result_type   = 'error';
        logData.error_message = sqlError.message;
        return safeSend({
          type: 'error',
          message: 'Error ejecutando la consulta. Por favor intenta reformular tu pregunta.'
        });
      }
    }

    if (clientDisconnected) return;

    // Auto-relax SQL if 0 rows returned
    if ((!data || data.length === 0) && finalSQL) {
      const relaxedSQL = relaxSQL(finalSQL);
      if (relaxedSQL) {
        try {
          console.log('[RelaxSQL] Retrying with relaxed filters');
          const relaxedData = await dataService.executeQuery(relaxedSQL);
          if (relaxedData && relaxedData.length > 0) {
            data = relaxedData;
            finalSQL = relaxedSQL;
            console.log(`[RelaxSQL] Success: ${relaxedData.length} rows`);
          }
        } catch (e) {
          console.log('[RelaxSQL] Retry failed:', e.message);
          // Fall through to original "no data" response
        }
      }
    }

    // If no data found, return a helpful message with the SQL so user can debug
    if (!data || data.length === 0) {
      logData.result_type      = 'empty';
      logData.result_row_count = 0;
      saveToHistory(req.user?.id, query);
      return safeSend({
        type: 'conversational',
        message: 'No se encontraron datos para esta consulta. Es posible que el período solicitado no tenga registros disponibles o que el filtro activo no incluya ese rango de fechas.',
        explanation: 'Sin resultados',
        sql: finalSQL  // Include SQL so user can debug what was queried
      });
    }

    // Analyze the results
    let analysis = null;
    if (data && data.length > 0) {
      analysis = await llmService.analyzeResults(query, data, llmResponse.chartConfig);
    }

    const followUps = await llmService.generateFollowUps(query, data, llmResponse.chartConfig);

    if (clientDisconnected) return;

    // Save to history on successful query
    logData.result_type      = 'success';
    logData.result_row_count = data.length;
    saveToHistory(req.user?.id, query);

    // Format response
    safeSend({
      type: 'success',
      data: data,
      chartType: llmResponse.chartType,
      chartConfig: llmResponse.chartConfig,
      explanation: llmResponse.explanation,
      analysis: analysis,
      followUps,
      sql: finalSQL,
      rowCount: data.length
    });

  } catch (error) {
    console.error('Chat Error:', error);
    logData.result_type   = 'error';
    logData.error_message = error.message;
    safeSend({
      type: 'error',
      message: 'Error interno del servidor',
      details: error.message
    }, 500);
  } finally {
    logData.duration_ms = Date.now() - startTime;
    setImmediate(() => {
      try { userService.saveQueryLog(logData); } catch (e) { /* silent */ }
    });
  }
}

export async function getMetadata(req, res) {
  try {
    const metadata = await dataService.getMetadata();
    res.json(metadata);
  } catch (error) {
    console.error('Metadata Error:', error);
    res.status(500).json({
      error: 'Error loading metadata',
      details: error.message
    });
  }
}

export async function getSuggestedQueries(req, res) {
  // Get user's margin access permission
  const userFilter = req.user ? userService.getFilterContext(req.user) : { canViewMargin: true };

  let queries = [
    { text: 'Mostrar ventas por mes', category: 'Tendencias' },
    { text: 'Top 10 vendedores', category: 'Rankings' },
    { text: 'Ventas por categoría', category: 'Análisis' },
    { text: 'Ventas por provincia', category: 'Geografía' },
    { text: 'Productos más vendidos', category: 'Productos' },
    { text: 'Tendencia de los últimos 6 meses', category: 'Tendencias' },
    { text: 'Distribución de ventas por categoría', category: 'Análisis' },
    { text: 'Top 20 clientes', category: 'Clientes' },
    { text: 'Ventas totales', category: 'Resumen' },
    { text: 'Comparativo año actual vs anterior', category: 'Comparativo' },
    { text: 'Unidades vendidas por mes', category: 'Inventario' }
  ];

  // Only show Rentabilidad queries if user has margin access
  if (userFilter.canViewMargin === true) {
    queries.push({ text: 'Margen promedio por supervisor', category: 'Rentabilidad' });
  }

  // Visit planning and risk suggestions (most useful for vendedores and supervisors)
  queries.push({ text: 'Plan mis visitas para este mes', category: 'Planificación' });
  queries.push({ text: 'Clientes en riesgo de abandono', category: 'Riesgo' });

  // Map suggestion (only shown if clients table is available)
  const metadata = await dataService.getMetadata();
  if (metadata.hasClients) {
    queries.push({ text: 'Muéstrame mis clientes en el mapa', category: 'Mapa' });
  }

  res.json({ queries });
}
