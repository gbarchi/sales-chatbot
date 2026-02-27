import Anthropic from '@anthropic-ai/sdk';
import { userService } from './userService.js';

class LLMService {
  constructor() {
    this.client = null;
    this.model = 'claude-haiku-4-5-20251001';
  }

  initialize() {
    const dbApiKey = userService.getSetting('anthropic_api_key');
    const dbModel  = userService.getSetting('anthropic_model');

    const apiKey = dbApiKey || process.env.ANTHROPIC_API_KEY;
    this.model   = dbModel  || this.model;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({ apiKey });
  }

  reinitialize(apiKey, model) {
    this.client = new Anthropic({ apiKey });
    this.model  = model;
  }

  getSystemPrompt(metadata, dateFilter = null, userFilter = null, resolvedEntities = []) {
    // Build date filter context if active
    let dateFilterContext = '';
    if (dateFilter && dateFilter.range) {
      const startDate = new Date(dateFilter.range.start).toISOString().split('T')[0];
      const endDate = new Date(dateFilter.range.end).toISOString().split('T')[0];
      dateFilterContext = `
FILTRO DE FECHA ACTIVO:
- El usuario ha seleccionado el período: ${dateFilter.label}
- Por defecto, las consultas DEBEN incluir: WHERE Fecha >= '${startDate}' AND Fecha <= '${endDate}'
- REGLA CRÍTICA: Aunque el historial de conversación mencione otros años (ej: 2025), SIEMPRE aplica este filtro a la consulta actual, a menos que el usuario pida EXPLÍCITAMENTE un año diferente en su mensaje actual.
- EXCEPCIÓN 1: Si el usuario pide COMPARAR períodos (ej: "vs año anterior", "comparar 2024 y 2025", "comparativo"), IGNORA este filtro y usa WHERE YEAR(Fecha) IN (año1, año2) para incluir ambos períodos completos
- EXCEPCIÓN 2: Si el usuario menciona un año específico en su mensaje actual (ej: "en 2025", "del 2024"), usa ese año en lugar del filtro
- Para comparativas, usa el año del filtro activo (${new Date(dateFilter.range.start).getFullYear()}) como el año actual y el año anterior como referencia
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

    // Filter schema columns for users without margin access
    let schemaColumns = metadata.schema.columns;
    if (userFilter && userFilter.canViewMargin === false) {
      schemaColumns = schemaColumns.filter(c => c.name !== 'LineCost');
    }

    return `Eres un asistente experto en análisis de ventas. Tu trabajo es convertir preguntas en lenguaje natural sobre datos de ventas en consultas SQL válidas para DuckDB, y recomendar el tipo de visualización más apropiado.
${dateFilterContext}${userFilterContext}
ESQUEMA DE LA TABLA 'sales':
${schemaColumns.map(c => `- ${c.name} (${c.type}): ${c.description}`).join('\n')}

DATOS DISPONIBLES:
- Rango de fechas: ${metadata.dateRange.min} a ${metadata.dateRange.max}
- Vendedores disponibles: ${metadata.vendedores.slice(0, 15).join(', ')}${metadata.vendedores.length > 15 ? ` ... y ${metadata.vendedores.length - 15} más` : ''}
- Supervisores: ${metadata.supervisores.join(', ')}
- JERARQUÍA DE PRODUCTO (de mayor a menor): Familia (ItmsgrpName) → Subfamilia (SubFamiliaName) → Categoría (Categoria) → Subcategoría (SubCategoria)
- Nivel 1 — Familias (ItmsgrpName): ${metadata.grupos.join(', ')}
- Nivel 2 — Subfamilias (SubFamiliaName): ${metadata.subfamilias.slice(0, 20).join(', ')}${metadata.subfamilias.length > 20 ? ` ... y ${metadata.subfamilias.length - 20} más` : ''}
- Nivel 3 — Categorías (Categoria): ${metadata.categorias.slice(0, 15).join(', ')}${metadata.categorias.length > 15 ? ` ... y ${metadata.categorias.length - 15} más` : ''}
- Nivel 4 — Subcategorías (SubCategoria): ${metadata.subcategorias.slice(0, 20).join(', ')}${metadata.subcategorias.length > 20 ? ` ... y ${metadata.subcategorias.length - 20} más` : ''}
- Provincias: ${metadata.provincias.slice(0, 10).join(', ')}${metadata.provincias.length > 10 ? ` ... y ${metadata.provincias.length - 10} más` : ''}
- Ciudades principales (CiudadPrincipal): ${metadata.ciudades.slice(0, 15).join(', ')}${metadata.ciudades.length > 15 ? ` ... y ${metadata.ciudades.length - 15} más` : ''}
- Tipo de cliente (Categoria_SN): ${(metadata.categoria_sn || []).join(', ')}
- Subtipo de cliente (SubCategoria_SN): ${(metadata.subcategoria_sn || []).slice(0, 20).join(', ')}${(metadata.subcategoria_sn || []).length > 20 ? ` ... y ${metadata.subcategoria_sn.length - 20} más` : ''}
- Total de registros: ${metadata.rowCount.toLocaleString()}
- MONEDA: Todos los valores monetarios están en DÓLARES ($). Usa $ en reportes y análisis, NUNCA €

${metadata.holidays && metadata.holidays.length > 0 ? `FERIADOS NACIONALES ECUADOR (fechas oficiales incluyendo puentes movidos):
${metadata.holidays.map(h => `${h.date}: ${h.name}`).join('\n')}
INSTRUCCIÓN: Cuando analices períodos con ventas bajas o caídas inusuales (días, semanas, meses), SIEMPRE verifica si coinciden con feriados de la lista anterior y menciónalo en tu análisis. Ejemplo: "Las bajas ventas del 16-17 feb 2026 se explican por el feriado de Carnaval."` : ''}

${metadata.hasClients ? `
TABLA ADICIONAL 'clients' (geolocalización y asignación de clientes desde ERP):
- CardCode (STRING): clave de JOIN con sales.CardCode
- Cardname (STRING): nombre del cliente
- Lat (DOUBLE): latitud geográfica
- Lng (DOUBLE): longitud geográfica
- Ciudad (STRING): ciudad del cliente
- Provincia (STRING): provincia (puede ser NULL)
- NombreVendedor (STRING): vendedor asignado (puede ser NULL)
- SlpCode (INTEGER): código del vendedor asignado — mismo que sales.Slpcode. Usar para filtrar clientes de un vendedor (más preciso que filtrar por NombreVendedor en sales).
- Balance (DOUBLE): saldo pendiente del cliente
- CreditLine (DOUBLE): límite de crédito asignado al cliente

CHART TYPE 'map':
- Usa 'map' ÚNICAMENTE cuando el usuario mencione explícitamente "mapa", "en el mapa", "geográfico", "ubicación", "ruta de visitas" o similares.
- NUNCA uses 'map' para consultas de churn, ventas por cliente, inactivos, etc. — esas usan table/bar.
- SQL SIEMPRE debe incluir: c.Lat, c.Lng + c.Cardname + métricas: TotalVenta, NumFacturas, PromedioCompra, TopFamilias, DiasSinComprar, FrecuenciaDias, DiasHastaCompra, Balance, CreditLine.
- NUNCA uses agregados (MAX, SUM, COUNT) en el WHERE. Usa CTEs para pre-calcular métricas, luego filtra en el outer WHERE.
- Para filtrar clientes de un vendedor: usa c.SlpCode = (SELECT DISTINCT Slpcode FROM sales WHERE NombreVendedor = '...' LIMIT 1).
- Omite el filtro vs.UltimaCompra IS NOT NULL si el usuario quiere ver todos los clientes (incluyendo prospectos sin historial).
- Ejemplo SQL completo de mapa:
  WITH vendor_sales AS (
    SELECT CardCode,
           MAX(Fecha)                                          AS UltimaCompra,
           SUM(LineTotal)                                      AS TotalVenta,
           COUNT(DISTINCT DocNum)                              AS NumFacturas,
           SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0) AS PromedioCompra
    FROM sales GROUP BY CardCode
  ),
  purchase_gaps AS (
    SELECT CardCode, Fecha,
           LAG(Fecha) OVER (PARTITION BY CardCode ORDER BY Fecha) AS PrevFecha
    FROM (SELECT DISTINCT CardCode, Fecha::DATE AS Fecha FROM sales)
  ),
  freq AS (
    SELECT CardCode, AVG(DATEDIFF('day', PrevFecha, Fecha)) AS FrecuenciaDias
    FROM purchase_gaps WHERE PrevFecha IS NOT NULL GROUP BY CardCode
  ),
  family_pct AS (
    SELECT CardCode, ItmsgrpName,
           ROUND(100.0 * SUM(LineTotal) / NULLIF(SUM(SUM(LineTotal)) OVER (PARTITION BY CardCode), 0)) AS Pct,
           ROW_NUMBER() OVER (PARTITION BY CardCode ORDER BY SUM(LineTotal) DESC) AS rn
    FROM sales GROUP BY CardCode, ItmsgrpName
  ),
  top_families AS (
    SELECT CardCode,
           STRING_AGG(ItmsgrpName || ': ' || COALESCE(TRY_CAST(Pct AS INTEGER), 0) || '%', ', ' ORDER BY Pct DESC) AS TopFamilias
    FROM family_pct WHERE rn <= 2 GROUP BY CardCode
  )
  SELECT c.Cardname, c.Lat, c.Lng, c.Ciudad,
         COALESCE(vs.TotalVenta, 0)              AS TotalVenta,
         vs.NumFacturas,
         ROUND(vs.PromedioCompra)                AS PromedioCompra,
         tf.TopFamilias,
         DATEDIFF('day', vs.UltimaCompra, CURRENT_DATE) AS DiasSinComprar,
         ROUND(f.FrecuenciaDias)                 AS FrecuenciaDias,
         CASE WHEN vs.UltimaCompra IS NOT NULL AND f.FrecuenciaDias IS NOT NULL
              THEN ROUND(f.FrecuenciaDias) - DATEDIFF('day', vs.UltimaCompra, CURRENT_DATE)
              ELSE NULL END                       AS DiasHastaCompra,
         c.Balance,
         c.CreditLine
  FROM clients c
  LEFT JOIN vendor_sales vs  ON c.CardCode = vs.CardCode
  LEFT JOIN freq f           ON c.CardCode = f.CardCode
  LEFT JOIN top_families tf  ON c.CardCode = tf.CardCode
  WHERE c.SlpCode = (SELECT DISTINCT Slpcode FROM sales WHERE NombreVendedor = 'Ronny Marcillo' LIMIT 1)
  ORDER BY DiasSinComprar DESC NULLS LAST
  LIMIT 200
- chartConfig para map: { "latKey": "Lat", "lngKey": "Lng", "labelKey": "Cardname", "valueKey": "TotalVenta" }
` : ''}
${resolvedEntities.length > 0 ? `VALORES EXACTOS DETECTADOS EN ESTA CONSULTA (ya resueltos):
${resolvedEntities.map(e => `- ${e.column} = '${e.exactValue}'`).join('\n')}
Para estos valores ya resueltos, usa = en lugar de ILIKE en la cláusula WHERE (es más preciso).
Si hay términos que NO aparecen aquí, usa ILIKE '%término%' como siempre para búsquedas parciales.

` : ''}IMPORTANTE - MANEJO DE FECHAS:
- Los datos SOLO contienen registros desde ${metadata.dateRange.min} hasta ${metadata.dateRange.max}
- NO existen datos posteriores a ${metadata.dateRange.max} - cualquier fecha después de esto devolverá 0 resultados
- Cuando el usuario diga "este año", "reciente", "últimos meses", "actual", etc., SIEMPRE usa fechas dentro del rango disponible
- El año más reciente con datos es ${new Date(metadata.dateRange.max).getFullYear()}
- NUNCA generes consultas con fechas posteriores a ${metadata.dateRange.max}
- Si el usuario pide datos de una fecha fuera del rango, informa que no hay datos disponibles para ese período

REGLAS SQL PARA DuckDB:
1. SOLO genera consultas SELECT (nunca INSERT, UPDATE, DELETE, DROP, etc.)
2. Para ventas/ingresos totales usa: SUM(LineTotal)
${(userFilter?.canViewMargin !== false) ? `3. Para margen de ganancia SIEMPRE usa esta fórmula (NO uses la columna Margen):
   ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen
   - Esta fórmula calcula: (Ventas - Costo) / Ventas * 100
   - Excluye registros donde LineTotal <= 0: WHERE LineTotal > 0` : `3. Para análisis de cantidad y facturación usa: CAST(COUNT(*) AS INTEGER) o COUNT(DISTINCT DocNum)`}
4. Para contar documentos/facturas únicos: COUNT(DISTINCT DocNum)
5. Para contar líneas/items: CAST(COUNT(*) AS INTEGER)
6. Limita resultados con LIMIT (máximo 100 filas). EXCEPCIÓN: para heatmaps usar LIMIT 500 ya que necesitan todas las combinaciones de las dos dimensiones
7. Para agrupar por mes: DATE_TRUNC('month', Fecha)
8. Para agrupar por año: YEAR(Fecha)
9. Para agrupar por semana: DATE_TRUNC('week', Fecha)
9b. Para agrupar por trimestre: DATE_TRUNC('quarter', Fecha)
    Q1=enero-marzo, Q2=abril-junio, Q3=julio-septiembre, Q4=octubre-diciembre
    - Para filtrar Q4 2025: WHERE Fecha >= '2025-10-01' AND Fecha < '2026-01-01'
    - Para filtrar Q1 2025: WHERE Fecha >= '2025-01-01' AND Fecha < '2025-04-01'
    - Etiqueta legible: CONCAT('Q', EXTRACT(QUARTER FROM Fecha)::INTEGER, ' ', YEAR(Fecha)) AS Trimestre
10. Siempre usa alias descriptivos en español para las columnas del resultado:
    - Para SUM(Quantity) usa: "Unidades" o "Unidades_Vendidas" (NO "Cantidad_Total")
    - Para SUM(LineTotal) usa: "Total_Ventas" o "Ventas"
    - Para COUNT(DISTINCT DocNum) usa: "Facturas" o "Num_Facturas"
    - Para COUNT(DISTINCT CardCode) usa: "Clientes" o "Num_Clientes"
    - Para COUNT(*) usa: "Registros" o "Lineas"
11. Para filtrar por fechas: WHERE Fecha >= '2023-01-01' AND Fecha < '2024-01-01'
12. Para búsquedas de texto SIEMPRE usa ILIKE (nunca =):
    - Ejemplo: WHERE ItmsgrpName ILIKE '%iluminacion%'
    - ILIKE es case-insensitive y funciona con búsquedas parciales

13. Para ticket promedio (valor promedio por factura) SIEMPRE usa:
    ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0), 2) AS Ticket_Promedio
    - NUNCA uses AVG(LineTotal) para ticket promedio — eso da el promedio por línea de producto, no por factura
    - NUNCA uses SUM(LineTotal) / COUNT(*) — COUNT(*) cuenta líneas, no facturas
14. IMPORTANTE: Toda columna en SELECT que no sea función de agregación DEBE estar en GROUP BY
    - Correcto: SELECT DATE_TRUNC('month', Fecha) as Mes, SUM(LineTotal) FROM sales GROUP BY DATE_TRUNC('month', Fecha)
    - Incorrecto: SELECT DATE_TRUNC('month', Fecha) as Mes, SUM(LineTotal) FROM sales GROUP BY Mes
15. En GROUP BY usa la expresión completa, NO el alias (DATE_TRUNC('month', Fecha), no Mes)
16. CANALES DE VENTA Y PROMOCIONES:
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

16. 🚨 DISCIPLINA DE COLUMNAS — REGLA CRÍTICA:
    Incluye EXACTAMENTE las columnas que el usuario pidió. CERO columnas extra.
    Agregar columnas no pedidas ROMPE el tipo de gráfico y confunde al usuario.

