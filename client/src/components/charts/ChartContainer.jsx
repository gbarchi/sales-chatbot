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
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import DataTable from './DataTable';
import { useAuth } from '../../context/AuthContext';

const COLORS = [
  '#dc2626', '#ef4444', '#f87171', '#b91c1c', '#991b1b',
  '#fca5a5', '#7f1d1d', '#450a0a', '#fee2e2', '#fecaca'
];

// ── FitBounds (must be at module level — hooks require stable component identity) ──
function FitBounds({ points }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length > 0) {
      const lats = points.map(p => p.lat);
      const lngs = points.map(p => p.lng);
      map.fitBounds([
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
      ], { padding: [30, 30] });
    }
  }, [points, map]);
  return null;
}

// ── MapChart ─────────────────────────────────────────────────────────────────
function MapChart({ validPoints, latKey, lngKey, labelKey, valueKey, getMarkerColor, planRoute, haversine, chartConfig }) {
  const [routeMode, setRouteMode] = React.useState(false);
  const [routeResult, setRouteResult] = React.useState(null);

  const fmtValue = (row) => {
    if (!valueKey || row[valueKey] == null) return null;
    const v = Number(row[valueKey]);
    const key = valueKey.toLowerCase();
    if (key.includes('venta') || key.includes('total') || key.includes('costo') || key.includes('promedio')) {
      return `$${Math.round(v).toLocaleString()}`;
    }
    if (key.includes('dias') || key.includes('días')) return `${Math.round(v)} días`;
    return v.toLocaleString();
  };

  const humanize = (key) => {
    const labels = {
      TotalVenta: 'Total venta', LineTotal: 'Total venta',
      DiasSinComprar: 'Días sin comprar', DiasInactivo: 'Días inactivo',
      UltimaCompra: 'Última compra', FechaUltimaCompra: 'Última compra',
      NombreVendedor: 'Vendedor', NombreSupervisor: 'Supervisor',
      TotalFacturas: 'Facturas', NumFacturas: 'Facturas',
      PromedioMensual: 'Promedio mensual', Promedio: 'Promedio',
      Cantidad: 'Cantidad', Margen: 'Margen',
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').trim();
  };

  const points = validPoints.map(r => ({
    ...r,
    lat: Number(r[latKey]),
    lng: Number(r[lngKey]),
    label: r[labelKey] || 'Cliente',
    color: getMarkerColor(r[valueKey]),
  }));

  const handlePlanRoute = () => {
    const result = planRoute(points);
    setRouteResult(result);
    setRouteMode(true);
  };

  const displayPoints = routeMode && routeResult ? routeResult.ordered : points;
  const center = [
    points.reduce((s, p) => s + p.lat, 0) / points.length,
    points.reduce((s, p) => s + p.lng, 0) / points.length,
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {points.length} cliente{points.length !== 1 ? 's' : ''}
        </span>
        {valueKey && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Alto
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginLeft: 4 }} /> Medio
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block', marginLeft: 4 }} /> Bajo
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {routeMode ? (
            <button onClick={() => { setRouteMode(false); setRouteResult(null); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer' }}>
              Cancelar ruta
            </button>
          ) : (
            <button onClick={handlePlanRoute} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #3b82f6', background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              Planificar ruta
            </button>
          )}
        </div>
      </div>

      {routeMode && routeResult && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#1d4ed8' }}>
          Ruta optimizada: <strong>{routeResult.ordered.length} visitas</strong> · ~<strong>{routeResult.totalKm} km</strong> estimados
        </div>
      )}

      {/* Map */}
      <div style={{ height: 440, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />

          {/* Route line */}
          {routeMode && routeResult && (
            <Polyline
              positions={routeResult.ordered.map(p => [p.lat, p.lng])}
              pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '6 4', opacity: 0.7 }}
            />
          )}

          {/* Markers */}
          {displayPoints.map((point, i) => (
            <CircleMarker
              key={i}
              center={[point.lat, point.lng]}
              radius={routeMode ? 10 : 8}
              pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.85, weight: 2 }}
            >
              <Popup>
                <div style={{ fontSize: 13, minWidth: 160 }}>
                  {routeMode && <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>Visita #{i + 1}</div>}
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{point.label}</div>
                  {point.Ciudad && <div style={{ color: '#64748b', fontSize: 12 }}>📍 {point.Ciudad}{point.Provincia ? `, ${point.Provincia}` : ''}</div>}
                  {valueKey && fmtValue(point) && (
                    <div style={{ marginTop: 4, color: '#475569', fontSize: 12 }}>
                      {humanize(valueKey)}: <strong>{fmtValue(point)}</strong>
                    </div>
                  )}
                  {/* Show other relevant fields (excluding already-shown keys) */}
                  {Object.entries(point).filter(([k]) =>
                    !['lat','lng','label','color',latKey,lngKey,labelKey,valueKey,'CardCode','Cardname','Lat','Lng','Ciudad','Provincia','NombreVendedor'].includes(k)
                    && typeof point[k] !== 'object'
                  ).slice(0, 3).map(([k, v]) => (
                    <div key={k} style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      {humanize(k)}: {typeof v === 'number' && (k.toLowerCase().includes('venta') || k.toLowerCase().includes('total')) ? `$${Math.round(v).toLocaleString()}` : String(v ?? '—')}
                    </div>
                  ))}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function ChartContainer({ data, chartType, chartConfig, onDrillDown }) {
  const { user } = useAuth();

  // Detect data granularity (daily, monthly, yearly) by analyzing xKey values
  const detectGranularity = (xKey) => {
    if (!data || data.length === 0 || !xKey) return 'auto';

    const values = data.map(d => d[xKey]).filter(v => v && typeof v === 'string');
    if (values.length === 0) return 'auto';

    // Check if all values are dates (YYYY-MM-DD format)
    const dateValues = values.filter(v => v.match(/^\d{4}-\d{2}-\d{2}/));
    if (dateValues.length === 0) return 'auto';

    // Extract days, months
    const days = dateValues.map(v => v.substring(8, 10)); // Extract DD
    const months = dateValues.map(v => v.substring(5, 7)); // Extract MM

    // If all days are "01", it's monthly or yearly data
    const allFirstDay = days.every(d => d === '01');
    if (allFirstDay) {
      // If all months are "01" too, it's yearly
      const allJanuary = months.every(m => m === '01');
      return allJanuary ? 'yearly' : 'monthly';
    }

    // If days vary, it's daily data
    return 'daily';
  };

  const xKey = chartConfig?.xKey || Object.keys(data[0])[0];
  const dataGranularity = detectGranularity(xKey);

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
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      const isWholeNumber = Math.abs(value - Math.round(value)) < 0.01;
      if (isWholeNumber) {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toLocaleString('es-ES', { maximumFractionDigits: 0 });
      }
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
      return value.toFixed(2);
    }
    if (typeof value === 'bigint') {
      return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 0 });
    }
    return value;
  };

  const formatXAxis = (value) => {
    if (!value) return '';
    // Handle dates - parse as UTC to avoid timezone issues
    if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}/))) {
      // Parse the date string manually to avoid timezone shifts
      const dateStr = typeof value === 'string' ? value : value.toISOString();

      // Check if it's a full date (YYYY-MM-DD)
      const fullDateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (fullDateMatch) {
        const year = parseInt(fullDateMatch[1]);
        const month = parseInt(fullDateMatch[2]) - 1; // 0-indexed
        const day = parseInt(fullDateMatch[3]);
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

        // Format based on detected granularity
        if (dataGranularity === 'daily') {
          return day.toString(); // Show just day (1-31)
        } else if (dataGranularity === 'monthly') {
          return monthNames[month]; // Show just month (ene, feb, etc.)
        } else if (dataGranularity === 'yearly') {
          return year.toString(); // Show just year (2025, 2026, etc.)
        } else {
          // Auto: default to month-year
          return `${monthNames[month]} ${String(year).slice(-2)}`;
        }
      }

      // Otherwise, show month-year (YYYY-MM)
      const monthYearMatch = dateStr.match(/^(\d{4})-(\d{2})/);
      if (monthYearMatch) {
        const year = parseInt(monthYearMatch[1]);
        const month = parseInt(monthYearMatch[2]) - 1; // 0-indexed
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

  const yKey = chartConfig?.yKey || Object.keys(data[0])[1];
  const yKeys = chartConfig?.yKeys || null; // For grouped bar charts (comparisons)
  const title = chartConfig?.title || 'Resultados';

  // Colors for grouped bar charts
  const COMPARISON_COLORS = ['#3b82f6', '#dc2626', '#22c55e', '#f59e0b'];

  // Colors for multi-series line charts (8 distinct colors)
  const MULTI_LINE_COLORS = [
    '#3b82f6', '#dc2626', '#22c55e', '#f59e0b',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  ];

  // Determine effective chart type - override LLM decision based on title/data
  const getEffectiveChartType = () => {
    // PRIORITY 0: If LLM detected explicit user request, NEVER override
    if (chartConfig?.userExplicitRequest === true) {
      console.log('Respecting user explicit request:', chartType);
      return chartType;
    }

    const titleLower = title.toLowerCase();

    // FORCE HEATMAP if title contains these keywords
    const heatmapKeywords = ['heatmap', 'mapa de calor', 'heat map'];
    if (heatmapKeywords.some(kw => titleLower.includes(kw))) {
      console.log('Forcing heatmap based on title keyword');
      return 'heatmap';
    }

    // Check for "por X y Y" pattern suggesting matrix/heatmap
    // Only convert to heatmap if LLM returned 'table' (don't override other chart types)
    if (chartType === 'table' && /por\s+\w+\s+y\s+(categoria|categoría|vendedor|mes|producto|marca)/i.test(title)) {
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
    // Only upgrade bar/line to combo when margin column detected
    // Do NOT force combo for scatter, table, pie, or other explicit chart types
    if (data[0] && (chartType === 'bar' || chartType === 'line')) {
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

        // Heatmap makes sense if BOTH dimensions have 3+ values (not for small 2x2 matrices)
        // and total cells <= 200. This prevents small client×product matrices from forcing heatmap
        if (dim1Values.size >= 3 && dim2Values.size >= 3 && dim1Values.size * dim2Values.size <= 200) {
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

      case 'comparison': {
        // Line chart for temporal comparisons (e.g., month-by-month 2024 vs 2025)
        const compLineKeys = yKeys || Object.keys(data[0]).filter(k => k !== xKey && typeof data[0][k] === 'number');
        const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const formatCompXAxis = (value) => {
          // If xKey is month number (1-12), show month name
          if (typeof value === 'number' && value >= 1 && value <= 12) {
            return MONTH_NAMES[value - 1];
          }
          return formatXAxis(value);
        };

        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatCompXAxis}
                tick={{ fontSize: 12 }}
                interval={0}
              />
              <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => [formatValue(value), name.replace(/_/g, ' ')]}
                labelFormatter={formatCompXAxis}
              />
              <Legend formatter={(value) => value.replace(/_/g, ' ')} />
              {compLineKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      }

      case 'multi-line': {
        // Multi-series line chart: one line per category value (family, supervisor, province, etc.)
        // SQL is long-format (time × category × value); frontend pivots to wide format for Recharts
        const seriesKey = chartConfig?.seriesKey;
        const valueKey  = chartConfig?.valueKey || yKey;

        if (!seriesKey || !data[0]?.[seriesKey]) {
          return (
            <div style={{ padding: 24, color: '#dc2626', textAlign: 'center' }}>
              Configuración inválida: falta <code>seriesKey</code> en chartConfig.
            </div>
          );
        }

        // Collect all unique series values, sorted for consistent color assignment
        const seriesValues = [...new Set(data.map(d => d[seriesKey]))].sort();

        // Pivot: long-format rows → one object per xKey value with one key per series
        const pivotMap = {};
        for (const row of data) {
          const x = row[xKey];
          if (!pivotMap[x]) pivotMap[x] = { [xKey]: x };
          pivotMap[x][row[seriesKey]] = row[valueKey];
        }
        const pivotedData = Object.values(pivotMap)
          .sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey])));

        const ML_MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const formatMLXAxis = (value) => {
          if (typeof value === 'number' && value >= 1 && value <= 12) return ML_MONTH_NAMES[value - 1];
          return formatXAxis(value);
        };

        return (
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={pivotedData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey={xKey}
                tickFormatter={formatMLXAxis}
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => [formatValue(value), name]}
                labelFormatter={formatMLXAxis}
              />
              <Legend />
              {seriesValues.map((seriesVal, index) => (
                <Line
                  key={seriesVal}
                  type="monotone"
                  dataKey={seriesVal}
                  stroke={MULTI_LINE_COLORS[index % MULTI_LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      }

      case 'grouped-bar':
        // Grouped bar chart for dimension comparisons (e.g., by province 2024 vs 2025)
        const comparisonKeys = yKeys || Object.keys(data[0]).filter(k => k !== xKey && typeof data[0][k] === 'number');

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
              <Tooltip
                formatter={(value, name) => [formatValue(value), name.replace(/_/g, ' ')]}
                labelFormatter={formatXAxis}
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
                />
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
          numericKeys.some(k => k.match(/2024|2025|2026|anterior|actual/i)) ||
          chartConfig?.comparison
        )) {
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
                <Tooltip
                  formatter={(value, name) => [formatValue(value), name.replace(/_/g, ' ')]}
                  labelFormatter={formatXAxis}
                />
                <Legend formatter={(value) => value.replace(/_/g, ' ')} />
                {numericKeys.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    onClick={(d) => onDrillDown && onDrillDown(xKey, d[xKey])}
                    style={{ cursor: onDrillDown ? 'pointer' : 'default' }}
                  />
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
              <Tooltip formatter={formatValue} labelFormatter={formatXAxis} />
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
        // Validate that xKey and yKey are numeric for scatter plots
        const xIsNumeric = data[0] && typeof data[0][xKey] === 'number';
        const yIsNumeric = data[0] && typeof data[0][yKey] === 'number';

        if (!xIsNumeric || !yIsNumeric) {
          return (
            <div style={{
              padding: '20px',
              background: '#fef2f2',
              borderRadius: '8px',
              color: '#991b1b',
              textAlign: 'center'
            }}>
              <strong>Error en Scatter Plot:</strong> Se requieren dos columnas numéricas.
              <br />
              <span style={{ fontSize: '12px', color: '#666' }}>
                xKey ({xKey}): {typeof data[0]?.[xKey]} |
                yKey ({yKey}): {typeof data[0]?.[yKey]}
              </span>
            </div>
          );
        }

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
                  labelFormatter={formatXAxis}
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

      case 'heatmap': {
        // Auto-detect keys from data structure
        const heatmapCols = Object.keys(data[0]);
        const heatmapStringCols = heatmapCols.filter(k => typeof data[0][k] === 'string');
        const heatmapNumericCols = heatmapCols.filter(k => typeof data[0][k] === 'number');

        const isStringCol = (key) => key && data[0] && typeof data[0][key] === 'string';
        const heatmapXKey = (isStringCol(chartConfig?.xKey) ? chartConfig.xKey : null) || heatmapStringCols[0] || xKey;
        const heatmapYKey = (isStringCol(chartConfig?.yKey) ? chartConfig.yKey : null) ||
          heatmapStringCols.find(k => k !== heatmapXKey) || heatmapStringCols[1] || yKey;
        const valueKey = chartConfig?.valueKey || heatmapNumericCols[0] ||
          heatmapCols.find(k => k !== heatmapXKey && k !== heatmapYKey && typeof data[0][k] === 'number');

        // Detect if values are percentages
        const isPercentageColumn = valueKey?.toLowerCase().includes('porcentaje') ||
                                   valueKey?.toLowerCase().includes('percent') ||
                                   valueKey?.toLowerCase().includes('margen');

        // Check if all values are whole numbers
        const allWholeNumbers = data.every(d => {
          const v = Number(d[valueKey]);
          return !isNaN(v) && Math.abs(v - Math.round(v)) < 0.01;
        });

        // Get unique column values (x-axis of heatmap)
        let xValues = [...new Set(data.map(d => d[heatmapXKey]))];
        const looksLikeDates = xValues.some(v => String(v).match(/^\d{4}-\d{2}/));
        if (looksLikeDates) {
          xValues.sort((a, b) => new Date(a) - new Date(b));
        } else {
          xValues.sort();
        }

        // Format date labels
        const formatXLabel = (val) => {
          const strVal = String(val);
          const match = strVal.match(/^(\d{4})-(\d{2})/);
          if (match) {
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return `${months[parseInt(match[2], 10) - 1]} ${match[1].slice(-2)}`;
          }
          return strVal;
        };

        // Build lookup map for values
        const SEP = '\0';
        const valueMap = {};
        data.forEach(d => {
          const key = `${d[heatmapYKey]}${SEP}${d[heatmapXKey]}`;
          valueMap[key] = Number(d[valueKey]) || 0;
        });

        // Transform data into nivo format: array of { id: rowLabel, data: [{ x: colLabel, y: value }] }
        // Sort rows by total value descending (not alphabetically)
        const yValuesUnsorted = [...new Set(data.map(d => d[heatmapYKey]))];
        const yTotals = {};
        yValuesUnsorted.forEach(yVal => {
          yTotals[yVal] = xValues.reduce((sum, xVal) => sum + (Number(valueMap[`${yVal}${SEP}${xVal}`]) || 0), 0);
        });
        const yValues = yValuesUnsorted.sort((a, b) => yTotals[b] - yTotals[a]);
        const nivoData = yValues.map(yVal => ({
          id: String(yVal),
          data: xValues.map(xVal => ({
            x: formatXLabel(xVal),
            y: Math.round(Number(valueMap[`${yVal}${SEP}${xVal}`] || 0))
          }))
        }));

        const heatmapHeight = Math.max(400, yValues.length * 40 + 120);

        return (
          <div style={{ height: heatmapHeight, overflowX: 'auto' }}>
            <ResponsiveHeatMap
              data={nivoData}
              margin={{ top: 90, right: 60, bottom: 30, left: 140 }}
              valueFormat={v => {
                const numVal = Math.round(Number(v));
                if (isPercentageColumn) return `${numVal}%`;
                return numVal.toLocaleString('es-ES');
              }}
              axisTop={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: -45,
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
              }}
              axisRight={null}
              axisBottom={null}
              colors={{
                type: 'diverging',
                scheme: 'red_yellow_blue',
                divergeAt: 0.5,
                minValue: 0,
                maxValue: Math.max(...nivoData.flatMap(d => d.data.map(c => c.y))),
              }}
              emptyColor="#f0f0f0"
              borderColor="#ffffff"
              borderWidth={2}
              borderRadius={4}
              labelTextColor={({ color }) => {
                // Calculate perceived brightness from the cell color
                const hex = color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16) || 128;
                const g = parseInt(hex.substring(2, 4), 16) || 128;
                const b = parseInt(hex.substring(4, 6), 16) || 128;
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                return brightness > 160 ? '#333333' : '#ffffff';
              }}
              tooltip={({ cell }) => (
                <div style={{
                  background: 'white',
                  padding: '8px 12px',
                  borderRadius: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  fontSize: 13,
                }}>
                  <strong>{cell.serieId}</strong> - {cell.data.x}<br />
                  {allWholeNumbers ? Math.round(cell.value).toLocaleString('es-ES') : cell.value}
                  {isPercentageColumn ? '%' : ''}
                </div>
              )}
              onClick={(cell) => onDrillDown && onDrillDown(heatmapXKey, cell.data.x)}
              hoverTarget="cell"
              animate={false}
            />
          </div>
        );
      }

      case 'plan': {
        const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

        // Relative classification using both value (promedio_mensual) and recency (dias_sin_compra)
        const activeClients = data
          .filter(r => (r.dias_sin_compra ?? 0) < 45)
          .sort((a, b) => (b.promedio_mensual ?? 0) - (a.promedio_mensual ?? 0));
        const activeCount = activeClients.length;

        const getCategory = (row) => {
          const dias = row.dias_sin_compra ?? 0;
          if (dias >= 90) return { label: 'REACTIVACIÓN', color: '#7c3aed', bg: '#ede9fe' };
          if (dias >= 45)  return { label: 'RECUPERACIÓN', color: '#ea580c', bg: '#ffedd5' };
          // For active clients (<45 days): classify by relative promedio_mensual rank
          const rank = activeClients.findIndex(r => r === row);
          const pct = activeCount > 1 ? rank / (activeCount - 1) : 0;
          if (pct <= 0.25) return { label: 'CLIENTE A', color: '#059669', bg: '#d1fae5' };
          if (pct <= 0.60) return { label: 'CLIENTE B', color: '#0284c7', bg: '#e0f2fe' };
          return { label: 'CLIENTE C', color: '#64748b', bg: '#f1f5f9' };
        };

        return (
          <div style={{ padding: '8px 0' }}>
            {data.map((row, i) => {
              const dias = row.dias_sin_compra ?? row[chartConfig?.daysKey] ?? 0;
              const avg = row.promedio_mensual ?? row[chartConfig?.avgKey] ?? 0;
              const cliente = row.cliente ?? row[chartConfig?.clientKey] ?? `Cliente ${i + 1}`;
              const ciudad = row.ciudad ?? row[chartConfig?.cityKey] ?? '';
              const priority = getCategory(row);

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'white', borderRadius: 10, marginBottom: 7, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#cbd5e1', minWidth: 26, textAlign: 'center' }}>#{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {ciudad && <>📍 {ciudad} · </>}
                      Última compra: <strong>{dias}d</strong> · Promedio mensual: <strong>{fmt(avg)}</strong>
                    </div>
                  </div>
                  <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: priority.bg, color: priority.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {priority.label}
                  </span>
                </div>
              );
            })}

            {data.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
                No se encontraron clientes activos en los últimos 4 meses.
              </div>
            )}
          </div>
        );
      }

      case 'churn': {
        const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

        const getRisk = (factor) => {
          if (factor >= 2.0) return { label: 'ALTO RIESGO', color: '#dc2626', bg: '#fee2e2' };
          return { label: 'RIESGO MEDIO', color: '#d97706', bg: '#fef3c7' };
        };

        const totalRisk = data.reduce((s, r) => s + (r.promedio_mensual || r[chartConfig?.avgKey] || 0), 0);

        return (
          <div style={{ padding: '8px 0' }}>
            {data.length > 0 && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#9f1239', fontWeight: 600 }}>
                  ⚠️ {data.length} cliente{data.length !== 1 ? 's' : ''} en riesgo
                </span>
                <span style={{ fontSize: 13, color: '#9f1239' }}>
                  {fmt(totalRisk)}/mes en riesgo
                </span>
              </div>
            )}

            {data.map((row, i) => {
              const cliente = row.cliente ?? row[chartConfig?.clientKey] ?? `Cliente ${i + 1}`;
              const ciudad = row.ciudad ?? row[chartConfig?.cityKey] ?? '';
              const dias = row.dias_sin_compra ?? row[chartConfig?.daysKey] ?? 0;
              const freq = row.frecuencia_dias ?? row[chartConfig?.freqKey] ?? 0;
              const factor = row.factor_riesgo ?? row[chartConfig?.riskKey] ?? 0;
              const avg = row.promedio_mensual ?? row[chartConfig?.avgKey] ?? 0;
              const risk = getRisk(factor);

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'white', borderRadius: 10, marginBottom: 7, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#cbd5e1', minWidth: 26, textAlign: 'center' }}>#{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {ciudad && <>📍 {ciudad} · </>}
                      Compra cada ~<strong>{Math.round(freq)}d</strong> · Lleva <strong>{dias}d</strong> sin comprar · <strong style={{ color: risk.color }}>{Number(factor).toFixed(2)}×</strong> su frecuencia
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                      Promedio mensual: <strong>{fmt(avg)}</strong>
                    </div>
                  </div>
                  <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: risk.bg, color: risk.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {risk.label}
                  </span>
                </div>
              );
            })}

            {data.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
                No se encontraron clientes en riesgo. ¡Todos al día! 🎉
              </div>
            )}
          </div>
        );
      }

      case 'map': {
        const latKey = chartConfig?.latKey || 'Lat';
        const lngKey = chartConfig?.lngKey || 'Lng';
        const labelKey = chartConfig?.labelKey || 'Cardname';
        const valueKey = chartConfig?.valueKey;

        // Filter rows with valid coordinates
        const validPoints = data.filter(r =>
          r[latKey] != null && r[lngKey] != null &&
          !isNaN(Number(r[latKey])) && !isNaN(Number(r[lngKey]))
        );

        if (validPoints.length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              No se encontraron clientes con coordenadas válidas.
            </div>
          );
        }

        // Color scale based on valueKey percentiles
        const getMarkerColor = (() => {
          if (!valueKey) return () => '#3b82f6';
          const vals = validPoints.map(r => Number(r[valueKey]) || 0).sort((a, b) => a - b);
          const p33 = vals[Math.floor(vals.length * 0.33)];
          const p66 = vals[Math.floor(vals.length * 0.66)];
          return (val) => {
            const v = Number(val) || 0;
            if (v >= p66) return '#10b981';   // green — high
            if (v >= p33) return '#f59e0b';   // amber — mid
            return '#ef4444';                  // red — low / no data
          };
        })();

        // Nearest-neighbor route planning (Haversine distance)
        const haversine = (a, b) => {
          const R = 6371;
          const dLat = (b.lat - a.lat) * Math.PI / 180;
          const dLng = (b.lng - a.lng) * Math.PI / 180;
          const h = Math.sin(dLat/2)**2 +
                    Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLng/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        };

        const planRoute = (points) => {
          if (points.length <= 1) return { ordered: points, totalKm: 0 };
          const centroid = {
            lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
            lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
          };
          const startIdx = points.reduce((best, p, i) =>
            haversine(p, centroid) < haversine(points[best], centroid) ? i : best, 0);

          const ordered = [];
          const remaining = [...points];
          let current = remaining.splice(startIdx, 1)[0];
          ordered.push(current);
          let totalKm = 0;

          while (remaining.length > 0) {
            let nearestIdx = 0;
            let nearestDist = haversine(current, remaining[0]);
            for (let i = 1; i < remaining.length; i++) {
              const d = haversine(current, remaining[i]);
              if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
            }
            totalKm += nearestDist;
            current = remaining.splice(nearestIdx, 1)[0];
            ordered.push(current);
          }
          return { ordered, totalKm: Math.round(totalKm) };
        };

        return <MapChart
          validPoints={validPoints}
          latKey={latKey}
          lngKey={lngKey}
          labelKey={labelKey}
          valueKey={valueKey}
          getMarkerColor={getMarkerColor}
          planRoute={planRoute}
          haversine={haversine}
          chartConfig={chartConfig}
        />;
      }

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
