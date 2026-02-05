import React from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LabelList, ReferenceLine
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

  const renderChart = () => {
    switch (chartType) {
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