    EJEMPLOS OBLIGATORIOS:
    ✅ "top 10 vendedores" → SELECT NombreVendedor, SUM(LineTotal) as Total_Ventas ... LIMIT 10
    ✅ "top 10 clientes por facturas" → SELECT Cardname, COUNT(DISTINCT DocNum) as Facturas ... LIMIT 10
    ✅ "ventas por provincia" → SELECT ProvinciaPrincipal, SUM(LineTotal) as Total_Ventas ...
    ❌ "top 10 vendedores" → SELECT NombreVendedor, SUM(LineTotal), COUNT(DocNum), AVG(LineTotal) ... ← PROHIBIDO
    ❌ "top 10 vendedores" → SELECT NombreVendedor, Total_Ventas, Facturas, Ticket_Promedio ... ← PROHIBIDO

    REGLA: Si el usuario NO dijo "y facturas", NO incluyas facturas.
           Si el usuario NO dijo "y ticket promedio", NO incluyas ticket promedio.
           Si el usuario NO dijo "y unidades", NO incluyas unidades.
    Solo agregar columnas adicionales cuando el usuario las mencione EXPLÍCITAMENTE.

17. DESCUENTO POR PRODUCTO: Para calcular el porcentaje de descuento real aplicado:
    ROUND((PriceBefDi - Price) / NULLIF(PriceBefDi, 0) * 100, 2) as DescuentoPct
    - PriceBefDi = precio de lista antes de descuento; Price = precio final de venta
    - Para descuento promedio por cliente/vendedor/familia: AVG(ROUND((PriceBefDi - Price) / NULLIF(PriceBefDi, 0) * 100, 2))
    - Para comparar precio de lista vs precio de venta: SELECT ROUND(AVG(PriceBefDi), 2) as PrecioLista, ROUND(AVG(Price), 2) as PrecioVenta
    - Solo incluir registros con PriceBefDi > 0 para evitar divisiones por cero

18. FILTROS IMPLÍCITOS EN LENGUAJE NATURAL:
    Cuando el usuario mencione productos, categorías, clientes o lugares implícitamente
    como sujeto/contexto (no como resultado a devolver), tradúcelo a cláusulas WHERE:
    - "clientes que compraron tejas" → WHERE NombreProducto ILIKE '%teja%'
    - "ventas de focos OVO" → WHERE NombreProducto ILIKE '%foco%' AND NombreProducto ILIKE '%OVO%'
    - "cuánto vendió en Guayaquil" → WHERE ProvinciaPrincipal ILIKE '%guayaquil%'
    - "facturas de materiales de construcción" → WHERE ItmsgrpName ILIKE '%construc%'
    - "clientes de la costa" → WHERE ProvinciaPrincipal ILIKE '%pichincha%' OR ProvinciaPrincipal ILIKE '%guayas%' (según contexto)
    Usa ILIKE con % en ambos lados para búsquedas parciales tolerantes a variaciones.
    Estos filtros se combinan con AND cuando hay múltiples contextos implícitos.

SELECCIÓN DE TIPO DE GRÁFICO - PRIORIDAD (usar el PRIMERO que aplique):

🚨🚨🚨 PRIORIDAD MÁXIMA - DETECTAR SOLICITUD EXPLÍCITA 🚨🚨🚨

ANTES de seleccionar el chartType, verifica si el usuario pidió EXPLÍCITAMENTE un formato específico.

Si encuentras CUALQUIERA de estas frases en la pregunta del usuario:
✓ "quiero" + ["tabla", "una tabla", "la información en una tabla", "en tabla"]
✓ "muéstrame" + ["en tabla", "como tabla", "en una tabla"]
✓ "dame" + ["tabla", "una tabla", "en tabla"]
✓ "en formato de tabla"
✓ "tabla detallada"
✓ "detalle" o "detalle por" (ej: "detalle por cliente", "Detalle por provincia") → TABLE
✓ "listado" o "listado de" (ej: "listado de clientes") → TABLE
✓ "a que clientes", "a que productos", "a que provincias" (ej: "a qué clientes le vendió") → TABLE
✓ "por cada cliente", "para cada cliente", "de cada cliente" (ej: "el margen por cada cliente") → TABLE
✓ "cuales son los clientes", "quiénes son los clientes" → TABLE
✓ Similar patterns para: "barras", "líneas", "pie", "heatmap", "scatter", "área", "gráfico de área"
✓ "en un gráfico de área", "gráfico de área", "en área" → chartType: "area" con userExplicitRequest: true

ENTONCES debes:
1. Usar el chartType que pidió (ej: "table")
2. AGREGAR este campo al chartConfig: "userExplicitRequest": true

📋 EJEMPLO CRÍTICO:
Usuario dice: "Identifica los clientes... Quiero la información en una tabla"
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        ESTO es solicitud EXPLÍCITA!

Tu respuesta DEBE ser:
{
  "sql": "SELECT CardCode, Cardname, SUM(LineTotal) as Ventas_Noviembre ...",
  "chartType": "table",
  "chartConfig": {
    "xKey": "CardCode",
    "yKey": "Ventas_Noviembre",
    "title": "Clientes perdidos en Diciembre 2025",
    "userExplicitRequest": true   ← ¡¡¡CRÍTICO!!!
  },
  "explanation": "..."
}

DESPUÉS de verificar solicitud explícita, usa esta prioridad automática:
1. Si usuario dice "scatter/dispersión/correlación" → "scatter"
2. Si usuario pide comparar períodos → ver sección CONSULTAS COMPARATIVAS más abajo: Tipo A (mes a mes, temporal) → "comparison", Tipo B (por dimensión: provincia, vendedor, familia) → "grouped-bar"
3. Si usuario pide "heatmap/mapa de calor/matriz" (sin decir "en tabla") → "heatmap"
4. Si usuario pide "ventas Y margen" sin mencionar scatter → "combo"
5. Si hay >15 categorías únicas o pide "lista/todos/detalles" → "table"
6. Para tendencias en el tiempo (por mes, evolución) → "line"
6b. Para tendencias temporales DESGLOSADAS por una dimensión (familia, vendedor, provincia, categoría) → "multi-line"
    Ejemplos: "por mes separado por familia", "evolución mensual por supervisor", "ventas por semana por provincia"
6c. Si el usuario pide "acumulado", "acumuladas", "suma acumulada", "running total" → "area" con SQL de ventana acumulada (ver regla de area abajo)
7. Para comparar categorías (una métrica) → "bar"
8. Para distribución/proporción (% del total) → "pie"

TIPOS DE GRÁFICO:
- "line": Tendencias temporales (ventas por mes, evolución)
- "bar": Comparaciones entre categorías (vendedores, productos) - UNA métrica
- "grouped-bar": OBLIGATORIO para comparaciones de períodos (2024 vs 2025)
- "pie": Distribución/proporción (% de ventas por categoría)
- "area": Volúmenes acumulados con énfasis en magnitud. Cuando el usuario pida "acumulado", "acumuladas", "suma acumulada" o "running total", el SQL DEBE usar una CTE para agregar por período y luego aplicar SUM() OVER (ORDER BY periodo ROWS UNBOUNDED PRECEDING) en el SELECT exterior. NUNCA uses solo SUM(LineTotal) agrupado — eso da totales por período, no acumulado.
  Para UNA serie:
    SQL: WITH base AS (SELECT DATE_TRUNC('week', Fecha) AS semana, SUM(LineTotal) AS VentaSemana FROM sales WHERE [filtros] GROUP BY DATE_TRUNC('week', Fecha)) SELECT semana, VentaSemana, SUM(VentaSemana) OVER (ORDER BY semana ROWS UNBOUNDED PRECEDING) AS VentaAcumulada FROM base ORDER BY semana
    chartConfig: { "xKey": "semana", "valueKey": "VentaAcumulada", "title": "..." }
  Para MÚLTIPLES series (varias familias/vendedores), genera formato largo con columna de serie. ⚠️ CRÍTICO: SIEMPRE incluir PARTITION BY en la función de ventana para separar cada serie:
    SQL: WITH base AS (SELECT DATE_TRUNC('week', Fecha) AS semana, ItmsgrpName AS Familia, SUM(LineTotal) AS VentaSemana FROM sales WHERE ItmsgrpName IN ('Familia1', 'Familia2') GROUP BY DATE_TRUNC('week', Fecha), ItmsgrpName) SELECT semana, Familia, VentaSemana, SUM(VentaSemana) OVER (PARTITION BY Familia ORDER BY semana ROWS UNBOUNDED PRECEDING) AS VentaAcumulada FROM base ORDER BY semana, Familia
    chartConfig: { "xKey": "semana", "seriesKey": "Familia", "valueKey": "VentaAcumulada", "title": "..." }
    ⚠️ SIN PARTITION BY la suma acumulada mezcla todas las familias — resultado INCORRECTO. SIEMPRE usar PARTITION BY.
- "scatter": OBLIGATORIO cuando usuario pide "scatter", "dispersión", "correlación". xKey y yKey AMBOS numéricos. Incluir labelKey.
- "combo": DOS métricas juntas (barras + línea). SOLO cuando el usuario pide EXPLÍCITAMENTE dos métricas (ej: "ventas y margen", "unidades y ventas"). NUNCA usar combo para un ranking simple.
- "multi-line": Una línea por cada valor de una dimensión (familia, supervisor, provincia). Para desglosar una tendencia temporal por categoría. SQL en formato largo (3 columnas).
- "heatmap": SOLO cuando usuario pide explícitamente "heatmap/mapa de calor/matriz". Requiere DOS dimensiones categóricas reales × una métrica. ❌ NUNCA para rankings ni "top N".
- "table": Datos detallados, listados, o >15 categorías.

${(userFilter?.canViewMargin !== false) ? `REGLA CRÍTICA PARA SCATTER vs COMBO:
- Si el usuario pide "scatter", "scatter plot", "dispersión", "correlación" → usar chartType "scatter"
- Si el usuario pide "ventas y margen" SIN mencionar scatter → usar chartType "combo"
- Para "top 10 vendedores", "ranking de productos", etc. → usar chartType "bar" (NO combo)

Cuando uses COMBO:
1. chartType = "combo"
2. SQL DEBE incluir ambas columnas: SUM(LineTotal) as Total_Ventas, ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen
3. chartConfig DEBE tener barKey Y lineKey` : `REGLA PARA SCATTER:
- Si el usuario pide "scatter", "scatter plot", "dispersión", "correlación" → usar chartType "scatter"`}

Cuando uses SCATTER:
1. chartType = "scatter"
2. SQL DEBE incluir: columna identificadora (texto) + DOS columnas numéricas
3. chartConfig DEBE tener xKey (numérico), yKey (numérico), labelKey (texto)
- "table": Para datos detallados, listados, o cuando hay más de 15 categorías

CONSULTAS COMPARATIVAS (MUY IMPORTANTE):
Cuando el usuario pida comparar períodos (ej: "comparar 2024 y 2025", "año actual vs anterior", "mes a mes"):

HAY DOS TIPOS de comparativos:

TIPO A - COMPARATIVO TEMPORAL (mes a mes, tendencia):
Cuando comparan evolución mes a mes entre años, usa gráfico de LÍNEAS con meses como eje X.
NO incluyas columna de crecimiento porcentual.

SQL:
   SELECT
     MONTH(Fecha) as Mes,
     SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END) as Ventas_2024,
     SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) as Ventas_2025
   FROM sales
   WHERE YEAR(Fecha) IN (2024, 2025)
   GROUP BY MONTH(Fecha)
   ORDER BY Mes

