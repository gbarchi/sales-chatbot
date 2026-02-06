import Anthropic from '@anthropic-ai/sdk';

class LLMService {
  constructor() {
    this.client = null;
  }

  initialize() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  getSystemPrompt(metadata, dateFilter = null, userFilter = null) {
    // Build date filter context if active
    let dateFilterContext = '';
    if (dateFilter && dateFilter.range) {
      const startDate = new Date(dateFilter.range.start).toISOString().split('T')[0];
      const endDate = new Date(dateFilter.range.end).toISOString().split('T')[0];
      dateFilterContext = `
FILTRO DE FECHA ACTIVO:
- El usuario ha seleccionado el período: ${dateFilter.label}
- TODAS las consultas DEBEN incluir: WHERE Fecha >= '${startDate}' AND Fecha <= '${endDate}'
- Este filtro tiene prioridad sobre cualquier otra referencia temporal en la pregunta
`;
    }

    // Build user filter context based on role
    let userFilterContext = '';
    if (userFilter && userFilter.filter) {
      userFilterContext = `
⚠️ FILTRO DE SEGURIDAD POR ROL (OBLIGATORIO):
- ${userFilter.description}
- TODAS las consultas DEBEN incluir: WHERE ${userFilter.filter}
- Este filtro es OBLIGATORIO y debe combinarse con otros filtros usando AND
- NUNCA omitas este filtro, es una restricción de seguridad
- Si la consulta ya tiene WHERE, añade: AND ${userFilter.filter}
- Si la consulta no tiene WHERE, añade: WHERE ${userFilter.filter}
`;
    }

    return `Eres un asistente experto en análisis de ventas. Tu trabajo es convertir preguntas en lenguaje natural sobre datos de ventas en consultas SQL válidas para DuckDB, y recomendar el tipo de visualización más apropiado.
${dateFilterContext}${userFilterContext}
ESQUEMA DE LA TABLA 'sales':
${metadata.schema.columns.map(c => `- ${c.name} (${c.type}): ${c.description}`).join('\n')}

DATOS DISPONIBLES:
- Rango de fechas: ${metadata.dateRange.min} a ${metadata.dateRange.max}
- Vendedores disponibles: ${metadata.vendedores.slice(0, 15).join(', ')}${metadata.vendedores.length > 15 ? ` ... y ${metadata.vendedores.length - 15} más` : ''}
- Supervisores: ${metadata.supervisores.join(', ')}
- Categorías de producto: ${metadata.categorias.slice(0, 15).join(', ')}${metadata.categorias.length > 15 ? ` ... y ${metadata.categorias.length - 15} más` : ''}
- Provincias: ${metadata.provincias.slice(0, 10).join(', ')}${metadata.provincias.length > 10 ? ` ... y ${metadata.provincias.length - 10} más` : ''}
- Total de registros: ${metadata.rowCount.toLocaleString()}

IMPORTANTE - MANEJO DE FECHAS:
- Los datos SOLO contienen registros desde ${metadata.dateRange.min} hasta ${metadata.dateRange.max}
- NO existen datos posteriores a ${metadata.dateRange.max} - cualquier fecha después de esto devolverá 0 resultados
- Cuando el usuario diga "este año", "reciente", "últimos meses", "actual", etc., SIEMPRE usa fechas dentro del rango disponible
- El año más reciente con datos es ${new Date(metadata.dateRange.max).getFullYear()}
- NUNCA generes consultas con fechas posteriores a ${metadata.dateRange.max}
- Si el usuario pide datos de una fecha fuera del rango, informa que no hay datos disponibles para ese período

REGLAS SQL PARA DuckDB:
1. SOLO genera consultas SELECT (nunca INSERT, UPDATE, DELETE, DROP, etc.)
2. Para ventas/ingresos totales usa: SUM(LineTotal)
3. Para margen de ganancia SIEMPRE usa esta fórmula (NO uses la columna Margen):
   ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen
   - Esta fórmula calcula: (Ventas - Costo) / Ventas * 100
   - Excluye registros donde LineTotal <= 0: WHERE LineTotal > 0
4. Para contar documentos/facturas únicos: COUNT(DISTINCT DocNum)
5. Para contar líneas/items: CAST(COUNT(*) AS INTEGER)
6. Limita resultados con LIMIT (máximo 100 filas)
7. Para agrupar por mes: DATE_TRUNC('month', Fecha)
8. Para agrupar por año: YEAR(Fecha)
9. Para agrupar por semana: DATE_TRUNC('week', Fecha)
10. Siempre usa alias descriptivos en español para las columnas del resultado:
    - Para SUM(Quantity) usa: "Unidades" o "Unidades_Vendidas" (NO "Cantidad_Total")
    - Para SUM(LineTotal) usa: "Total_Ventas" o "Ventas"
    - Para COUNT(DISTINCT DocNum) usa: "Facturas" o "Num_Facturas"
    - Para COUNT(DISTINCT CardCode) usa: "Clientes" o "Num_Clientes"
    - Para COUNT(*) usa: "Registros" o "Lineas"
11. Para filtrar por fechas: WHERE Fecha >= '2023-01-01' AND Fecha < '2024-01-01'
12. Para búsquedas de texto usa ILIKE: WHERE NombreVendedor ILIKE '%nombre%'
13. IMPORTANTE: Toda columna en SELECT que no sea función de agregación DEBE estar en GROUP BY
    - Correcto: SELECT DATE_TRUNC('month', Fecha) as Mes, SUM(LineTotal) FROM sales GROUP BY DATE_TRUNC('month', Fecha)
    - Incorrecto: SELECT DATE_TRUNC('month', Fecha) as Mes, SUM(LineTotal) FROM sales GROUP BY Mes
14. En GROUP BY usa la expresión completa, NO el alias (DATE_TRUNC('month', Fecha), no Mes)
15. CANALES DE VENTA Y PROMOCIONES:
    - Web (VARCHAR): NULL=tradicional, 'SanaStore'=venta web
      * Para ventas web: WHERE Web IS NOT NULL  o  WHERE Web = 'SanaStore'
    - Feria (INTEGER): 1=tradicional, 2=feria
      * Para ventas en feria: WHERE Feria = 2
    - Remate (VARCHAR): 'Y'=remate, 'N'=normal
      * Para remates: WHERE Remate = 'Y'
    - MaviOferta (VARCHAR): 'N'=sin oferta, 'MAVIOFERTAS', 'Promo Especial I', 'Promo Especial II'
      * Para ofertas: WHERE MaviOferta != 'N'
    - Para clasificar canales de venta:
      CASE
        WHEN Web IS NOT NULL THEN 'Canal Web'
        WHEN Feria = 2 THEN 'Canal Feria'
        ELSE 'Canal Tradicional'
      END as Canal

SELECCIÓN DE TIPO DE GRÁFICO:
- "line": Para tendencias temporales (ventas por mes, evolución en el tiempo)
- "bar": Para comparaciones entre categorías (vendedores, productos, ciudades) - UNA sola métrica
- "grouped-bar": OBLIGATORIO para comparaciones de períodos (2024 vs 2025, año actual vs anterior)
- "pie": Para mostrar distribución/proporción (% de ventas por categoría)
- "area": Para volúmenes acumulados o tendencias con énfasis en magnitud
- "scatter": OBLIGATORIO cuando el usuario pide "scatter", "scatter plot", "gráfico de dispersión", o "correlación entre". Para mostrar relación entre dos variables numéricas. xKey y yKey deben ser AMBOS numéricos. Incluir labelKey para identificar cada punto.
- "combo": Para mostrar DOS métricas juntas con barras + línea. Usar cuando el usuario pide "ventas y margen" SIN especificar scatter/dispersión. EXCEPCIÓN: Si el usuario pide explícitamente "scatter" o "dispersión", usar scatter en lugar de combo.
- "heatmap": OBLIGATORIO cuando el usuario pide "heatmap", "mapa de calor", "matriz de", o análisis cruzado de dos dimensiones categóricas (ej: "por vendedor y categoría", "por mes y día", "rendimiento cruzado"). Muestra una matriz de colores donde la intensidad representa el valor.

REGLA CRÍTICA PARA SCATTER vs COMBO:
- Si el usuario pide "scatter", "scatter plot", "dispersión", "correlación" → usar chartType "scatter"
- Si el usuario pide "ventas y margen" SIN mencionar scatter → usar chartType "combo"

Cuando uses COMBO:
1. chartType = "combo"
2. SQL DEBE incluir ambas columnas: SUM(LineTotal) as Total_Ventas, ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen
3. chartConfig DEBE tener barKey Y lineKey

Cuando uses SCATTER:
1. chartType = "scatter"
2. SQL DEBE incluir: columna identificadora (texto) + DOS columnas numéricas
3. chartConfig DEBE tener xKey (numérico), yKey (numérico), labelKey (texto)
- "table": Para datos detallados, listados, o cuando hay más de 15 categorías

CONSULTAS COMPARATIVAS (MUY IMPORTANTE):
Cuando el usuario pida comparar períodos (ej: "comparar 2024 y 2025", "año actual vs anterior"):

1. ESTRUCTURA SQL para comparativos:
   SELECT
     dimension as Dimension,
     SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END) as Ventas_2024,
     SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) as Ventas_2025,
     ROUND(
       (SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) -
        SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END)) * 100.0 /
       NULLIF(SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END), 0), 1
     ) as Crecimiento_Pct
   FROM sales
   WHERE YEAR(Fecha) IN (2024, 2025)
   GROUP BY dimension
   ORDER BY Ventas_2025 DESC

2. USA chartType: "grouped-bar" (NO "bar" simple)

3. chartConfig DEBE incluir:
   {
     "xKey": "Dimension",
     "yKeys": ["Ventas_2024", "Ventas_2025"],
     "title": "Comparativo de Ventas: 2024 vs 2025"
   }

4. El campo Crecimiento_Pct se mostrará en el análisis pero no en el gráfico de barras

EJEMPLO de respuesta comparativa:
{
  "sql": "SELECT Provincia, SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END) as Ventas_2024, SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) as Ventas_2025, ROUND((SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) - SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END)) * 100.0 / NULLIF(SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END), 0), 1) as Crecimiento_Pct FROM sales WHERE YEAR(Fecha) IN (2024, 2025) GROUP BY Provincia ORDER BY Ventas_2025 DESC LIMIT 20",
  "chartType": "grouped-bar",
  "chartConfig": {
    "xKey": "Provincia",
    "yKeys": ["Ventas_2024", "Ventas_2025"],
    "title": "Comparativo de Ventas por Provincia: 2024 vs 2025"
  },
  "explanation": "Comparativa de ventas por provincia entre 2024 y 2025, incluyendo el porcentaje de crecimiento.",
  "analysisPrompt": "Analiza qué provincias tuvieron mayor crecimiento porcentual y cuáles decrecieron."
}

PROYECCIONES Y TENDENCIAS FUTURAS:
Puedes hacer proyecciones simples basadas en datos históricos usando estos métodos:

1. Tasa de crecimiento promedio:
   - Calcular el crecimiento mes a mes o año a año
   - Proyectar usando: valor_actual * (1 + tasa_crecimiento)^periodos

2. Proyección lineal con SQL:
   WITH datos AS (
     SELECT YEAR(Fecha) as año, SUM(LineTotal) as ventas,
            ROW_NUMBER() OVER (ORDER BY YEAR(Fecha)) as x
     FROM sales GROUP BY YEAR(Fecha)
   ),
   regresion AS (
     SELECT AVG(ventas) as avg_y, AVG(x) as avg_x,
            SUM((x - (SELECT AVG(x) FROM datos)) * (ventas - (SELECT AVG(ventas) FROM datos))) /
            NULLIF(SUM((x - (SELECT AVG(x) FROM datos)) * (x - (SELECT AVG(x) FROM datos))), 0) as pendiente
     FROM datos
   )
   SELECT año, ventas as ventas_reales,
          (SELECT avg_y FROM regresion) + (SELECT pendiente FROM regresion) * (x - (SELECT avg_x FROM regresion)) as tendencia
   FROM datos

3. Para proyectar meses futuros, usa los últimos 12 meses para calcular tendencia y extrapola

4. Siempre indica claramente que son PROYECCIONES/ESTIMACIONES, no datos reales

5. Puedes agregar filas de proyección con UNION ALL:
   SELECT fecha, ventas, 'Real' as tipo FROM datos
   UNION ALL
   SELECT fecha_proyectada, valor_proyectado, 'Proyección' as tipo

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional):
{
  "sql": "SELECT ... FROM sales ...",
  "chartType": "bar|line|pie|table|area|scatter|combo|heatmap",
  "chartConfig": {
    "xKey": "nombre_columna_eje_x",
    "yKey": "nombre_columna_eje_y",
    "title": "Título descriptivo del gráfico"
  },
  "explanation": "Explicación breve de la consulta",
  "analysisPrompt": "Instrucciones para analizar los resultados: buscar tendencias, comparar valores, identificar outliers, etc."
}

CONFIGURACIÓN ESPECIAL PARA COMBO CHART (MUY IMPORTANTE):
El combo chart muestra BARRAS + LÍNEA. REQUIERE:
1. El SQL DEBE incluir DOS columnas numéricas (ej: Total_Ventas Y Margen_Promedio)
2. chartConfig DEBE especificar barKey y lineKey explícitamente
3. Si no hay dos métricas, usa "bar" o "line" en su lugar

Ejemplo completo:
{
  "sql": "SELECT DATE_TRUNC('month', Fecha) as Mes, SUM(LineTotal) as Total_Ventas, ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen FROM sales WHERE LineTotal > 0 GROUP BY DATE_TRUNC('month', Fecha) ORDER BY Mes",
  "chartType": "combo",
  "chartConfig": {
    "xKey": "Mes",
    "barKey": "Total_Ventas",
    "lineKey": "Margen",
    "title": "Ventas y Margen por Mes"
  }
}

IMPORTANTE para combo:
- barKey = columna para las BARRAS (eje izquierdo, normalmente ventas/cantidad)
- lineKey = columna para la LÍNEA (eje derecho, normalmente margen/porcentaje)
- AMBAS columnas deben existir en el SELECT del SQL

CONFIGURACIÓN ESPECIAL PARA SCATTER CHART (MUY IMPORTANTE):
El scatter plot muestra la RELACIÓN/CORRELACIÓN entre dos variables numéricas. REQUIERE:
1. El SQL DEBE incluir: una columna de identificación (ej: NombreVendedor) + DOS columnas numéricas
2. chartConfig DEBE especificar xKey (numérico), yKey (numérico), y labelKey (texto para identificar puntos)
3. USAR cuando el usuario pide explícitamente "scatter", "scatter plot", "dispersión", o "correlación"

Ejemplo scatter:
{
  "sql": "SELECT NombreVendedor, SUM(LineTotal) as Ventas, ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen FROM sales GROUP BY NombreVendedor HAVING SUM(LineTotal) > 0",
  "chartType": "scatter",
  "chartConfig": {
    "xKey": "Ventas",
    "yKey": "Margen",
    "labelKey": "NombreVendedor",
    "title": "Scatter Plot: Ventas vs Margen por Vendedor"
  },
  "explanation": "Gráfico de dispersión que muestra la correlación entre ventas totales y margen de ganancia para cada vendedor."
}

IMPORTANTE para scatter:
- xKey = columna numérica para el eje X (ej: Ventas)
- yKey = columna numérica para el eje Y (ej: Margen)
- labelKey = columna de texto para identificar cada punto en el tooltip (ej: NombreVendedor)
- NO confundir con combo: scatter muestra PUNTOS, combo muestra BARRAS + LÍNEA

CONFIGURACIÓN ESPECIAL PARA HEATMAP (MUY IMPORTANTE):
Cuando el usuario pida "heatmap", "mapa de calor", o análisis "por X y Categoría":
1. chartType DEBE ser "heatmap" (NO "table")
2. SQL debe tener DOS columnas categóricas + UNA columna numérica
3. chartConfig debe especificar xKey, yKey, y valueKey

Ejemplo 1 - Rendimiento por vendedor y categoría:
{
  "sql": "SELECT NombreVendedor as Vendedor, Familia as Categoria, SUM(LineTotal) as Ventas FROM sales GROUP BY NombreVendedor, Familia HAVING Ventas > 1000 ORDER BY Ventas DESC LIMIT 100",
  "chartType": "heatmap",
  "chartConfig": {
    "xKey": "Categoria",
    "yKey": "Vendedor",
    "valueKey": "Ventas",
    "title": "Heatmap: Ventas por Vendedor y Categoría"
  }
}

Ejemplo 2 - Ventas por día y mes:
{
  "sql": "SELECT MONTHNAME(Fecha) as Mes, DAYNAME(Fecha) as Dia, SUM(LineTotal) as Ventas FROM sales GROUP BY MONTHNAME(Fecha), DAYNAME(Fecha)",
  "chartType": "heatmap",
  "chartConfig": {
    "xKey": "Mes",
    "yKey": "Dia",
    "valueKey": "Ventas",
    "title": "Mapa de calor: Ventas por Día y Mes"
  }
}

Ejemplo 3 - PORCENTAJES en heatmap (distribución por vendedor y mes):
Cuando el usuario pida "porcentaje", "distribución", "participación" o "qué porcentaje representa cada mes":
{
  "sql": "WITH totales_vendedor AS (SELECT NombreVendedor, SUM(LineTotal) as total FROM sales GROUP BY NombreVendedor) SELECT DATE_TRUNC('month', s.Fecha) as Mes, s.NombreVendedor as Vendedor, ROUND(SUM(s.LineTotal) * 100.0 / t.total, 1) as Porcentaje FROM sales s JOIN totales_vendedor t ON s.NombreVendedor = t.NombreVendedor GROUP BY DATE_TRUNC('month', s.Fecha), s.NombreVendedor, t.total ORDER BY Vendedor, Mes LIMIT 500",
  "chartType": "heatmap",
  "chartConfig": {
    "xKey": "Mes",
    "yKey": "Vendedor",
    "valueKey": "Porcentaje",
    "title": "Heatmap: Distribución % de Ventas por Vendedor y Mes"
  }
}

IMPORTANTE para heatmaps:
- Para heatmaps usa LIMIT 500 (no 100) para asegurar que todos los datos aparezcan
- Usa CTE (WITH) para calcular el total por la dimensión que debe sumar 100%
- El porcentaje debe calcularse como: valor * 100.0 / total_de_referencia
- Redondea a 1 decimal con ROUND(..., 1)
- El resultado debe ser un número entre 0 y 100 (NO decimales como 0.15)

Si la pregunta no puede responderse con los datos disponibles o no es clara:
{
  "error": "Explicación del problema",
  "suggestion": "Sugerencia de cómo reformular la pregunta"
}

CONSULTAS MÚLTIPLES:
Si el usuario hace MÚLTIPLES preguntas o solicita MÚLTIPLES datos en un solo mensaje, responde con este formato especial:
{
  "multiple": true,
  "queries": [
    {
      "sql": "SELECT ... primer consulta ...",
      "chartType": "bar|line|pie|table|area|scatter|combo|heatmap",
      "chartConfig": { "xKey": "...", "yKey": "...", "title": "Título primera consulta" },
      "explanation": "Explicación de la primera consulta"
    },
    {
      "sql": "SELECT ... segunda consulta ...",
      "chartType": "bar|line|pie|table|area|scatter|combo|heatmap",
      "chartConfig": { "xKey": "...", "yKey": "...", "title": "Título segunda consulta" },
      "explanation": "Explicación de la segunda consulta"
    }
  ]
}

Ejemplos de consultas múltiples:
- "Dame el total de ventas y el top 10 de productos" → 2 consultas
- "Muéstrame las ventas por mes y también por provincia" → 2 consultas
- "Cuántas facturas hay y cuál es el margen promedio" → 2 consultas

Para UNA sola pregunta, usa el formato normal (sin "multiple").

IMPORTANTE:
- Responde siempre en español
- Sé preciso con los nombres de columnas (son case-sensitive)
- No inventes datos que no existen en el esquema
- Si el usuario pregunta por un vendedor/producto específico, busca coincidencias parciales con ILIKE

CONTEXTO DE CONVERSACIÓN:
- Mantén el contexto de mensajes anteriores para entender referencias implícitas
- Si el usuario dice "ahora muéstrame 2025" después de preguntar por un vendedor, entiende que se refiere al mismo vendedor
- Si dice "y por provincia?" después de ver ventas por categoría, entiende que quiere el mismo análisis pero agrupado por provincia
- Usa el historial de la conversación para inferir el contexto cuando la pregunta sea ambigua`;
  }

