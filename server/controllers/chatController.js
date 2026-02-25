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

// Check if SQL query attempts to access margin/cost data (forbidden for vendors and supervisors)
function checkMarginAccess(sql, canViewMargin) {
  if (canViewMargin === true) return null; // Admin/gerente can view all data

  const sqlUpper = sql.toUpperCase();

  // Only block actual margin calculations or explicit cost data access
  // Allow queries that just select sales/quantity data
  const forbiddenPatterns = [
    /LINECOST/,  // Any reference to LineCost column
    /\(SUM\(LINETOTAL\)\s*-\s*SUM\(LINECOST\)\)/,  // Margin formula: (SUM(LineTotal) - SUM(LineCost))
    /\bMARGEN\b/,  // The Margen column itself (word boundary to avoid false positives)
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

        try {
          const data = await dataService.executeQuery(queryItem.sql);
          if (clientDisconnected) break;

          // Skip empty results - don't add to carousel if no data
          if (!data || data.length === 0) continue;

          const analysis = data && data.length > 0
            ? await llmService.analyzeResults(query, data, queryItem.chartConfig)
            : null;

          results.push({
            data,
            chartType: queryItem.chartType,
            chartConfig: queryItem.chartConfig,
            explanation: queryItem.explanation,
            analysis,
            sql: queryItem.sql,
            rowCount: data.length
          });
        } catch (sqlError) {
          console.error('SQL Error in multi-query:', sqlError);
          results.push({
            error: true,
            message: 'Error ejecutando la consulta'
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
    try {
      data = await dataService.executeQuery(llmResponse.sql);
    } catch (sqlError) {
      console.error('SQL Error:', sqlError);
      logData.result_type   = 'error';
      logData.error_message = sqlError.message;
      return safeSend({
        type: 'error',
        message: 'Error ejecutando la consulta. Por favor intenta reformular tu pregunta.'
      });
    }

    if (clientDisconnected) return;

    // If no data found, return a helpful message with the SQL so user can debug
    if (!data || data.length === 0) {
      logData.result_type      = 'empty';
      logData.result_row_count = 0;
      saveToHistory(req.user?.id, query);
      return safeSend({
        type: 'conversational',
        message: 'No se encontraron datos para esta consulta. Es posible que el período solicitado no tenga registros disponibles o que el filtro activo no incluya ese rango de fechas.',
        explanation: 'Sin resultados',
        sql: llmResponse.sql  // Include SQL so user can debug what was queried
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
      sql: llmResponse.sql,
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