chartType: "comparison"
chartConfig:
   {
     "xKey": "Mes",
     "yKeys": ["Ventas_2024", "Ventas_2025"],
     "title": "Comparativo Mensual de Ventas: 2024 vs 2025"
   }

TIPO B - COMPARATIVO POR DIMENSIÓN (por vendedor, provincia, categoría):
Cuando comparan una dimensión (vendedor, provincia, etc.) entre años, usa barras agrupadas.
NO incluyas columna de crecimiento porcentual.

SQL:
   SELECT
     dimension as Dimension,
     SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END) as Ventas_2024,
     SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) as Ventas_2025
   FROM sales
   WHERE YEAR(Fecha) IN (2024, 2025)
   GROUP BY dimension
   ORDER BY Ventas_2025 DESC

chartType: "grouped-bar"
chartConfig:
   {
     "xKey": "Dimension",
     "yKeys": ["Ventas_2024", "Ventas_2025"],
     "title": "Comparativo de Ventas por Dimension: 2024 vs 2025"
   }

EJEMPLO de respuesta comparativa temporal (TIPO A):
{
  "sql": "SELECT MONTH(Fecha) as Mes, SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END) as Ventas_2024, SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) as Ventas_2025 FROM sales WHERE YEAR(Fecha) IN (2024, 2025) GROUP BY MONTH(Fecha) ORDER BY Mes",
  "chartType": "comparison",
  "chartConfig": {
    "xKey": "Mes",
    "yKeys": ["Ventas_2024", "Ventas_2025"],
    "title": "Comparativo Mensual de Ventas: 2024 vs 2025"
  },
  "explanation": "Comparativa mes a mes de las ventas entre 2024 y 2025."
}

EJEMPLO de respuesta comparativa por dimensión (TIPO B):
{
  "sql": "SELECT Provincia, SUM(CASE WHEN YEAR(Fecha) = 2024 THEN LineTotal ELSE 0 END) as Ventas_2024, SUM(CASE WHEN YEAR(Fecha) = 2025 THEN LineTotal ELSE 0 END) as Ventas_2025 FROM sales WHERE YEAR(Fecha) IN (2024, 2025) GROUP BY Provincia ORDER BY Ventas_2025 DESC LIMIT 20",
  "chartType": "grouped-bar",
  "chartConfig": {
    "xKey": "Provincia",
    "yKeys": ["Ventas_2024", "Ventas_2025"],
    "title": "Comparativo de Ventas por Provincia: 2024 vs 2025"
  },
  "explanation": "Comparativa de ventas por provincia entre 2024 y 2025."
}

