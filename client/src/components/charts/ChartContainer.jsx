import React from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  AreaChart, Area,
  ScatterChart, Scatter, ZAxis,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LabelList, ReferenceLine, Rectangle
} from 'recharts';
import DataTable from './DataTable';
import { useAuth } from '../../context/AuthContext';

const COLORS = [
  '#dc2626', '#ef4444', '#f87171', '#b91c1c', '#991b1b',
  '#fca5a5', '#7f1d1d', '#450a0a', '#fee2e2', '#fecaca'
];

function ChartContainer({ data, chartType, chartConfig, onDrillDown }) {
  const { user } = useAuth();

  if (!data || data.length === 0) {
    return (
      <div className="chart-container empty">
        <div className="empty-state">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3v18h18" stroke="#c1c1c1" strokeWidth="2" strokeLinecap="round"/>
            <path d="M7 14l4-4 4 4 6-6" stroke="#c1c1c1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h3>Sin datos para mostrar</h3>
          <p>Realiza una consulta en el chat para ver los gráficos</p>
        </div>
        <style>{emptyStyles}</style>
      </div>
    );
  }

  const formatValue = (value) => {
    if (typeof value === 'number') {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
      return value.toFixed(2);
    }
    return value;
  };

  const formatXAxis = (value) => {
    if (!value) return '';
    // Handle dates - parse as UTC to avoid timezone issues
    if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}/))) {
      // Parse the date string manually to avoid timezone shifts
      const dateStr = typeof value === 'string' ? value : value.toISOString();
      const match = dateStr.match(/^(\d{4})-(\d{2})/);
      if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; // 0-indexed
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${monthNames[month]} ${String(year).slice(-2)}`;
      }
      // Fallback
      const date = new Date(value);
      return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    }
    // Truncate long strings
    if (typeof value === 'string' && value.length > 15) {
      return value.substring(0, 12) + '...';
    }
    return value;
  };

  const xKey = chartConfig?.xKey || Object.keys(data[0])[0];
  const yKey = chartConfig?.yKey || Object.keys(data[0])[1];
  const yKeys = chartConfig?.yKeys || null; // For grouped bar charts (comparisons)
  const title = chartConfig?.title || 'Resultados';

  // Colors for grouped bar charts
  const COMPARISON_COLORS = ['#3b82f6', '#dc2626', '#22c55e', '#f59e0b'];

  // Determine effective chart type - override LLM decision based on title/data
  const getEffectiveChartType = () => {
    const titleLower = title.toLowerCase();

    // FORCE HEATMAP if title contains these keywords
    const heatmapKeywords = ['heatmap', 'mapa de calor', 'heat map'];
    if (heatmapKeywords.some(kw => titleLower.includes(kw))) {
      console.log('Forcing heatmap based on title keyword');
      return 'heatmap';
    }

    // FORCE COMBO if title mentions both metrics
    const comboKeywords = ['y margen', 'con margen', 'y promedio', 'ventas y margen', 'sales and margin'];
    if (comboKeywords.some(kw => titleLower.includes(kw))) {
      console.log('Forcing combo based on title keyword');
      return 'combo';
    }

    // Check for "por X y Y" pattern suggesting matrix/heatmap
    if (/por\s+\w+\s+y\s+(categoria|categoría|vendedor|mes|producto|marca)/i.test(title)) {
      // Check if data has the right structure for heatmap
      if (data[0]) {
        const cols = Object.keys(data[0]);
        // Count non-numeric columns (potential dimensions)
        const dimensionCols = cols.filter(k => {
          const val = data[0][k];
          return typeof val === 'string' || (typeof val === 'number' && !k.toLowerCase().match(/venta|total|margen|cantidad|promedio|sum|avg|count/));
        });
        if (dimensionCols.length >= 2) {
          console.log('Forcing heatmap based on "por X y Y" pattern');
          return 'heatmap';
        }
      }
    }

    // Check if data has two numeric columns (one for bars, one for line)
    // Only force combo for time-series data (1 dimension + multiple metrics)
    // Do NOT force combo if there are multiple text columns (that needs a table)
    if (data[0] && chartType !== 'table') {
      const cols = Object.keys(data[0]);
      const stringCols = cols.filter(k => typeof data[0][k] === 'string');
      const numericCols = cols.filter(k => typeof data[0][k] === 'number');

      // Only force combo if there's just 1 text column (the dimension) and 2+ numeric
      // If there are 2+ text columns, it's likely detailed data that needs a table
      if (stringCols.length <= 1 && numericCols.length >= 2) {
        const hasMargenColumn = numericCols.some(k =>
          k.toLowerCase().includes('margen') ||
          k.toLowerCase().includes('margin') ||
          k.toLowerCase().includes('promedio') ||
          k.toLowerCase().includes('_pct')
        );
        if (hasMargenColumn) {
          console.log('Forcing combo: found margin column with single dimension', numericCols);
          return 'combo';
        }
      }
    }

    // Detect heatmap from data structure: 2 categorical columns + 1 numeric
    // Only trigger when LLM returned 'table' but data looks like matrix
    if (chartType === 'table' && data && data.length >= 2) {
      const cols = Object.keys(data[0]);
      const stringCols = cols.filter(k => typeof data[0][k] === 'string');
      const numericCols = cols.filter(k => typeof data[0][k] === 'number');

      // If we have 2+ string columns and 1+ numeric, it could be a heatmap
      if (stringCols.length >= 2 && numericCols.length >= 1) {
        // Check if it looks like matrix data (multiple unique values in both dimensions)
        const dim1Values = new Set(data.map(d => d[stringCols[0]]));
        const dim2Values = new Set(data.map(d => d[stringCols[1]]));

        // Heatmap makes sense if both dimensions have multiple values and total cells <= 200
        if (dim1Values.size >= 2 && dim2Values.size >= 2 && dim1Values.size * dim2Values.size <= 200) {
          console.log('Forcing heatmap: detected matrix structure', { stringCols, dim1: dim1Values.size, dim2: dim2Values.size });
          return 'heatmap';
        }
      }
    }

    return chartType;
  };

  const effectiveChartType = getEffectiveChartType();
  console.log('Chart type:', chartType, '-> effective:', effectiveChartType, 'title:', title);

  const renderChart = () => {
    switch (effectiveChartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatXAxis}
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              <Tooltip formatter={formatValue} labelFormatter={formatXAxis} />
              <Legend />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'grouped-bar':
      case 'comparison':
        // Grouped bar chart for comparisons (e.g., 2024 vs 2025)
        const comparisonKeys = yKeys || Object.keys(data[0]).filter(k => k !== xKey && !k.toLowerCase().includes('crecimiento') && !k.toLowerCase().includes('growth') && !k.toLowerCase().includes('_pct'));

        // Find the growth/percentage column
        const growthKey = Object.keys(data[0]).find(k =>
          k.toLowerCase().includes('crecimiento') ||
          k.toLowerCase().includes('growth') ||
          k.toLowerCase().includes('_pct')
        );

        // Custom label to show growth percentage
        const renderGrowthLabel = (props) => {
          const { x, y, width, index } = props;
          const growth = data[index]?.[growthKey];
          if (growth === null || growth === undefined || !isFinite(growth)) return null;

          const isPositive = growth >= 0;
          const color = isPositive ? '#16a34a' : '#dc2626';
          const arrow = isPositive ? '↑' : '↓';

          return (
            <text
              x={x + width / 2}
              y={y - 8}
              fill={color}
              textAnchor="middle"
              fontSize={10}
              fontWeight="600"
            >
              {arrow}{Math.abs(growth).toFixed(1)}%
            </text>
          );
        };

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 35, right: 30, left: 20, bottom: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatXAxis}
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name, props) => {
                  const growth = props.payload?.[growthKey];
                  const formattedValue = formatValue(value);
                  if (growthKey && growth !== undefined && name === comparisonKeys[comparisonKeys.length - 1]) {
                    const sign = growth >= 0 ? '+' : '';
                    return [`${formattedValue} (${sign}${growth.toFixed(1)}%)`, name.replace(/_/g, ' ')];
                  }
                  return [formattedValue, name.replace(/_/g, ' ')];
                }}
                labelFormatter={(label) => label}
              />
              <Legend formatter={(value) => value.replace(/_/g, ' ')} />
              {comparisonKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  onClick={(d) => onDrillDown && onDrillDown(xKey, d[xKey])}
                  style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
                >
                  {/* Show growth label only on the last bar (most recent year) */}
                  {index === comparisonKeys.length - 1 && growthKey && (
                    <LabelList content={renderGrowthLabel} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'bar':
        // Check if data has multiple numeric columns (potential comparison)
        const numericKeys = Object.keys(data[0]).filter(k =>
          k !== xKey && typeof data[0][k] === 'number'
        );

        // If we have multiple numeric columns that look like years or comparisons, use grouped bar
        if (numericKeys.length > 1 && (
          numericKeys.some(k => k.match(/2024|2025|anterior|actual/i)) ||
          chartConfig?.comparison
        )) {
          const keysToShow = numericKeys.filter(k => !k.toLowerCase().includes('crecimiento') && !k.toLowerCase().includes('growth') && !k.toLowerCase().includes('_pct'));

          // Find the growth/percentage column
          const growthKeyBar = Object.keys(data[0]).find(k =>
            k.toLowerCase().includes('crecimiento') ||
            k.toLowerCase().includes('growth') ||
            k.toLowerCase().includes('_pct')
          );

          // Custom label to show growth percentage
          const renderGrowthLabelBar = (props) => {
            const { x, y, width, index } = props;
            const growth = data[index]?.[growthKeyBar];
            if (growth === null || growth === undefined || !isFinite(growth)) return null;

            const isPositive = growth >= 0;
            const color = isPositive ? '#16a34a' : '#dc2626';
            const arrow = isPositive ? '↑' : '↓';

            return (
              <text
                x={x + width / 2}
                y={y - 8}
                fill={color}
                textAnchor="middle"
                fontSize={10}
                fontWeight="600"
              >
                {arrow}{Math.abs(growth).toFixed(1)}%
              </text>
            );
          };

          return (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data} margin={{ top: 35, right: 30, left: 20, bottom: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey={xKey}
                  tickFormatter={formatXAxis}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name, props) => {
                    const growth = props.payload?.[growthKeyBar];
                    const formattedValue = formatValue(value);
                    if (growthKeyBar && growth !== undefined && name === keysToShow[keysToShow.length - 1]) {
                      const sign = growth >= 0 ? '+' : '';
                      return [`${formattedValue} (${sign}${growth.toFixed(1)}%)`, name.replace(/_/g, ' ')];
                    }
                    return [formattedValue, name.replace(/_/g, ' ')];
                  }}
                />
                <Legend formatter={(value) => value.replace(/_/g, ' ')} />
                {keysToShow.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    onClick={(d) => onDrillDown && onDrillDown(xKey, d[xKey])}
                    style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
                  >
                    {/* Show growth label only on the last bar (most recent year) */}
                    {index === keysToShow.length - 1 && growthKeyBar && (
                      <LabelList content={renderGrowthLabelBar} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        }

        // Single bar chart (original behavior)
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatXAxis}
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              <Tooltip formatter={formatValue} />
              <Legend />
              <Bar
                dataKey={yKey}
                fill="#dc2626"
                radius={[4, 4, 0, 0]}
                onClick={(data) => onDrillDown && onDrillDown(xKey, data[xKey])}
                style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={data}
                dataKey={yKey}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={150}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                labelLine={{ stroke: '#666', strokeWidth: 1 }}
                onClick={(data) => onDrillDown && onDrillDown(xKey, data.name)}
                style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={formatValue} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatXAxis}
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              <Tooltip formatter={formatValue} labelFormatter={formatXAxis} />
              <Legend />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke="#dc2626"
                fill="#dc2626"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        // For scatter plots, we need xKey, yKey, and optionally a zKey for bubble size
        const zKey = chartConfig?.zKey || null;
        // Find a label key (usually NombreVendedor or similar text field)
        const labelKey = chartConfig?.labelKey || Object.keys(data[0]).find(k =>
          typeof data[0][k] === 'string' && k !== xKey && k !== yKey
        );

        // Custom tooltip for scatter
        const ScatterTooltip = ({ active, payload }) => {
          if (active && payload && payload.length) {
            const point = payload[0].payload;
            return (
              <div style={{
                background: 'white',
                padding: '10px 14px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}>
                {labelKey && <div style={{ fontWeight: 600, marginBottom: 6 }}>{point[labelKey]}</div>}
                <div style={{ fontSize: 13, color: '#666' }}>
                  {xKey.replace(/_/g, ' ')}: <strong>{formatValue(point[xKey])}</strong>
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {yKey.replace(/_/g, ' ')}: <strong>{formatValue(point[yKey])}</strong>
                </div>
                {zKey && (
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {zKey.replace(/_/g, ' ')}: <strong>{formatValue(point[zKey])}</strong>
                  </div>
                )}
              </div>
            );
          }
          return null;
        };

        return (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                name={xKey.replace(/_/g, ' ')}
                type="number"
                tickFormatter={formatValue}
                tick={{ fontSize: 11 }}
                label={{ value: xKey.replace(/_/g, ' '), position: 'bottom', offset: 40, fontSize: 12 }}
              />
              <YAxis
                dataKey={yKey}
                name={yKey.replace(/_/g, ' ')}
                type="number"
                tickFormatter={formatValue}
                tick={{ fontSize: 11 }}
                label={{ value: yKey.replace(/_/g, ' '), angle: -90, position: 'insideLeft', offset: 10, fontSize: 12 }}
              />
              {zKey && <ZAxis dataKey={zKey} range={[50, 400]} name={zKey} />}
              <Tooltip content={<ScatterTooltip />} />
              <Legend />
              <Scatter
                name={title}
                data={data}
                fill="#dc2626"
                shape="circle"
              />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'combo':
      case 'dual-axis':
        // Combo chart: bars for primary metric, line for secondary metric (e.g., sales + margin)
        // Get all numeric columns except xKey
        const numericColumns = Object.keys(data[0]).filter(k =>
          k !== xKey && typeof data[0][k] === 'number'
        );

        // Determine barKey and lineKey
        // Priority: 1) explicit config, 2) auto-detect from data
        let barKey, lineKey;

        if (chartConfig?.barKey) {
          barKey = chartConfig.barKey;
        } else if (chartConfig?.yKey) {
          barKey = chartConfig.yKey;
        } else {
          // Default: first numeric column that looks like sales/quantity
          barKey = numericColumns.find(k =>
            k.toLowerCase().includes('venta') ||
            k.toLowerCase().includes('total') ||
            k.toLowerCase().includes('cantidad')
          ) || numericColumns[0];
        }

        if (chartConfig?.lineKey) {
          lineKey = chartConfig.lineKey;
        } else {
          // Find a second numeric column for the line (preferably margin/percentage)
          lineKey = numericColumns.find(k =>
            k !== barKey && (
              k.toLowerCase().includes('margen') ||
              k.toLowerCase().includes('margin') ||
              k.toLowerCase().includes('promedio') ||
              k.toLowerCase().includes('_pct') ||
              k.toLowerCase().includes('porcentaje')
            )
          ) || numericColumns.find(k => k !== barKey);
        }

        // Debug: log what we detected
        console.log('Combo chart config:', { barKey, lineKey, numericColumns, chartConfig });

        // Format for percentage values (margin, growth, etc.)
        const formatPercentage = (value) => {
          if (typeof value === 'number') {
            return `${value.toFixed(1)}%`;
          }
          return value;
        };

        // Detect if lineKey is a percentage field
        const isPercentageField = lineKey && (
          lineKey.toLowerCase().includes('margen') ||
          lineKey.toLowerCase().includes('margin') ||
          lineKey.toLowerCase().includes('porcentaje') ||
          lineKey.toLowerCase().includes('percent') ||
          lineKey.toLowerCase().includes('_pct')
        );

        // If no second metric found, show a notice
        const hasSecondMetric = lineKey && lineKey !== barKey && data[0][lineKey] !== undefined;

        return (
          <div>
            {!hasSecondMetric && (
              <div style={{
                padding: '8px 16px',
                background: '#fef3c7',
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '13px',
                color: '#92400e'
              }}>
                Solo se encontró una métrica numérica. Para ver barras + línea, la consulta debe incluir dos métricas (ej: ventas y margen).
              </div>
            )}
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={data} margin={{ top: 20, right: hasSecondMetric ? 60 : 30, left: 20, bottom: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey={xKey}
                  tickFormatter={formatXAxis}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={formatValue}
                  tick={{ fontSize: 12 }}
                  label={{ value: barKey?.replace(/_/g, ' ') || '', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                {hasSecondMetric && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={isPercentageField ? formatPercentage : formatValue}
                    tick={{ fontSize: 12 }}
                    label={{ value: lineKey?.replace(/_/g, ' ') || '', angle: 90, position: 'insideRight', fontSize: 11 }}
                    domain={isPercentageField ? [0, 'auto'] : ['auto', 'auto']}
                  />
                )}
                <Tooltip
                  formatter={(value, name) => {
                    const isPercent = name.toLowerCase().includes('margen') ||
                                     name.toLowerCase().includes('margin') ||
                                     name.toLowerCase().includes('_pct');
                    return [isPercent ? formatPercentage(value) : formatValue(value), name.replace(/_/g, ' ')];
                  }}
                />
                <Legend formatter={(value) => value.replace(/_/g, ' ')} />
                {barKey && (
                  <Bar
                    yAxisId="left"
                    dataKey={barKey}
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    onClick={(d) => onDrillDown && onDrillDown(xKey, d[xKey])}
                    style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
                  />
                )}
                {hasSecondMetric && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey={lineKey}
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#dc2626' }}
                    activeDot={{ r: 6 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );

      case 'heatmap':
        // Heatmap for showing intensity across two categorical dimensions
        // Auto-detect keys from data structure if not provided in chartConfig
        const heatmapCols = Object.keys(data[0]);
        const heatmapStringCols = heatmapCols.filter(k => typeof data[0][k] === 'string');
        const heatmapNumericCols = heatmapCols.filter(k => typeof data[0][k] === 'number');

        // Determine xKey, yKey, valueKey - prefer chartConfig, fallback to auto-detect
        const heatmapXKey = chartConfig?.xKey || heatmapStringCols[0] || xKey;
        const heatmapYKey = chartConfig?.yKey || heatmapStringCols[1] || yKey;
        const valueKey = chartConfig?.valueKey || heatmapNumericCols[0] ||
          heatmapCols.find(k => k !== heatmapXKey && k !== heatmapYKey && typeof data[0][k] === 'number');

        console.log('Heatmap keys:', { heatmapXKey, heatmapYKey, valueKey });

        // Get unique values for x and y axes
        let xValues = [...new Set(data.map(d => d[heatmapXKey]))];
        const yValues = [...new Set(data.map(d => d[heatmapYKey]))];

        // Sort xValues - if they look like dates, sort chronologically
        const looksLikeDates = xValues.some(v => String(v).match(/^\d{4}-\d{2}/));
        if (looksLikeDates) {
          xValues.sort((a, b) => new Date(a) - new Date(b));
        } else {
          xValues.sort();
        }

        // Format month names for display
        const formatXLabel = (val) => {
          const strVal = String(val);
          // Match YYYY-MM format and parse manually to avoid timezone issues
          const match = strVal.match(/^(\d{4})-(\d{2})/);
          if (match) {
            const year = match[1];
            const monthIndex = parseInt(match[2], 10) - 1; // Convert to 0-based index
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return `${months[monthIndex]} ${year.slice(-2)}`;
          }
          return strVal.length > 10 ? strVal.substring(0, 8) + '...' : val;
        };

        // Format value for display (handle percentages)
        // Detect if values are percentages based on column name or value range
        const isPercentageColumn = valueKey?.toLowerCase().includes('porcentaje') ||
                                   valueKey?.toLowerCase().includes('percent') ||
                                   valueKey?.toLowerCase().includes('margen');

        const formatHeatmapValue = (val, maxVal) => {
          if (typeof val === 'number') {
            // If column name suggests percentages or max value is <= 100, treat as percentage
            if (isPercentageColumn || maxVal <= 100) {
              return `${val.toFixed(0)}%`;
            }
            return formatValue(val);
          }
          return val;
        };

        // Create a lookup map for values
        const valueMap = {};
        let minValue = Infinity;
        let maxValue = -Infinity;
        data.forEach(d => {
          const key = `${d[heatmapXKey]}-${d[heatmapYKey]}`;
          const val = d[valueKey] || 0;
          valueMap[key] = val;
          minValue = Math.min(minValue, val);
          maxValue = Math.max(maxValue, val);
        });

        // Color scale function (blue to red through white)
        const getHeatmapColor = (value) => {
          if (maxValue === minValue) return { color: '#f0f0f0', r: 240, g: 240, b: 240 };
          const ratio = (value - minValue) / (maxValue - minValue);
          let r, g, b;
          // Blue (low) -> White (mid) -> Red (high)
          if (ratio < 0.5) {
            r = Math.round(59 + (255 - 59) * (ratio * 2));
            g = Math.round(130 + (255 - 130) * (ratio * 2));
            b = Math.round(246 + (255 - 246) * (ratio * 2));
          } else {
            r = Math.round(255 - (255 - 220) * ((ratio - 0.5) * 2));
            g = Math.round(255 - (255 - 38) * ((ratio - 0.5) * 2));
            b = Math.round(255 - (255 - 38) * ((ratio - 0.5) * 2));
          }
          return { color: `rgb(${r},${g},${b})`, r, g, b };
        };

        // Calculate perceived brightness (0-255) to determine text color
        const getTextColor = (r, g, b) => {
          // Using perceived luminance formula
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          return brightness > 160 ? '#333' : '#fff';
        };

        const cellWidth = Math.max(50, Math.min(80, 700 / xValues.length));
        const cellHeight = 35;
        const marginLeft = 120;
        const marginTop = 40;

        return (
          <div style={{ overflowX: 'auto' }}>
            <svg
              width={Math.max(600, marginLeft + xValues.length * cellWidth + 100)}
              height={marginTop + yValues.length * cellHeight + 60}
            >
              {/* X axis labels */}
              {xValues.map((xVal, xi) => (
                <text
                  key={`x-${xi}`}
                  x={marginLeft + xi * cellWidth + cellWidth / 2}
                  y={marginTop - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#666"
                >
                  {formatXLabel(xVal)}
                </text>
              ))}

              {/* Y axis labels and cells */}
              {yValues.map((yVal, yi) => (
                <g key={`row-${yi}`}>
                  <text
                    x={marginLeft - 10}
                    y={marginTop + yi * cellHeight + cellHeight / 2 + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="#666"
                  >
                    {String(yVal).length > 15 ? String(yVal).substring(0, 12) + '...' : yVal}
                  </text>
                  {xValues.map((xVal, xi) => {
                    const key = `${xVal}-${yVal}`;
                    const value = valueMap[key] || 0;
                    const cellColor = getHeatmapColor(value);
                    const textColor = getTextColor(cellColor.r, cellColor.g, cellColor.b);
                    return (
                      <g key={`cell-${xi}-${yi}`}>
                        <rect
                          x={marginLeft + xi * cellWidth}
                          y={marginTop + yi * cellHeight}
                          width={cellWidth - 2}
                          height={cellHeight - 2}
                          fill={cellColor.color}
                          rx={4}
                          stroke="#fff"
                          strokeWidth={1}
                          style={{ cursor: 'pointer' }}
                          onClick={() => onDrillDown && onDrillDown(heatmapXKey, xVal)}
                        >
                          <title>{`${yVal} - ${xVal}: ${formatValue(value)}`}</title>
                        </rect>
                        <text
                          x={marginLeft + xi * cellWidth + cellWidth / 2 - 1}
                          y={marginTop + yi * cellHeight + cellHeight / 2 + 4}
                          textAnchor="middle"
                          fontSize={10}
                          fill={textColor}
                          fontWeight="600"
                        >
                          {formatHeatmapValue(value, maxValue)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ))}

              {/* Legend - vertical gradient from top (high/red) to bottom (low/blue) */}
              <defs>
                <linearGradient id="heatmapGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#dc2626" />
                  <stop offset="50%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <rect
                x={marginLeft + xValues.length * cellWidth + 20}
                y={marginTop}
                width={20}
                height={Math.min(yValues.length * cellHeight, 150)}
                fill="url(#heatmapGradient)"
                rx={4}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={marginLeft + xValues.length * cellWidth + 45}
                y={marginTop + 12}
                fontSize={10}
                fill="#666"
              >
                {formatHeatmapValue(maxValue, maxValue)}
              </text>
              <text
                x={marginLeft + xValues.length * cellWidth + 45}
                y={marginTop + Math.min(yValues.length * cellHeight, 150) - 2}
                fontSize={10}
                fill="#666"
              >
                {formatHeatmapValue(minValue, maxValue)}
              </text>
            </svg>
          </div>
        );

      case 'table':
      default:
        return <DataTable data={data} />;
    }
  };

  const handleExport = (format) => {
    if (format === 'csv') {
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).join(',')).join('\n');
      const csv = `${headers}\n${rows}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h2>{title}</h2>
        <div className="chart-actions">
          {user?.role !== 'vendedor' && (
            <button onClick={() => handleExport('csv')} className="export-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      <div className="chart-body">
        {renderChart()}
      </div>

      <div className="chart-footer">
        <span>{data.length} {data.length === 1 ? 'registro' : 'registros'}</span>
        {onDrillDown && (chartType === 'bar' || chartType === 'pie') && (
          <span className="drill-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Click en el gráfico para explorar detalles
          </span>
        )}
      </div>

      <style>{containerStyles}</style>
    </div>
  );
}

const emptyStyles = `
  .chart-container.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    background: white;
    border-radius: 12px;
    box-shadow: var(--shadow);
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state h3 {
    margin: 16px 0 8px;
    color: var(--text-primary);
  }

  .empty-state p {
    font-size: 14px;
  }
`;

const containerStyles = `
  .chart-container {
    background: white;
    border-radius: 12px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
  }

  .chart-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .chart-actions {
    display: flex;
    gap: 8px;
  }

  .export-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: white;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .export-btn:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .chart-body {
    padding: 20px;
    min-height: 400px;
  }

  .chart-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-color);
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .drill-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--primary-color);
    font-weight: 500;
  }

  .drill-hint svg {
    opacity: 0.7;
  }
`;

export default ChartContainer;
