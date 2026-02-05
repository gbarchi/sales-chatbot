import dataService from '../services/dataService.js';
import llmService from '../services/llmService.js';
import { userService } from '../services/userService.js';

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
  try {
    const { query, conversationHistory = [], dateFilter = null } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Get user's filter context based on their role
    const userFilter = req.user ? userService.getFilterContext(req.user) : { filter: null, description: null };

    // Get metadata for context
    const metadata = await dataService.getMetadata();

    // Process query with LLM (including conversation history, date filter, and user filter for context)
    const llmResponse = await llmService.processQuery(query, metadata, conversationHistory, dateFilter, userFilter);

    if (llmResponse.error) {
      return res.json({
        type: 'error',
        message: llmResponse.error,
        suggestion: llmResponse.suggestion
      });
    }

    // Handle MULTIPLE queries
    if (llmResponse.multiple && llmResponse.queries && llmResponse.queries.length > 0) {
      const results = [];

      for (const queryItem of llmResponse.queries) {
        try {
          const data = await dataService.executeQuery(queryItem.sql);
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
            message: `Error ejecutando consulta: ${sqlError.message}`,
            sql: queryItem.sql
          });
        }
      }

      // Save to history on successful multi-query
      saveToHistory(req.user?.id, query);

      return res.json({
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
      return res.json({
        type: 'error',
        message: `Error ejecutando la consulta: ${sqlError.message}`,
        sql: llmResponse.sql
      });
    }

    // Analyze the results
    let analysis = null;
    if (data && data.length > 0) {
      analysis = await llmService.analyzeResults(query, data, llmResponse.chartConfig);
    }

    // Save to history on successful query
    saveToHistory(req.user?.id, query);

    // Format response
    res.json({
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
    res.status(500).json({
      type: 'error',
      message: 'Error interno del servidor',
      details: error.message
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