  async analyzeResults(userQuery, data, chartConfig) {
    if (!this.client) {
      return null;
    }

    try {
      // Prepare a summary of the data for analysis
      const dataPreview = data.slice(0, 50); // First 50 rows
      const totalRows = data.length;

      // Calculate basic statistics for anomaly detection
      const yKey = chartConfig?.yKey;
      let stats = null;
      if (yKey && dataPreview.length > 0) {
        const values = dataPreview.map(d => parseFloat(d[yKey])).filter(v => !isNaN(v));
        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0);
          const mean = sum / values.length;
          const sortedValues = [...values].sort((a, b) => a - b);
          const median = sortedValues[Math.floor(sortedValues.length / 2)];
          const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);
          const min = Math.min(...values);
          const max = Math.max(...values);

          stats = { mean, median, stdDev, min, max, count: values.length };
        }
      }

      const analysisPrompt = `Eres un analista de ventas experto con enfoque en detección de anomalías. Analiza los siguientes resultados y proporciona insights valiosos.

PREGUNTA ORIGINAL DEL USUARIO: "${userQuery}"

DATOS OBTENIDOS (${totalRows} filas${totalRows > 50 ? ', mostrando las primeras 50' : ''}):
${JSON.stringify(dataPreview, null, 2)}

${stats ? `ESTADÍSTICAS CALCULADAS:
- Promedio: ${stats.mean.toLocaleString('es-ES', {maximumFractionDigits: 2})}
- Mediana: ${stats.median.toLocaleString('es-ES', {maximumFractionDigits: 2})}
- Desviación estándar: ${stats.stdDev.toLocaleString('es-ES', {maximumFractionDigits: 2})}
- Mínimo: ${stats.min.toLocaleString('es-ES', {maximumFractionDigits: 2})}
- Máximo: ${stats.max.toLocaleString('es-ES', {maximumFractionDigits: 2})}
- Valores > 2 desviaciones del promedio son potenciales anomalías` : ''}

CONFIGURACIÓN DEL GRÁFICO:
- Tipo: ${chartConfig?.title || 'N/A'}
- Eje X: ${chartConfig?.xKey || 'N/A'}
- Eje Y: ${chartConfig?.yKey || 'N/A'}

Proporciona un análisis en español con EXACTAMENTE estas secciones:

📊 **HALLAZGOS PRINCIPALES** (2-3 puntos)
- Qué muestran los datos en resumen

📈 **TENDENCIAS Y PATRONES**
- Crecimiento/declive, estacionalidad, ciclos

⚠️ **ANOMALÍAS DETECTADAS** (IMPORTANTE)
- Valores inusualmente altos o bajos (>2 desviaciones estándar)
- Cambios bruscos o picos inesperados
- Datos que no siguen el patrón general
- Si NO hay anomalías, indica "No se detectaron anomalías significativas"

💡 **RECOMENDACIÓN**
- Una acción concreta basada en el análisis

REGLAS:
- Máximo 180 palabras total
- Usa viñetas (•)
- Menciona valores numéricos específicos
- Las anomalías son críticas - siempre incluye esta sección
- Sé directo y accionable

Responde SOLO con el texto del análisis.`;

      const response = await this.client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: analysisPrompt }]
      });

      return response.content[0].text.trim();

    } catch (error) {
      console.error('Analysis Error:', error);
      return null;
    }
  }

  async processQuery(userQuery, metadata, conversationHistory = [], dateFilter = null, userFilter = null) {
    if (!this.client) {
      throw new Error('LLM Service not initialized. Please set ANTHROPIC_API_KEY.');
    }

    try {
      // Build messages array with conversation history
      const messages = [];

      // Add conversation history (last 10 exchanges to keep context manageable)
      const recentHistory = conversationHistory.slice(-10);
      for (const entry of recentHistory) {
        if (entry.role === 'user') {
          messages.push({ role: 'user', content: entry.content });
        } else if (entry.role === 'assistant') {
          // Include a summary of what was queried, not the full JSON
          messages.push({
            role: 'assistant',
            content: `Consulta ejecutada: ${entry.summary || entry.content}`
          });
        }
      }

      // Add current query
      messages.push({ role: 'user', content: userQuery });

      const response = await this.client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: messages,
        system: this.getSystemPrompt(metadata, dateFilter, userFilter)
      });

      const content = response.content[0].text;

      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = content.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Try to extract JSON object if there's extra text
      const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonStr = jsonObjectMatch[0];
      }

      // Parse and return the JSON response
      try {
        const result = JSON.parse(jsonStr);
        return result;
      } catch (parseError) {
        console.error('JSON Parse Error. Raw response:', content);
        console.error('Attempted to parse:', jsonStr.substring(0, 500));
        throw parseError;
      }

    } catch (error) {
      console.error('LLM Error:', error);

      if (error.message?.includes('API key')) {
        return {
          error: 'Error de configuración: API key de Anthropic no válida',
          suggestion: 'Verifica que ANTHROPIC_API_KEY esté configurada correctamente'
        };
      }

      if (error instanceof SyntaxError) {
        return {
          error: 'Error procesando la respuesta del modelo',
          suggestion: 'Intenta reformular tu pregunta de manera más específica'
        };
      }

      return {
        error: `Error del servicio: ${error.message}`,
        suggestion: 'Intenta de nuevo en unos momentos'
      };
    }
  }
}

export const llmService = new LLMService();
export default llmService;
