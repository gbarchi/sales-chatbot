import React, { useState, useEffect, useCallback } from 'react';
import { fetchQueryLogs, fetchQueryStats } from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const RESULT_TYPES = [
  { value: '',                  label: 'Todos los tipos' },
  { value: 'success',          label: 'Exitoso' },
  { value: 'error',            label: 'Error' },
  { value: 'empty',            label: 'Sin resultados' },
  { value: 'conversational',   label: 'Conversacional' },
  { value: 'multi',            label: 'Multi-consulta' },
  { value: 'blocked',          label: 'Bloqueado' },
  { value: 'clarification',    label: 'Aclaración' },
  { value: 'validation_error', label: 'Validación' },
];

const BADGE_STYLES = {
  success:          { background: '#d1fae5', color: '#065f46' },
  error:            { background: '#fee2e2', color: '#dc2626' },
  empty:            { background: '#fef3c7', color: '#92400e' },
  conversational:   { background: '#dbeafe', color: '#1e40af' },
  multi:            { background: '#ede9fe', color: '#5b21b6' },
  blocked:          { background: '#ffedd5', color: '#c2410c' },
  clarification:    { background: '#e0f2fe', color: '#0369a1' },
  validation_error: { background: '#f3f4f6', color: '#374151' },
};

function ResultBadge({ type }) {
  const style = BADGE_STYLES[type] || { background: '#f3f4f6', color: '#374151' };
  const label = RESULT_TYPES.find(t => t.value === type)?.label || type;
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      ...style
    }}>
      {label}
    </span>
  );
}