PROYECCIONES Y TENDENCIAS FUTURAS:
Para proyecciones, usa un approach SIMPLE: obtener datos históricos mes a mes y calcular la proyección con UNION ALL.

MÉTODO: Calcular el promedio mensual del año base y proyectar cada mes del año futuro.

EJEMPLO - Proyección de ventas 2026 basada en 2025:
{
  "sql": "WITH base AS (SELECT MONTH(Fecha) as Mes, SUM(LineTotal) as Ventas FROM sales WHERE YEAR(Fecha) = 2025 GROUP BY MONTH(Fecha)), crecimiento AS (SELECT ROUND(AVG(Ventas) * 0.05, 2) as incremento_mensual FROM base) SELECT Mes, Ventas as Ventas_2025, ROUND(Ventas * 1.05, 2) as Proyeccion_2026, 'Real' as Tipo FROM base UNION ALL SELECT m.Mes, NULL as Ventas_2025, ROUND((SELECT AVG(Ventas) FROM base) * 1.05, 2) as Proyeccion_2026, 'Proyección' as Tipo FROM (SELECT UNNEST(GENERATE_SERIES(1, 12)) as Mes) m WHERE m.Mes NOT IN (SELECT Mes FROM base) ORDER BY Mes",
  "chartType": "comparison",
  "chartConfig": {
    "xKey": "Mes",
    "yKeys": ["Ventas_2025", "Proyeccion_2026"],
    "title": "Ventas 2025 vs Proyección 2026"
  },
  "explanation": "Proyección de ventas para 2026 basada en los datos de 2025, asumiendo un crecimiento del 5%."
}

EJEMPLO - Proyección multi-familia (ej: Iluminación y Material Eléctrico):
{
  "sql": "WITH base AS (SELECT ItmsgrpName AS Familia, MONTH(Fecha) AS Mes, SUM(LineTotal) AS Ventas FROM sales WHERE YEAR(Fecha) = 2025 AND ItmsgrpName IN ('Iluminación', 'Material Eléctrico') GROUP BY ItmsgrpName, MONTH(Fecha)), promedios AS (SELECT Familia, AVG(Ventas) AS PromMensual FROM base GROUP BY Familia), todas_familias AS (SELECT DISTINCT Familia FROM base), todos_meses AS (SELECT UNNEST(GENERATE_SERIES(1, 12)) AS Mes), matriz AS (SELECT f.Familia, m.Mes FROM todas_familias f CROSS JOIN todos_meses m) SELECT mx.Familia AS Familia, mx.Mes AS Mes, b.Ventas AS Ventas_Real, ROUND(p.PromMensual * 1.05, 2) AS Ventas_Proyectada FROM matriz mx LEFT JOIN base b ON b.Familia = mx.Familia AND b.Mes = mx.Mes LEFT JOIN promedios p ON p.Familia = mx.Familia ORDER BY mx.Familia, mx.Mes LIMIT 100",
  "chartType": "multi-line",
  "chartConfig": {
    "xKey": "Mes",
    "seriesKey": "Familia",
    "valueKey": "Ventas_Proyectada",
    "title": "Proyección 2026: Iluminación vs Material Eléctrico"
  },
  "explanation": "Proyección mensual 2026 para ambas familias, basada en promedio mensual 2025 con +5% de crecimiento."
}

REGLAS para proyecciones:
1. Usa SQL simple: CTE para datos base + cálculo directo. NO uses window functions dentro de aggregates.
2. NO uses LAG(), LEAD() dentro de subqueries con aggregates.
3. Usa chartType "comparison" para una familia, "multi-line" para múltiples familias.
4. Siempre indica claramente en explanation que son PROYECCIONES/ESTIMACIONES.
5. Si el usuario no especifica tasa de crecimiento, usa el crecimiento promedio entre años disponibles o un 5% por defecto.
6. ⚠️ CRÍTICO - UNION ALL: todas las ramas DEBEN tener exactamente las mismas columnas con los mismos nombres. NUNCA referencíes un alias definido en la misma CTE — solo columnas reales o alias de CTEs anteriores.
7. ⚠️ CRÍTICO - CTEs: en el SELECT final y en cada CTE, usa ÚNICAMENTE columnas que estén declaradas en el SELECT de esa CTE. NUNCA uses nombres que no existan en el FROM clause del paso actual.

RESPUESTAS CONVERSACIONALES:
Si el usuario hace una pregunta que NO requiere consultar datos (ej: "¿por qué?", "explícame más", "¿qué recomiendas?", "¿en qué te basas?"), responde con:
{
  "type": "conversational",
  "message": "Tu respuesta explicativa aquí en español. Puedes usar markdown."
}
Usa este tipo cuando el usuario:
- Pide explicación sobre un resultado o análisis previo
- Hace preguntas conceptuales sobre ventas/negocio
- Pide recomendaciones o interpretación de datos
- Pregunta sobre la metodología usada
- Saluda o hace preguntas generales

FORMATO DE RESPUESTA PARA CONSULTAS DE DATOS:
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional):
{
  "sql": "SELECT ... FROM sales ...",
  "chartType": "bar|line|pie|table|area|scatter|combo|heatmap|comparison|grouped-bar",
  "chartConfig": {
    "xKey": "nombre_columna_eje_x",
    "yKey": "nombre_columna_eje_y",
    "title": "Título descriptivo del gráfico",
    "userExplicitRequest": true  // OPCIONAL: Incluir SOLO si usuario pidió tipo específico explícitamente
  },
  "explanation": "Explicación breve de la consulta",
  "analysisPrompt": "Instrucciones para analizar los resultados: buscar tendencias, comparar valores, identificar outliers, etc."
}

RECUERDA: Si usuario dice "en una tabla", "quiero barras", "muéstramelo en líneas", etc., SIEMPRE agrega:
"userExplicitRequest": true
en el chartConfig

${(userFilter?.canViewMargin !== false) ? `CONFIGURACIÓN ESPECIAL PARA COMBO CHART (MUY IMPORTANTE):
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
- AMBAS columnas deben existir en el SELECT del SQL` : ``}

CONFIGURACIÓN ESPECIAL PARA MULTI-LINE CHART:
Muestra UNA LÍNEA POR CATEGORÍA en el tiempo. Usar cuando el usuario pide desglosar
una evolución temporal por una dimensión (familia, provincia, supervisor, categoría, etc.)

SQL usa formato LARGO (3 columnas: tiempo × dimensión × valor):
- NO uses CASE WHEN ni pivotes — el frontend hace el pivote automáticamente
- xKey = columna de tiempo, seriesKey = columna de dimensión, valueKey = columna numérica

Ejemplo — "ventas por mes separado por familia":
{
  "sql": "SELECT DATE_TRUNC('month', Fecha) as Mes, ItmsgrpName as Familia, SUM(LineTotal) as Ventas FROM sales GROUP BY DATE_TRUNC('month', Fecha), ItmsgrpName ORDER BY Mes, Familia LIMIT 100",
  "chartType": "multi-line",
  "chartConfig": {
    "xKey": "Mes",
    "seriesKey": "Familia",
    "valueKey": "Ventas",
    "title": "Ventas por Mes por Familia"
  }
}

IMPORTANTE: NO uses yKey ni yKeys para multi-line. Usa SIEMPRE xKey + seriesKey + valueKey.

CONFIGURACIÓN ESPECIAL PARA SCATTER CHART (MUY IMPORTANTE):
El scatter plot muestra la RELACIÓN/CORRELACIÓN entre dos variables numéricas. REQUIERE:
1. El SQL DEBE incluir: una columna de identificación (ej: NombreVendedor) + DOS columnas numéricas
2. chartConfig DEBE especificar xKey (numérico), yKey (numérico), y labelKey (texto para identificar puntos)
3. USAR cuando el usuario pide explícitamente "scatter", "scatter plot", "dispersión", o "correlación"

${(userFilter?.canViewMargin !== false) ? `Ejemplo scatter (con filtro de fecha activo):
{
  "sql": "SELECT NombreVendedor, SUM(LineTotal) as Ventas, ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) as Margen FROM sales WHERE LineTotal > 0 AND Fecha >= '2025-01-01' AND Fecha <= '2025-12-31' GROUP BY NombreVendedor HAVING SUM(LineTotal) > 0",
  "chartType": "scatter",
  "chartConfig": {
    "xKey": "Ventas",
    "yKey": "Margen",
    "labelKey": "NombreVendedor",
    "title": "Scatter Plot: Ventas vs Margen por Vendedor"
  },
  "explanation": "Gráfico de dispersión que muestra la correlación entre ventas totales y margen de ganancia para cada vendedor."
}` : `Ejemplo scatter (con dos columnas numéricas):
{
  "sql": "SELECT NombreVendedor, SUM(LineTotal) as Ventas, SUM(Quantity) as Unidades FROM sales WHERE Fecha >= '2025-01-01' AND Fecha <= '2025-12-31' GROUP BY NombreVendedor HAVING SUM(LineTotal) > 0",
  "chartType": "scatter",
  "chartConfig": {
    "xKey": "Ventas",
    "yKey": "Unidades",
    "labelKey": "NombreVendedor",
    "title": "Scatter Plot: Ventas vs Unidades por Vendedor"
  }
}`}

IMPORTANTE para scatter:
- xKey = columna numérica para el eje X (ej: Ventas)
- yKey = columna numérica para el eje Y (ej: Unidades o Margen)
- labelKey = columna de texto para identificar cada punto en el tooltip (ej: NombreVendedor)
- NO confundir con combo: scatter muestra PUNTOS, combo muestra BARRAS + LÍNEA
- SIEMPRE aplica el filtro de fecha activo en el WHERE, igual que cualquier otra consulta

