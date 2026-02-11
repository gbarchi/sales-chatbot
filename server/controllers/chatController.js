import dataService from '../services/dataService.js';
import llmService from '../services/llmService.js';
import { userService } from '../services/userService.js';
import { resolveEntities } from '../services/entityResolver.js';

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

  try {
    const { query, conversationHistory = [], dateFilter = null } = req.body;

    if (!query || typeof query !== 'string') {
      return safeSend({ error: 'Query is required' }, 400);
    }

    // Get user's filter context based on their role
    const userFilter = req.user ? userService.getFilterContext(req.user) : { filter: null, description: null };

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

    // Process query with LLM (including conversation history, date filter, and user filter for context)
    const llmResponse = await llmService.processQuery(query, metadata, conversationHistory, dateFilter, userFilter, resolvedEntities);
    if (clientDisconnected) return;

    if (llmResponse.error) {
      return safeSend({
        type: 'error',
        message: llmResponse.error,
        suggestion: llmResponse.suggestion
      });
    }

    // Handle CONVERSATIONAL responses (no SQL needed)
    if (llmResponse.type === 'conversational') {
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
        saveToHistory(req.user?.id, query);
        return safeSend({
          type: 'conversational',
          message: 'No se encontraron datos para ninguna de las consultas. Es posible que el período solicitado no tenga registros disponibles.',
          explanation: 'Sin resultados'
        });
      }

      saveToHistory(req.user?.id, query);

      return safeSend({
        type: 'multi',
        results,
        totalQueries: results.length
      });
    }

    // Handle SINGLE query (original behavior)
    let data;
    try {
      data = await dataService.executeQuery(llmResponse.sql);
    } catch (sqlError) {
      console.error('SQL Error:', sqlError);
      return safeSend({
        type: 'error',
        message: 'Error ejecutando la consulta. Por favor intenta reformular tu pregunta.'
      });
    }

    if (clientDisconnected) return;

    // If no data found, return a helpful message with the SQL so user can debug
    if (!data || data.length === 0) {
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

    if (clientDisconnected) return;

    // Save to history on successful query
    saveToHistory(req.user?.id, query);

    // Format response
    safeSend({
      type: 'success',
      data: data,
      chartType: llmResponse.chartType,
      chartConfig: llmResponse.chartConfig,
      explanation: llmResponse.explanation,
      analysis: analysis,
      sql: llmResponse.sql,
      rowCount: data.length
    });

  } catch (error) {
    console.error('Chat Error:', error);
    safeSend({
      type: 'error',
      message: 'Error interno del servidor',
      details: error.message
    }, 500);
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
  res.json({
    queries: [
      { text: 'Mostrar ventas por mes', category: 'Tendencias' },
      { text: 'Top 10 vendedores', category: 'Rankings' },
      { text: 'Ventas por categoría', category: 'Análisis' },
      { text: 'Ventas por provincia', category: 'Geografía' },
      { text: 'Margen promedio por supervisor', category: 'Rentabilidad' },
      { text: 'Productos más vendidos', category: 'Productos' },
      { text: 'Tendencia de los últimos 6 meses', category: 'Tendencias' },
      { text: 'Distribución de ventas por categoría', category: 'Análisis' },
      { text: 'Top 20 clientes', category: 'Clientes' },
      { text: 'Ventas totales', category: 'Resumen' },
      { text: 'Comparativo año actual vs anterior', category: 'Comparativo' },
      { text: 'Unidades vendidas por mes', category: 'Inventario' }
    ]
  });
}