function ExpandedRow({ log }) {
  const parseJson = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
  };

  return (
    <tr>
      <td colSpan={7} style={{ background: '#f8fafc', padding: '12px 20px', borderBottom: '2px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          {log.llm_sql && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>SQL Generado</div>
              <pre style={{
                margin: 0,
                padding: '10px 14px',
                background: '#1e293b',
                color: '#e2e8f0',
                borderRadius: 6,
                fontSize: 12,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 200
              }}>
                {log.llm_sql}
              </pre>
            </div>
          )}

          {log.error_message && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Error</div>
              <div style={{ padding: '8px 12px', background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>
                {log.error_message}
              </div>
            </div>
          )}

          {log.llm_explanation && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Explicación del LLM</div>
              <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: 6, fontSize: 13, color: '#334155' }}>
                {log.llm_explanation}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {log.llm_chart_config && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chart Config</div>
                <pre style={{
                  margin: 0,
                  padding: '8px 12px',
                  background: '#f1f5f9',
                  borderRadius: 6,
                  fontSize: 11,
                  overflowX: 'auto',
                  maxHeight: 120
                }}>
                  {parseJson(log.llm_chart_config)}
                </pre>
              </div>
            )}

            {log.resolved_entities && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Entidades Resueltas</div>
                <pre style={{
                  margin: 0,
                  padding: '8px 12px',
                  background: '#f1f5f9',
                  borderRadius: 6,
                  fontSize: 11,
                  overflowX: 'auto',
                  maxHeight: 120
                }}>
                  {parseJson(log.resolved_entities)}
                </pre>
              </div>
            )}
          </div>

          {log.date_filter && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              <strong>Filtro fecha:</strong>{' '}
              <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>
                {typeof log.date_filter === 'string' ? log.date_filter : JSON.stringify(log.date_filter)}
              </code>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

const RESULT_TYPE_COLORS = {
  success:          '#10b981',
  error:            '#dc2626',
  empty:            '#f59e0b',
  conversational:   '#3b82f6',
  multi:            '#8b5cf6',
  blocked:          '#f97316',
  clarification:    '#06b6d4',
  validation_error: '#94a3b8',
};

function StatsTab({ stats, loading, error }) {
  if (loading) return <div className="qlp-loading">Cargando estadísticas...</div>;

  if (error) return (
    <div style={{ margin: 24, padding: '10px 16px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 13 }}>
      Error al cargar estadísticas: {error}
    </div>
  );

  if (!stats) return null;

  const { kpis, by_day, by_result_type, by_chart_type, top_users } = stats;

  const allTypes = RESULT_TYPES.filter(t => t.value !== '');
  const resultTypeMap = Object.fromEntries((by_result_type || []).map(r => [r.result_type, r.total]));
  const resultTypeData = allTypes
    .map(t => ({ name: t.label, value: resultTypeMap[t.value] || 0, color: RESULT_TYPE_COLORS[t.value] || '#94a3b8' }))
    .filter(d => d.value > 0);
  const total = resultTypeData.reduce((s, d) => s + d.value, 0) || 1;

  const chartTypeData = (by_chart_type || []).map(d => ({ name: d.llm_chart_type, total: d.total }));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total consultas',   value: kpis?.total_queries?.toLocaleString() ?? '—' },
          { label: 'Tasa de éxito',     value: kpis?.success_rate != null ? `${kpis.success_rate}%` : '—' },
          { label: 'Duración promedio', value: kpis?.avg_duration_ms != null ? `${Math.round(kpis.avg_duration_ms).toLocaleString()} ms` : '—' },
          { label: 'Usuarios activos',  value: kpis?.active_users?.toLocaleString() ?? '—' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Queries per day */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Consultas por día</div>
        {by_day && by_day.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={by_day} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
                tickFormatter={v => v && v.match(/^\d{4}-\d{2}-\d{2}/) ? v.substring(8, 10) + '/' + v.substring(5, 7) : v}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={v => [v.toLocaleString(), 'Consultas']}
                labelFormatter={label => {
                  if (label && label.match(/^\d{4}-\d{2}-\d{2}/)) {
                    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
                    return `${parseInt(label.substring(8,10))} ${months[parseInt(label.substring(5,7))-1]} ${label.substring(0,4)}`;
                  }
                  return label;
                }}
              />
              <Bar dataKey="total" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Sin datos</div>
        )}
      </div>

      {/* Two-column: result types + chart types */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>

        {/* Result type breakdown */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Distribución por tipo de resultado</div>
          <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
            {resultTypeData.map(d => (
              <div key={d.name} title={`${d.name}: ${d.value} (${((d.value/total)*100).toFixed(1)}%)`}
                style={{ width: `${(d.value/total)*100}%`, background: d.color, minWidth: d.value > 0 ? 2 : 0 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {resultTypeData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#334155' }}>{d.name}</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{d.value.toLocaleString()}</span>
                <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 44, textAlign: 'right' }}>{((d.value/total)*100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top chart types */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Tipos de gráfico más usados</div>
          {chartTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartTypeData} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={55} />
                <Tooltip formatter={v => [v.toLocaleString(), 'Usos']} />
                <Bar dataKey="total" fill="#dc2626" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Sin datos</div>
          )}
        </div>
      </div>

      {/* Top users */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Usuarios más activos</div>
        {top_users && top_users.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['#', 'Usuario', 'Consultas', 'Tasa éxito', 'Último login'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: ['Consultas','Tasa éxito','#'].includes(h) ? 'right' : 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top_users.map((u, i) => (
                <tr key={u.username} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 500 }}>{i + 1}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b' }}>{u.username}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155' }}>{u.total_queries.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: u.success_rate >= 70 ? '#10b981' : '#f59e0b' }}>
                    {u.success_rate != null ? `${u.success_rate}%` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {u.last_login ? new Date(u.last_login.replace(' ', 'T') + 'Z').toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Sin datos</div>
        )}
      </div>

    </div>
  );
}

const PAGE_SIZE = 50;

function QueryLogsPanel({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [currentOffset, setCurrentOffset] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState('logs');

  // Stats state
  const [stats, setStats]               = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError]     = useState(null);
  const [statsUsername, setStatsUsername] = useState('');

  // Filters
  const [resultType, setResultType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadLogs = useCallback(async (isLoadMore = false) => {
    try {
      isLoadMore ? setLoadingMore(true) : setLoading(true);
      setError(null);

      const offset = isLoadMore ? currentOffset : 0;
      const data = await fetchQueryLogs({
        result_type: resultType || null,
        date_from:   dateFrom  || null,
        date_to:     dateTo    || null,
        limit:       PAGE_SIZE,
        offset
      });

      if (isLoadMore) {
        setLogs(prev => [...prev, ...data.logs]);
        setCurrentOffset(offset + data.logs.length);
      } else {
        setLogs(data.logs);
        setCurrentOffset(data.logs.length);
      }
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [resultType, dateFrom, dateTo, currentOffset]);

  // Load stats when stats tab is active or date filters change
  useEffect(() => {
    if (activeTab !== 'stats') return;
    let cancelled = false;
    (async () => {
      try {
        setStatsLoading(true);
        setStatsError(null);
        const data = await fetchQueryStats({ date_from: dateFrom || null, date_to: dateTo || null, username: statsUsername || null });
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setStatsError(err.message);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, dateFrom, dateTo, statsUsername]);

  // Reload when filters change
  useEffect(() => {
    setCurrentOffset(0);
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchQueryLogs({
          result_type: resultType || null,
          date_from:   dateFrom  || null,
          date_to:     dateTo    || null,
          limit:       PAGE_SIZE,
          offset:      0
        });
        setLogs(data.logs);
        setCurrentOffset(data.logs.length);
        setTotal(data.total);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [resultType, dateFrom, dateTo]);

  const handleLoadMore = async () => {
    try {
      setLoadingMore(true);
      const data = await fetchQueryLogs({
        result_type: resultType || null,
        date_from:   dateFrom  || null,
        date_to:     dateTo    || null,
        limit:       PAGE_SIZE,
        offset:      currentOffset
      });
      setLogs(prev => [...prev, ...data.logs]);
      setCurrentOffset(prev => prev + data.logs.length);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    setResultType('');
    setDateFrom('');
    setDateTo('');
    setStatsUsername('');
  };

  const formatTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' });
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="qlp-panel">
      <div className="qlp-header">
        <h2 style={{ margin: 0, fontSize: 20 }}>Logs de Consultas</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            {total.toLocaleString()} registros
          </span>
          <button className="qlp-btn-close" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
        {[{ key: 'logs', label: '📋 Logs' }, { key: 'stats', label: '📊 Estadísticas' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            borderBottom: activeTab === tab.key ? '2px solid #dc2626' : '2px solid transparent',
            fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? '#dc2626' : '#64748b',
            marginBottom: -2
          }}>{tab.label}</button>
        ))}
      </div>

      <div className="qlp-filters">
        {activeTab === 'logs' && (
          <select
            value={resultType}
            onChange={e => setResultType(e.target.value)}
            className="qlp-filter-select"
          >
            {RESULT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        )}
        {activeTab === 'stats' && stats?.username_list?.length > 0 && (
          <select
            value={statsUsername}
            onChange={e => setStatsUsername(e.target.value)}
            className="qlp-filter-select"
          >
            <option value="">Todos los usuarios</option>
            {stats.username_list.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="qlp-filter-input"
          title="Desde"
        />
        <span style={{ color: '#94a3b8', fontSize: 13 }}>→</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="qlp-filter-input"
          title="Hasta"
        />
        {(resultType || dateFrom || dateTo || statsUsername) && (
          <button onClick={clearFilters} className="qlp-btn-clear">
            Limpiar filtros
          </button>
        )}
      </div>

      {activeTab === 'stats' ? (
        <StatsTab stats={stats} loading={statsLoading} error={statsError} />
      ) : (
        <>
      {error && (
        <div className="qlp-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="qlp-loading">Cargando logs...</div>
      ) : (
        <div className="qlp-table-container">
          <table className="qlp-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Usuario</th>
                <th>Consulta del usuario</th>
                <th>Tipo</th>
                <th>Gráfico</th>
                <th style={{ textAlign: 'right' }}>Filas</th>
                <th style={{ textAlign: 'right' }}>Duración</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                    No hay logs para los filtros seleccionados
                  </td>
                </tr>
              )}
              {logs.map(log => (
                <React.Fragment key={log.id}>
                  <tr
                    className={`qlp-row ${expandedId === log.id ? 'qlp-row-expanded' : ''}`}
                    onClick={() => toggleExpand(log.id)}
                  >
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#64748b' }}>
                      {formatTime(log.timestamp)}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>
                      {log.username || '—'}
                    </td>
                    <td>
                      <span style={{
                        display: 'block',
                        maxWidth: 340,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 13
                      }} title={log.user_query}>
                        {log.user_query}
                      </span>
                    </td>
                    <td>
                      <ResultBadge type={log.result_type} />
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {log.llm_chart_type || '—'}
                    </td>
                    <td style={{ fontSize: 12, textAlign: 'right', color: '#64748b' }}>
                      {log.result_row_count != null ? log.result_row_count.toLocaleString() : '—'}
                    </td>
                    <td style={{ fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b' }}>
                      {log.duration_ms != null ? `${log.duration_ms.toLocaleString()} ms` : '—'}
                    </td>
                  </tr>
                  {expandedId === log.id && <ExpandedRow log={log} />}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {logs.length < total && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="qlp-btn-more"
              >
                {loadingMore ? 'Cargando...' : `Cargar más (${(total - logs.length).toLocaleString()} restantes)`}
              </button>
            </div>
          )}
        </div>
      )}
        </>
      )}

      <style>{`
        .qlp-panel {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: white;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: inherit;
        }

        .qlp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
          color: white;
          flex-shrink: 0;
        }

        .qlp-btn-close {
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.1);
          color: white;
          font-size: 22px;
          line-height: 1;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .qlp-btn-close:hover {
          background: rgba(255,255,255,0.2);
        }

        .qlp-filters {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          background: #f8fafc;
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .qlp-filter-select,
        .qlp-filter-input {
          padding: 7px 10px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 6px;
          font-size: 13px;
          background: white;
          color: inherit;
        }

        .qlp-filter-select:focus,
        .qlp-filter-input:focus {
          outline: none;
          border-color: var(--primary-color);
        }

        .qlp-btn-clear {
          padding: 7px 12px;
          border: 1px solid var(--border-color, #e2e8f0);
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          color: var(--text-secondary, #64748b);
        }

        .qlp-btn-clear:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .qlp-error {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 24px;
          background: #fee2e2;
          color: #dc2626;
          border-bottom: 1px solid #fca5a5;
          flex-shrink: 0;
          font-size: 13px;
        }

        .qlp-error button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: #dc2626;
          line-height: 1;
        }

        .qlp-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
          font-size: 15px;
          color: var(--text-secondary, #64748b);
        }

        .qlp-table-container {
          flex: 1;
          overflow: auto;
        }

        .qlp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .qlp-table th {
          background: #f8fafc;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.5px;
          padding: 10px 16px;
          text-align: left;
          border-bottom: 2px solid var(--border-color, #e2e8f0);
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .qlp-table td {
          padding: 10px 16px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          vertical-align: middle;
        }

        .qlp-row {
          cursor: pointer;
          transition: background 0.1s;
        }

        .qlp-row:hover {
          background: #f0f9ff;
        }

        .qlp-row-expanded {
          background: #eff6ff;
        }

        .qlp-row-expanded td {
          border-bottom: none;
        }

        .qlp-btn-more {
          padding: 10px 28px;
          border: 1px solid var(--primary-color);
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          color: var(--primary-color);
          transition: all 0.15s;
        }

        .qlp-btn-more:hover:not(:disabled) {
          background: var(--primary-color);
          color: white;
        }

        .qlp-btn-more:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default QueryLogsPanel;