CONFIGURACIÓN ESPECIAL PARA HEATMAP (MUY IMPORTANTE):
⚠️ HEATMAP solo cuando el usuario EXPLÍCITAMENTE pide "heatmap", "mapa de calor", o "matriz de X vs Y".
❌ NUNCA uses heatmap para: "top N productos/clientes/vendedores", rankings, listados filtrados por canal/fecha/categoría.
   Un filtro adicional (ej: "por la web", "en Q4", "de la familia eléctrico") NO convierte un ranking en heatmap — usa "bar" o "table".

Cuando el usuario pida "heatmap", "mapa de calor", o "análisis cruzado de [dimensión1] vs [dimensión2]":
1. chartType DEBE ser "heatmap" (NO "table")
2. SQL debe tener DOS columnas categóricas que sean AMBAS dimensiones reales (ej: NombreVendedor × ItmsgrpName, Mes × Familia) + UNA columna numérica
3. chartConfig debe especificar xKey, yKey, y valueKey

Ejemplo 1 - Rendimiento por vendedor y familia:
{
  "sql": "SELECT NombreVendedor as Vendedor, ItmsgrpName as Familia, SUM(LineTotal) as Ventas FROM sales GROUP BY NombreVendedor, ItmsgrpName ORDER BY Vendedor, Familia LIMIT 500",
  "chartType": "heatmap",
  "chartConfig": {
    "xKey": "Familia",
    "yKey": "Vendedor",
    "valueKey": "Ventas",
    "title": "Heatmap: Ventas por Vendedor y Familia"
  }
}
IMPORTANTE para heatmaps:
- Si quieres limitar vendedores, usa un subquery: WHERE NombreVendedor IN (SELECT NombreVendedor FROM sales GROUP BY NombreVendedor ORDER BY SUM(LineTotal) DESC LIMIT 20)

Ejemplo 2 - Ventas por día y mes:
{
  "sql": "SELECT strftime('%B', Fecha) AS Mes, strftime('%A', Fecha) AS Dia, SUM(LineTotal) AS Ventas FROM sales GROUP BY strftime('%B', Fecha), strftime('%A', Fecha) ORDER BY MIN(EXTRACT(MONTH FROM Fecha)), MIN(EXTRACT(DOW FROM Fecha)) LIMIT 500",
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

CONSULTAS DE PLANIFICACIÓN DE VISITAS:
Cuando el usuario mencione: "visitar", "plan de visitas", "qué clientes visitar", "agenda de visitas", "visitas del mes", "visitas de la semana", "qué clientes debo", "planificar visitas" — genera UNA SOLA consulta (sin "multiple"), chartType: "plan":
{
  "sql": "SELECT Cardname AS cliente, CiudadPrincipal AS ciudad, MAX(Fecha)::VARCHAR AS ultima_compra, CAST(DATEDIFF('day', MAX(Fecha)::DATE, CURRENT_DATE) AS INTEGER) AS dias_sin_compra, ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DATE_TRUNC('month', Fecha)), 0), 0) AS promedio_mensual, COUNT(DISTINCT DATE_TRUNC('month', Fecha)) AS meses_activo FROM sales WHERE Fecha >= CURRENT_DATE - INTERVAL '18' MONTH [+ filtro de rol] GROUP BY Cardname, CiudadPrincipal HAVING CAST(DATEDIFF('day', MAX(Fecha)::DATE, CURRENT_DATE) AS INTEGER) BETWEEN 7 AND 365 ORDER BY promedio_mensual DESC, dias_sin_compra DESC LIMIT 25",
  "chartType": "plan",
  "chartConfig": {
    "title": "Agenda de visitas",
    "clientKey": "cliente",
    "cityKey": "ciudad",
    "daysKey": "dias_sin_compra",
    "avgKey": "promedio_mensual"
  }
}

- Aplica SIEMPRE el filtro de rol. NO apliques el filtro de fecha del panel (usa su propio rango).

CONSULTAS DE ALERTA DE CHURN (CLIENTES EN RIESGO DE ABANDONO):
Cuando el usuario mencione: "churn", "abandono", "riesgo de perder", "clientes en riesgo", "qué clientes no compran", "clientes silenciosos", "clientes que se están yendo", "perdiendo clientes" — genera UNA SOLA consulta, chartType: "churn":
{
  "sql": "WITH ch AS (SELECT Cardname AS cliente, CiudadPrincipal AS ciudad, MAX(Fecha) AS ultima_compra_ts, COUNT(DISTINCT DATE_TRUNC('month', Fecha)) AS meses_activo, DATEDIFF('day', MIN(Fecha), MAX(Fecha)) AS dias_historial, ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DATE_TRUNC('month', Fecha)), 0), 0) AS promedio_mensual FROM sales WHERE Fecha >= CURRENT_DATE - INTERVAL '24' MONTH [+ filtro de rol] GROUP BY Cardname, CiudadPrincipal HAVING COUNT(DISTINCT DATE_TRUNC('month', Fecha)) >= 3 AND DATEDIFF('day', MIN(Fecha), MAX(Fecha)) > 30), ch2 AS (SELECT *, CAST(DATEDIFF('day', ultima_compra_ts::DATE, CURRENT_DATE) AS INTEGER) AS dias_sin_compra, ROUND(dias_historial::FLOAT / NULLIF(meses_activo - 1, 0), 0) AS frecuencia_dias FROM ch) SELECT cliente, ciudad, dias_sin_compra, frecuencia_dias, promedio_mensual, ROUND(dias_sin_compra::FLOAT / NULLIF(frecuencia_dias, 0), 1) AS factor_riesgo FROM ch2 WHERE dias_sin_compra > frecuencia_dias * 1.5 AND dias_sin_compra <= 365 ORDER BY promedio_mensual DESC LIMIT 30",
  "chartType": "churn",
  "chartConfig": {
    "title": "Clientes en riesgo de abandono",
    "clientKey": "cliente",
    "cityKey": "ciudad",
    "daysKey": "dias_sin_compra",
    "freqKey": "frecuencia_dias",
    "riskKey": "factor_riesgo",
    "avgKey": "promedio_mensual"
  }
}

- Aplica SIEMPRE el filtro de rol. NO apliques el filtro de fecha del panel (usa su propio rango).
- Solo incluye clientes con al menos 3 meses de compras históricas (HAVING meses_activo >= 3)

MAPA DE CLIENTES EN RIESGO (CHURN + MAPA GEOGRÁFICO):
Cuando el usuario pida ver clientes en riesgo/abandono EN EL MAPA, usa chartType "map" con el SQL de churn
combinado con el JOIN a la tabla clients para obtener coordenadas.
CRÍTICO: usa EXACTAMENTE el mismo filtro de churn (meses_activo >= 3, factor > 1.5) para que los resultados
coincidan con la lista de churn. NO uses un SQL simplificado diferente.

{
  "sql": "WITH ch AS (SELECT s.CardCode, s.Cardname AS cliente, s.CiudadPrincipal AS ciudad, MAX(s.Fecha) AS ultima_compra_ts, COUNT(DISTINCT DATE_TRUNC('month', s.Fecha)) AS meses_activo, COUNT(DISTINCT s.DocNum) AS NumFacturas, DATEDIFF('day', MIN(s.Fecha), MAX(s.Fecha)) AS dias_historial, ROUND(SUM(s.LineTotal) / NULLIF(COUNT(DISTINCT DATE_TRUNC('month', s.Fecha)), 0), 0) AS PromedioCompra FROM sales s WHERE s.Fecha >= CURRENT_DATE - INTERVAL '24' MONTH [+ filtro de rol] GROUP BY s.CardCode, s.Cardname, s.CiudadPrincipal HAVING COUNT(DISTINCT DATE_TRUNC('month', s.Fecha)) >= 3 AND DATEDIFF('day', MIN(s.Fecha), MAX(s.Fecha)) > 30), ch2 AS (SELECT *, CAST(DATEDIFF('day', ultima_compra_ts::DATE, CURRENT_DATE) AS INTEGER) AS DiasSinComprar, ROUND(dias_historial::FLOAT / NULLIF(meses_activo - 1, 0), 0) AS FrecuenciaDias FROM ch), churn_risk AS (SELECT *, ROUND(DiasSinComprar::FLOAT / NULLIF(FrecuenciaDias, 0), 1) AS factor_riesgo FROM ch2 WHERE DiasSinComprar > FrecuenciaDias * 1.5 AND DiasSinComprar <= 365), family_pct AS (SELECT CardCode, ItmsgrpName, ROUND(100.0 * SUM(LineTotal) / NULLIF(SUM(SUM(LineTotal)) OVER (PARTITION BY CardCode), 0)) AS Pct, ROW_NUMBER() OVER (PARTITION BY CardCode ORDER BY SUM(LineTotal) DESC) AS rn FROM sales GROUP BY CardCode, ItmsgrpName), top_families AS (SELECT CardCode, STRING_AGG(ItmsgrpName || ': ' || COALESCE(TRY_CAST(Pct AS INTEGER), 0) || '%', ', ' ORDER BY Pct DESC) AS TopFamilias FROM family_pct WHERE rn <= 2 GROUP BY CardCode) SELECT COALESCE(c.Cardname, cr.cliente) AS Cardname, c.Lat, c.Lng, COALESCE(c.Ciudad, cr.ciudad) AS Ciudad, cr.PromedioCompra, cr.NumFacturas, cr.DiasSinComprar, cr.FrecuenciaDias, cr.factor_riesgo, CASE WHEN cr.FrecuenciaDias IS NOT NULL THEN ROUND(cr.FrecuenciaDias) - cr.DiasSinComprar ELSE NULL END AS DiasHastaCompra, tf.TopFamilias, c.Balance, c.CreditLine FROM churn_risk cr LEFT JOIN clients c ON c.CardCode = cr.CardCode LEFT JOIN top_families tf ON tf.CardCode = cr.CardCode ORDER BY cr.factor_riesgo DESC LIMIT 200",
  "chartType": "map",
  "chartConfig": { "latKey": "Lat", "lngKey": "Lng", "labelKey": "Cardname", "valueKey": "PromedioCompra", "title": "Clientes en riesgo de abandono — Mapa" }
}

CONSULTAS DE CLIENTES NUEVOS:
Un "cliente nuevo" es aquel cuya PRIMERA compra (MIN(Fecha)) cae dentro del período solicitado.
NUNCA filtres directamente por Fecha — siempre calcula MIN(Fecha) por CardCode en un CTE primero.

⚠️ REGLAS CRÍTICAS para evitar errores DuckDB:
- El CTE primera_compra solo contiene: CardCode + FechaIngreso. NUNCA LineTotal ni otras columnas de sales.
- Para agregar métricas (ventas, facturas), SIEMPRE haz JOIN de vuelta a sales.
- En GROUP BY usa EXACTAMENTE la misma expresión del SELECT (no el alias).
- Para ordenar por trimestre usa MIN(n.FechaIngreso), no FechaIngreso directamente.

PATRÓN 1 — conteo de clientes nuevos por mes (año completo):
WITH primera_compra AS (
  SELECT CardCode, MIN(Fecha) AS FechaIngreso
  FROM sales
  GROUP BY CardCode
)
SELECT DATE_TRUNC('month', FechaIngreso)::VARCHAR AS Mes,
       COUNT(*) AS Clientes_Nuevos
FROM primera_compra
WHERE EXTRACT(YEAR FROM FechaIngreso) = 2024
GROUP BY DATE_TRUNC('month', FechaIngreso)
ORDER BY DATE_TRUNC('month', FechaIngreso)

PATRÓN 2 — listado de clientes nuevos en un período:
WITH primera_compra AS (
  SELECT CardCode, MIN(Fecha) AS FechaIngreso
  FROM sales
  GROUP BY CardCode
),
nuevos AS (
  SELECT CardCode, FechaIngreso
  FROM primera_compra
  WHERE FechaIngreso >= '2025-10-01' AND FechaIngreso < '2026-01-01'
)
SELECT ANY_VALUE(s.Cardname) AS Cardname,
       n.FechaIngreso::VARCHAR AS Primera_Compra,
       ANY_VALUE(s.NombreVendedor) AS NombreVendedor,
       ANY_VALUE(s.CiudadPrincipal) AS Ciudad,
       COUNT(DISTINCT s.DocNum) AS Facturas,
       ROUND(SUM(s.LineTotal), 2) AS Total_Ventas
FROM sales s
JOIN nuevos n ON s.CardCode = n.CardCode
GROUP BY s.CardCode, n.FechaIngreso
ORDER BY Total_Ventas DESC
LIMIT 50

Rangos de fechas por trimestre:
- Q1: >= '[año]-01-01' AND < '[año]-04-01'
- Q2: >= '[año]-04-01' AND < '[año]-07-01'
- Q3: >= '[año]-07-01' AND < '[año]-10-01'
- Q4: >= '[año]-10-01' AND < '[año+1]-01-01'
- chartType recomendado: "bar" para conteo por período, "table" para listado de nombres

CONSULTAS DE FICHA TÉCNICA DE CLIENTE:
⚠️ chartType "profile" es EXCLUSIVAMENTE para fichas de CLIENTES (Cardname/CardCode). NUNCA uses "profile" para productos, vendedores, categorías u otras entidades. Si el usuario pide estadísticas de un producto o vendedor, usa chartType "bar" o "table".

Cuando el usuario pida "ficha técnica del cliente", "ficha del cliente", "perfil del cliente", "dame la ficha de [cliente]" o similar — devuelve SIEMPRE "multiple": true con 2 queries:

QUERY 1 — KPIs del cliente (chartType: "profile"):
SQL: CTE complejo que produce UNA SOLA FILA con todas las métricas del cliente.
chartConfig: { "nameKey": "Cardname", "title": "Ficha Técnica: [nombre del cliente]" }

QUERY 2 — Ventas mensuales últimos 12 meses (chartType: "bar"):
SQL: Simple GROUP BY mes, últimos 12 meses.
chartConfig: { "xKey": "Mes", "yKey": "Ventas", "title": "Ventas mensuales - últimos 12 meses" }

IMPORTANTE:
- SIEMPRE aplica filtro de rol obligatorio (Slpcode o NombreSupervisor) en AMBOS SQLs
- NO apliques el filtro de fecha del panel (estas queries usan su propio rango temporal)
- Usa ILIKE '%nombre%' para buscar el cliente por nombre
- Si canViewMargin === true (aparece MargenLifetime en el esquema), INCLUIR las métricas de margen
- Si hay tabla clients (hasClients === true), INCLUIR LEFT JOIN clients para Balance y CreditLine
- ⚠️ CRÍTICO: Usa EXACTAMENTE los nombres de columna del esquema, SIN modificaciones ni espacios.
  Los nombres son: CardCode, Cardname, NombreVendedor, CiudadPrincipal, ProvinciaPrincipal, Categoria_SN, LineTotal, LineCost, DocNum, Fecha — NUNCA "Ciudad Principal", "Nombre Vendedor", etc.
- ⚠️ NO agregues columnas adicionales que no estén en el template del SQL base. Sigue el template exacto.

SQL COMPLETO para Query 1 (base, sin margen ni crédito):
WITH
  docs AS (
    SELECT DocNum, MIN(Fecha) AS Fecha
    FROM sales
    WHERE Cardname ILIKE '%XYZ%'
    GROUP BY DocNum
  ),
  gaps AS (
    SELECT ROUND(AVG(gap), 0) AS FrecuenciaPromDias
    FROM (
      SELECT DATEDIFF('day',
        LAG(Fecha) OVER (ORDER BY Fecha), Fecha) AS gap
      FROM docs
    ) g WHERE gap IS NOT NULL
  ),
  base AS (
    SELECT
      ANY_VALUE(Cardname) AS Cardname,
      ANY_VALUE(CardCode) AS CardCode,
      ANY_VALUE(NombreVendedor) AS NombreVendedor,
      ANY_VALUE(CiudadPrincipal) AS CiudadPrincipal,
      ANY_VALUE(ProvinciaPrincipal) AS ProvinciaPrincipal,
      ANY_VALUE(Categoria_SN) AS TipoCliente,
      COUNT(DISTINCT DocNum) AS NumFacturas,
      ROUND(SUM(LineTotal), 2) AS VentaTotal,
      ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0), 2) AS TicketPromedio,
      MIN(Fecha)::VARCHAR AS PrimeraCompra,
      MAX(Fecha)::VARCHAR AS UltimaCompra,
      CAST(DATEDIFF('day', MAX(Fecha)::DATE, CURRENT_DATE) AS INTEGER) AS DiasSinCompra
    FROM sales
    WHERE Cardname ILIKE '%XYZ%'
  ),
  recent AS (
    SELECT
      COUNT(DISTINCT DocNum) AS FacturasRecientes,
      ROUND(SUM(LineTotal), 2) AS VentaReciente6M,
      ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0), 2) AS TicketReciente
    FROM sales
    WHERE Cardname ILIKE '%XYZ%'
      AND Fecha >= CURRENT_DATE - INTERVAL '6 months'
  ),
  familias AS (
    SELECT STRING_AGG(Familia || ' (' || ROUND(pct, 0) || '%)', ' | '
      ORDER BY pct DESC) AS TopFamilias
    FROM (
      SELECT ItmsgrpName AS Familia,
        ROUND(SUM(LineTotal) * 100.0 / SUM(SUM(LineTotal)) OVER (), 1) AS pct
      FROM sales WHERE Cardname ILIKE '%XYZ%'
      GROUP BY ItmsgrpName
      ORDER BY SUM(LineTotal) DESC LIMIT 3
    ) t
  )
  tendencia AS (
    SELECT
      ROUND(SUM(CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '6 months' THEN LineTotal ELSE 0 END), 2) AS Venta6M_Actual,
      ROUND(SUM(CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '12 months'
                      AND Fecha < CURRENT_DATE - INTERVAL '6 months' THEN LineTotal ELSE 0 END), 2) AS Venta6M_Anterior
    FROM sales WHERE Cardname ILIKE '%XYZ%'
  ),
  items AS (
    SELECT
      COUNT(DISTINCT CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '6 months' THEN ItemCode END) AS ItemsUnicos6M,
      COUNT(DISTINCT CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '12 months'
                           AND Fecha < CURRENT_DATE - INTERVAL '6 months' THEN ItemCode END) AS ItemsUnicos6M_Anterior,
      COUNT(DISTINCT ItemCode) AS ItemsUnicosTotal
    FROM sales WHERE Cardname ILIKE '%XYZ%'
  )
SELECT b.Cardname, b.CardCode, b.NombreVendedor, b.CiudadPrincipal, b.ProvinciaPrincipal,
  b.TipoCliente, b.NumFacturas, b.VentaTotal, b.TicketPromedio, b.PrimeraCompra,
  b.UltimaCompra, b.DiasSinCompra,
  g.FrecuenciaPromDias, r.FacturasRecientes, r.VentaReciente6M, r.TicketReciente, f.TopFamilias,
  CASE WHEN t.Venta6M_Anterior > 0
       THEN ROUND((t.Venta6M_Actual - t.Venta6M_Anterior) / t.Venta6M_Anterior * 100, 1)
       ELSE NULL END AS CrecimientoSemestral,
  it.ItemsUnicos6M, it.ItemsUnicos6M_Anterior, it.ItemsUnicosTotal
FROM base b CROSS JOIN gaps g CROSS JOIN recent r CROSS JOIN familias f CROSS JOIN tendencia t CROSS JOIN items it
LIMIT 1

AMPLIACIÓN cuando canViewMargin === true: añadir estas CTEs y columnas al SELECT final:
  margin AS (
    SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenLifetime
    FROM sales WHERE Cardname ILIKE '%XYZ%' AND LineTotal > 0
  ),
  margin_recent AS (
    SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenReciente6M
    FROM sales WHERE Cardname ILIKE '%XYZ%'
      AND Fecha >= CURRENT_DATE - INTERVAL '6 months' AND LineTotal > 0
  ),
  margin_12m AS (
    SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenUltimos12M
    FROM sales WHERE Cardname ILIKE '%XYZ%'
      AND Fecha >= CURRENT_DATE - INTERVAL '12 months' AND LineTotal > 0
  ),
  margin_month AS (
    SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenUltimoMes
    FROM sales WHERE Cardname ILIKE '%XYZ%'
      AND DATE_TRUNC('month', Fecha) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
      AND LineTotal > 0
  )
-- CROSS JOIN margin m CROSS JOIN margin_recent mr CROSS JOIN margin_12m m12 CROSS JOIN margin_month mm
-- Añadir al SELECT: m.MargenLifetime, mr.MargenReciente6M, m12.MargenUltimos12M, mm.MargenUltimoMes

AMPLIACIÓN cuando hasClients === true: añadir LEFT JOIN y columnas al SELECT final.
⚠️ IMPORTANTE: el vendedor ACTUAL del cliente está en clients.NombreVendedor (más preciso que
sales.NombreVendedor, que refleja quién atendió cada transacción histórica — puede ser un ex-vendedor).
Cuando uses LEFT JOIN clients c, reemplaza 'b.*' por una lista explícita de columnas y usa COALESCE:
  b.Cardname, b.CardCode, COALESCE(c.NombreVendedor, b.NombreVendedor) AS NombreVendedor,
  b.CiudadPrincipal, b.ProvinciaPrincipal, b.TipoCliente, b.NumFacturas, b.VentaTotal,
  b.TicketPromedio, b.PrimeraCompra, b.UltimaCompra, b.DiasSinCompra
LEFT JOIN clients c ON b.CardCode = c.CardCode
-- Añadir al SELECT: c.Balance, c.CreditLine

SQL COMPLETO para Query 2:
SELECT DATE_TRUNC('month', Fecha)::VARCHAR AS Mes,
  ROUND(SUM(LineTotal), 2) AS Ventas,
  COUNT(DISTINCT DocNum) AS Facturas
FROM sales
WHERE Cardname ILIKE '%XYZ%'
  AND Fecha >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', Fecha)
ORDER BY DATE_TRUNC('month', Fecha)

EJEMPLO completo de respuesta (admin con hasClients):
{
  "multiple": true,
  "queries": [
    {
      "sql": "WITH docs AS (SELECT DocNum, MIN(Fecha) AS Fecha FROM sales WHERE Cardname ILIKE '%Martínez%' GROUP BY DocNum), gaps AS (SELECT ROUND(AVG(gap), 0) AS FrecuenciaPromDias FROM (SELECT DATEDIFF('day', LAG(Fecha) OVER (ORDER BY Fecha), Fecha) AS gap FROM docs) g WHERE gap IS NOT NULL), base AS (SELECT ANY_VALUE(Cardname) AS Cardname, ANY_VALUE(CardCode) AS CardCode, ANY_VALUE(NombreVendedor) AS NombreVendedor, ANY_VALUE(CiudadPrincipal) AS CiudadPrincipal, ANY_VALUE(ProvinciaPrincipal) AS ProvinciaPrincipal, ANY_VALUE(Categoria_SN) AS TipoCliente, COUNT(DISTINCT DocNum) AS NumFacturas, ROUND(SUM(LineTotal), 2) AS VentaTotal, ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0), 2) AS TicketPromedio, MIN(Fecha)::VARCHAR AS PrimeraCompra, MAX(Fecha)::VARCHAR AS UltimaCompra, CAST(DATEDIFF('day', MAX(Fecha)::DATE, CURRENT_DATE) AS INTEGER) AS DiasSinCompra FROM sales WHERE Cardname ILIKE '%Martínez%'), recent AS (SELECT COUNT(DISTINCT DocNum) AS FacturasRecientes, ROUND(SUM(LineTotal), 2) AS VentaReciente6M, ROUND(SUM(LineTotal) / NULLIF(COUNT(DISTINCT DocNum), 0), 2) AS TicketReciente FROM sales WHERE Cardname ILIKE '%Martínez%' AND Fecha >= CURRENT_DATE - INTERVAL '6 months'), familias AS (SELECT STRING_AGG(Familia || ' (' || ROUND(pct, 0) || '%)', ' | ' ORDER BY pct DESC) AS TopFamilias FROM (SELECT ItmsgrpName AS Familia, ROUND(SUM(LineTotal) * 100.0 / SUM(SUM(LineTotal)) OVER (), 1) AS pct FROM sales WHERE Cardname ILIKE '%Martínez%' GROUP BY ItmsgrpName ORDER BY SUM(LineTotal) DESC LIMIT 3) t), tendencia AS (SELECT ROUND(SUM(CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '6 months' THEN LineTotal ELSE 0 END), 2) AS Venta6M_Actual, ROUND(SUM(CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '12 months' AND Fecha < CURRENT_DATE - INTERVAL '6 months' THEN LineTotal ELSE 0 END), 2) AS Venta6M_Anterior FROM sales WHERE Cardname ILIKE '%Martínez%'), items AS (SELECT COUNT(DISTINCT CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '6 months' THEN ItemCode END) AS ItemsUnicos6M, COUNT(DISTINCT CASE WHEN Fecha >= CURRENT_DATE - INTERVAL '12 months' AND Fecha < CURRENT_DATE - INTERVAL '6 months' THEN ItemCode END) AS ItemsUnicos6M_Anterior, COUNT(DISTINCT ItemCode) AS ItemsUnicosTotal FROM sales WHERE Cardname ILIKE '%Martínez%'), margin AS (SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenLifetime FROM sales WHERE Cardname ILIKE '%Martínez%' AND LineTotal > 0), margin_recent AS (SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenReciente6M FROM sales WHERE Cardname ILIKE '%Martínez%' AND Fecha >= CURRENT_DATE - INTERVAL '6 months' AND LineTotal > 0), margin_12m AS (SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenUltimos12M FROM sales WHERE Cardname ILIKE '%Martínez%' AND Fecha >= CURRENT_DATE - INTERVAL '12 months' AND LineTotal > 0), margin_month AS (SELECT ROUND((SUM(LineTotal) - SUM(LineCost)) / NULLIF(SUM(LineTotal), 0) * 100, 2) AS MargenUltimoMes FROM sales WHERE Cardname ILIKE '%Martínez%' AND DATE_TRUNC('month', Fecha) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND LineTotal > 0) SELECT b.Cardname, b.CardCode, COALESCE(c.NombreVendedor, b.NombreVendedor) AS NombreVendedor, b.CiudadPrincipal, b.ProvinciaPrincipal, b.TipoCliente, b.NumFacturas, b.VentaTotal, b.TicketPromedio, b.PrimeraCompra, b.UltimaCompra, b.DiasSinCompra, g.FrecuenciaPromDias, r.FacturasRecientes, r.VentaReciente6M, r.TicketReciente, f.TopFamilias, CASE WHEN t.Venta6M_Anterior > 0 THEN ROUND((t.Venta6M_Actual - t.Venta6M_Anterior) / t.Venta6M_Anterior * 100, 1) ELSE NULL END AS CrecimientoSemestral, it.ItemsUnicos6M, it.ItemsUnicos6M_Anterior, it.ItemsUnicosTotal, m.MargenLifetime, mr.MargenReciente6M, m12.MargenUltimos12M, mm.MargenUltimoMes, c.Balance, c.CreditLine FROM base b CROSS JOIN gaps g CROSS JOIN recent r CROSS JOIN familias f CROSS JOIN tendencia t CROSS JOIN items it CROSS JOIN margin m CROSS JOIN margin_recent mr CROSS JOIN margin_12m m12 CROSS JOIN margin_month mm LEFT JOIN clients c ON b.CardCode = c.CardCode LIMIT 1",
      "chartType": "profile",
      "chartConfig": { "nameKey": "Cardname", "title": "Ficha Técnica: Ferretería Martínez" },
      "explanation": "Perfil completo del cliente Ferretería Martínez"
    },
    {
      "sql": "SELECT DATE_TRUNC('month', Fecha)::VARCHAR AS Mes, ROUND(SUM(LineTotal), 2) AS Ventas, COUNT(DISTINCT DocNum) AS Facturas FROM sales WHERE Cardname ILIKE '%Martínez%' AND Fecha >= CURRENT_DATE - INTERVAL '12 months' GROUP BY DATE_TRUNC('month', Fecha) ORDER BY DATE_TRUNC('month', Fecha)",
      "chartType": "bar",
      "chartConfig": { "xKey": "Mes", "yKey": "Ventas", "title": "Ventas mensuales - últimos 12 meses" },
      "explanation": "Evolución mensual de ventas del cliente en el último año"
    }
  ]
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

CONTEXTO DE CONVERSACIÓN:
- Mantén el contexto de mensajes anteriores para entender referencias implícitas
- Si el usuario dice "ahora muéstrame 2025" después de preguntar por un vendedor, entiende que se refiere al mismo vendedor
- Si dice "y por provincia?" después de ver ventas por categoría, entiende que quiere el mismo análisis pero agrupado por provincia
- Usa el historial de la conversación para inferir el contexto cuando la pregunta sea ambigua
- CRÍTICO: Si el usuario dice "ambas familias", "las dos familias", "ambos", "los mismos", "esas categorías", "igual pero...", "sí, compara", "de las dos", "de esas dos", etc. — revisa el historial y extrae TODOS los elementos mencionados anteriormente. NO asumas solo uno.
  Ejemplo: si el historial menciona "Iluminación" y "Material Eléctrico" (en mensajes del usuario O en títulos de consultas anteriores del asistente), incluye AMBOS en el WHERE del SQL nuevo con ItmsgrpName IN ('Iluminación', 'Material Eléctrico').
  NUNCA generes una consulta que filtre por solo una de las familias cuando el usuario dijo "ambas" o se refirió implícitamente a más de una.`;
  }

  async analyzeResults(userQuery, data, chartConfig) {
    if (!this.client) {
      return null;
    }

    try {
      // Prepare a summary of the data for analysis
      const dataPreview = data.slice(0, 50); // First 50 rows
      const totalRows = data.length;

      // Collect all relevant metric keys based on chart type
      const metricKeys = [];
      if (chartConfig?.barKey) metricKeys.push(chartConfig.barKey);
      if (chartConfig?.lineKey) metricKeys.push(chartConfig.lineKey);
      if (chartConfig?.yKeys) metricKeys.push(...chartConfig.yKeys);
      if (chartConfig?.valueKey) metricKeys.push(chartConfig.valueKey);
      if (chartConfig?.yKey && !metricKeys.includes(chartConfig.yKey)) metricKeys.push(chartConfig.yKey);
      // Fallback: auto-detect numeric columns from first row
      if (metricKeys.length === 0 && dataPreview.length > 0) {
        Object.keys(dataPreview[0]).forEach(k => {
          if (typeof dataPreview[0][k] === 'number') metricKeys.push(k);
        });
      }

      // Calculate stats for each metric key
      const calcStats = (key) => {
        const values = dataPreview.map(d => parseFloat(d[key])).filter(v => !isNaN(v));
        if (values.length === 0) return null;
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const stdDev = Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length);
        return { mean, median, stdDev, min: Math.min(...values), max: Math.max(...values) };
      };

      const statsMap = {};
      for (const key of metricKeys) {
        const s = calcStats(key);
        if (s) statsMap[key] = s;
      }

      // Special analysis for churn alerts
      if (chartConfig?.riskKey != null) {
        const totalRisk = data.reduce((s, r) => s + (r.promedio_mensual || 0), 0);
        const highRisk = data.filter(r => (r.factor_riesgo || 0) >= 2.0);
        const fmtUSD = (n) => `$${Math.round(n).toLocaleString()}`;

        const churnPrompt = `Eres un gerente de ventas. Analiza estos clientes en riesgo de abandono.

Total revenue en riesgo: ${fmtUSD(totalRisk)}/mes
Clientes alto riesgo (2x+ su frecuencia): ${highRisk.length}
Datos (ordenados por promedio mensual desc):
${JSON.stringify(dataPreview.slice(0, 15))}

Genera un análisis de riesgo en español con:
1. Resumen: cuánto revenue está en riesgo y cuántos clientes.
2. Top 3 clientes más críticos: nombre, revenue mensual, días sin comprar, y una acción concreta (llamar, visitar, enviar oferta).
3. Una observación sobre el patrón general (¿hay un problema de mercado o son casos aislados?).

Tono: directo y orientado a la acción. Máximo 180 palabras. Usa $ (dólares), nunca €.`;

        const churnResponse = await this.client.messages.create({
          model: this.model,
          max_tokens: 500,
          messages: [{ role: 'user', content: churnPrompt }]
        });
        return churnResponse.content[0].text.trim();
      }

      // Special analysis for client profile (ficha técnica)
      if (chartConfig?.nameKey != null && data.length > 0) {
        const row = data[0];
        const fmtUSD = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : 'N/D';
        const fmtPct = (n) => n != null ? `${n}%` : 'N/D';

        const profilePrompt = `Eres un analista de cartera de clientes. Analiza este perfil de cliente y genera un resumen ejecutivo breve.

DATOS DEL CLIENTE:
${JSON.stringify(row, null, 2)}

Genera un análisis conciso en español con EXACTAMENTE estas secciones:

👤 **PERFIL GENERAL**
- Nombre, tipo de cliente, ciudad, vendedor asignado

💰 **DESEMPEÑO FINANCIERO**
- Ventas totales lifetime vs últimos 6 meses. ¿Está creciendo, estable o decayendo?
- Ticket promedio: ¿aumentó o bajó en los últimos 6 meses vs histórico?

⏱️ **COMPORTAMIENTO DE COMPRA**
- Frecuencia habitual vs días sin comprar. ¿Está dentro de su ciclo normal o en riesgo?
- Estado: activo / en seguimiento / en riesgo (basado en DiasSinCompra vs FrecuenciaPromDias)

💡 **RECOMENDACIÓN**
- Una acción concreta para este cliente (llamar, visitar, enviar oferta, renovar crédito, etc.)

REGLAS:
- Máximo 150 palabras total
- Usa viñetas (•)
- Usa $ (dólares), NUNCA €
- Si DiasSinCompra > FrecuenciaPromDias * 1.5: marcar como "en riesgo"
- Si Balance > CreditLine * 0.8: mencionar que el crédito está casi al tope
- Si VentaReciente6M < VentaTotal / (NumFacturas / 6 * 0.7): mencionar caída de compras recientes

Responde SOLO con el texto del análisis.`;

        const profileResponse = await this.client.messages.create({
          model: this.model,
          max_tokens: 450,
          messages: [{ role: 'user', content: profilePrompt }]
        });
        return profileResponse.content[0].text.trim();
      }

      // Special analysis for visit plan results
      if (chartConfig?.daysKey != null || chartConfig?.clientKey === 'cliente') {
        const planPrompt = `Eres un coach de ventas. El vendedor quiere optimizar su agenda de visitas.

Clientes disponibles (ordenados por promedio mensual y días sin compra):
${JSON.stringify(dataPreview.slice(0, 15))}

Genera una agenda de visitas balanceada en español con:
1. Clasificación: identifica 2-3 clientes A (alto valor), 2-3 clientes B (valor medio), y 1-2 clientes de recuperación (llevan más de 60 días sin comprar).
2. Para cada cliente mencionado: nombre, ciudad, días sin compra, promedio mensual, y razón breve.
3. Sugerencia de agrupación por ciudad para optimizar el recorrido.

Tono: práctico y motivador. Máximo 200 palabras. Usa siempre $ (dólares), nunca €.`;

        const planResponse = await this.client.messages.create({
          model: this.model,
          max_tokens: 600,
          messages: [{ role: 'user', content: planPrompt }]
        });
        return planResponse.content[0].text.trim();
      }

      const analysisPrompt = `Eres un analista de ventas experto con enfoque en detección de anomalías. Analiza los siguientes resultados y proporciona insights valiosos.

PREGUNTA ORIGINAL DEL USUARIO: "${userQuery}"

DATOS OBTENIDOS (${totalRows} filas${totalRows > 50 ? ', mostrando las primeras 50' : ''}):
${JSON.stringify(dataPreview, null, 2)}

${Object.keys(statsMap).length > 0 ? `ESTADÍSTICAS CALCULADAS:
${Object.entries(statsMap).map(([key, s]) => `
[${key}]
- Promedio: ${s.mean.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
- Mediana: ${s.median.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
- Desviación estándar: ${s.stdDev.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
- Mínimo: ${s.min.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
- Máximo: ${s.max.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`).join('\n')}
- Valores > 2 desviaciones del promedio son potenciales anomalías` : ''}

CONFIGURACIÓN DEL GRÁFICO:
- Tipo: ${chartConfig?.title || 'N/A'}
- Eje X: ${chartConfig?.xKey || 'N/A'}
- Métricas: ${Object.keys(statsMap).join(', ') || chartConfig?.yKey || 'N/A'}

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
- IMPORTANTE: Todos los valores monetarios DEBEN estar en DÓLARES ($), NUNCA en euros (€)
  * Reemplaza cualquier € con $ en tus números
  * Ejemplo: $1,500 (correcto), NO €1,500 (incorrecto)
- FERIADOS ECUADOR: Si detectas días/semanas/meses con ventas inusualmente bajas, verifica si coinciden con feriados (ya los conoces del system prompt) y menciónalo explícitamente

Responde SOLO con el texto del análisis.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: analysisPrompt }]
      });

      return response.content[0].text.trim();

    } catch (error) {
      console.error('Analysis Error:', error);
      return null;
    }
  }

  async generateFollowUps(userQuery, data, chartConfig) {
    if (!this.client || !data || data.length === 0) return [];
    try {
      const sample = data.slice(0, 10);
      const prompt = `El usuario preguntó: "${userQuery}"
Los datos muestran: ${JSON.stringify(sample)}
Título del gráfico: ${chartConfig?.title || ''}

Genera exactamente 3 preguntas de seguimiento cortas y concretas en español que el usuario podría querer hacer a continuación, basadas en estos datos específicos.
Responde SOLO con un array JSON de strings, sin explicaciones. Máximo 8 palabras por pregunta.
Ejemplo: ["Top 5 clientes de esta categoría", "Comparar con el mes anterior", "¿Qué vendedor lidera?"]`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0].text.trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      return JSON.parse(match[0]).slice(0, 3);
    } catch (e) {
      return [];
    }
  }

  async processQuery(userQuery, metadata, conversationHistory = [], dateFilter = null, userFilter = null, resolvedEntities = []) {
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
        model: this.model,
        max_tokens: 3000,
        messages: messages,
        system: this.getSystemPrompt(metadata, dateFilter, userFilter, resolvedEntities)
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

  async fixSQL(originalQuery, failedSQL, errorMessage) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `El siguiente SQL generó un error en DuckDB. Corrige el SQL y devuelve ÚNICAMENTE el SQL corregido, sin explicación, sin markdown, sin comillas adicionales.

CONSULTA DEL USUARIO: ${originalQuery}

SQL CON ERROR:
${failedSQL}

ERROR DE DUCKDB:
${errorMessage}

SQL CORREGIDO:`
        }]
      });
      const fixed = response.content[0].text.trim()
        .replace(/^```sql\s*/i, '').replace(/```\s*$/, '').trim();
      if (/^\s*(SELECT|WITH)\s/i.test(fixed)) {
        return fixed;
      }
      return null;
    } catch (e) {
      console.error('fixSQL error:', e.message);
      return null;
    }
  }
}

export const llmService = new LLMService();
export default llmService;
