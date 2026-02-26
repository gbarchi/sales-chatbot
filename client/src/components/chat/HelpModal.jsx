import React, { useState } from 'react';

const SECTIONS = [
  {
    id: 'charts',
    label: 'Gráficos',
    icon: '📊',
    items: [
      { keyword: 'barras / barra', desc: 'Gráfico de barras — comparar categorías', example: '"Ventas por vendedor"' },
      { keyword: 'línea / tendencia', desc: 'Gráfico de línea — evolución en el tiempo', example: '"Tendencia de ventas por mes"' },
      { keyword: 'multi-línea / por categoría', desc: 'Múltiples líneas, una por vendedor/familia/provincia', example: '"Ventas por mes separado por familia"' },
      { keyword: 'comparar líneas / vs mes a mes', desc: 'Dos líneas en el mismo eje para comparar el mismo período en años distintos', example: '"Comparar ventas mes a mes 2024 vs 2025"' },
      { keyword: 'pastel / pie / torta', desc: 'Gráfico de pastel — distribución porcentual', example: '"Distribución de ventas por familia"' },
      { keyword: 'área', desc: 'Gráfico de área — acumulado en el tiempo', example: '"Ventas acumuladas por semana"' },
      { keyword: 'dispersión / scatter', desc: 'Gráfico de dispersión — correlación entre métricas', example: '"Dispersión de clientes por volumen vs frecuencia"' },
      { keyword: 'combo / barras y línea', desc: 'Barras + línea superpuesta (ej: ventas + margen)', example: '"Ventas y margen por categoría"' },
      { keyword: 'mapa de calor / heatmap', desc: 'Matriz de color por dos dimensiones', example: '"Ventas por familia y mes — mapa de calor"' },
      { keyword: 'tabla', desc: 'Tabla con datos detallados y paginación', example: '"Lista de facturas de esta semana"' },
    ],
  },
  {
    id: 'map',
    label: 'Mapa',
    icon: '🗺️',
    items: [
      { keyword: 'mapa / geográfico / ubicación', desc: 'Mapa interactivo con clientes geolocalizados', example: '"Muéstrame en el mapa los clientes de Ronny"' },
      { keyword: 'ruta de visitas', desc: 'Planifica la ruta óptima entre clientes', example: '"Mapa de clientes de Ronny con ruta de visitas"' },
      { keyword: 'prospectos / sin compras', desc: 'Incluye clientes sin historial de compra', example: '"Mapa de todos los clientes incluyendo prospectos"' },
    ],
  },
  {
    id: 'analysis',
    label: 'Análisis',
    icon: '🔍',
    items: [
      { keyword: 'comparar / vs / versus', desc: 'Comparación entre períodos o dimensiones', example: '"Comparar ventas 2024 vs 2025 por mes"' },
      { keyword: 'top N / mejores / peores', desc: 'Ranking de los N primeros o últimos', example: '"Top 10 clientes por ventas este año"' },
      { keyword: 'churn / abandono / riesgo de perder clientes', desc: 'Tarjetas de alerta con clientes en riesgo según su patrón de compra y días sin actividad', example: '"Qué clientes están en riesgo de abandono"' },
      { keyword: 'inactivos / sin comprar en X días', desc: 'Clientes que no han comprado en un período específico', example: '"Clientes inactivos más de 60 días"' },
      { keyword: 'ficha técnica / perfil del cliente', desc: 'Tarjeta completa con KPIs: ventas lifetime, ticket promedio, frecuencia de compra, familias top y crecimiento semestral', example: '"Dame la ficha técnica de Ferretería Martínez"' },
      { keyword: 'clientes nuevos / primera compra', desc: 'Clientes cuya primera compra ocurrió en un período, agrupables por mes, trimestre o año', example: '"Qué clientes nuevos hubo en el Q4 del 2024"' },
      { keyword: 'proyección / proyectar', desc: 'Proyectar ventas hacia adelante', example: '"Proyecta las ventas del 2026 basado en 2025"' },
      { keyword: 'plan de visitas', desc: 'Lista de clientes prioritarios para visitar', example: '"Plan mis visitas para este mes"' },
    ],
  },
  {
    id: 'filters',
    label: 'Filtros',
    icon: '📅',
    items: [
      { keyword: 'hoy / esta semana / este mes', desc: 'Períodos relativos al día actual', example: '"Ventas de hoy por vendedor"' },
      { keyword: 'en enero / en 2024', desc: 'Períodos específicos', example: '"Ventas en enero 2025"' },
      { keyword: 'últimos N días / semanas / meses', desc: 'Ventana de tiempo reciente', example: '"Top clientes en los últimos 30 días"' },
      { keyword: 'de [fecha] a [fecha]', desc: 'Rango de fechas personalizado', example: '"Ventas del 1 de enero al 31 de marzo"' },
      { keyword: 'por vendedor / supervisor / ciudad', desc: 'Filtrar por dimensión', example: '"Ventas de Ronny en Guayaquil este año"' },
    ],
  },
  {
    id: 'tips',
    label: 'Consejos',
    icon: '💡',
    items: [
      { keyword: '⭐ Favoritos', desc: 'Pasa el cursor sobre una respuesta del bot y haz clic en ⭐ para guardar esa consulta. Ábrela después desde el botón ⭐ en el chat.', example: null },
      { keyword: '🕐 Historial', desc: 'El botón de reloj muestra tus consultas anteriores. Haz clic en cualquiera para repetirla.', example: null },
      { keyword: '📅 Filtro de fecha', desc: 'Usa la barra de fecha encima del chat para acotar el período por defecto de todas las consultas.', example: null },
      { keyword: 'Drill-down', desc: 'En gráficos de barras y pastel, haz clic en una barra/sector para explorar el detalle de ese elemento.', example: null },
      { keyword: 'Exportar CSV', desc: 'Cada gráfico tiene un botón "Exportar CSV" para descargar los datos.', example: null },
    ],
  },
];

function HelpModal({ onClose }) {
  const [activeSection, setActiveSection] = useState('charts');
  const section = SECTIONS.find(s => s.id === activeSection);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s ease',
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 16, width: '90%', maxWidth: 680,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'slideUp 0.25s ease',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
            <span style={{ fontSize: 22 }}>📖</span>
            Guía de uso
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8, fontSize: 20, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', flexShrink: 0 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              padding: '8px 14px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: activeSection === s.id ? 'white' : 'transparent',
              color: activeSection === s.id ? '#dc2626' : '#64748b',
              borderBottom: activeSection === s.id ? '2px solid #dc2626' : '2px solid transparent',
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {section.items.map((item, i) => (
            <div key={i} style={{
              padding: '14px 16px', borderRadius: 10, background: '#f8fafc',
              marginBottom: 8, border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <code style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1 }}>
                  {item.keyword}
                </code>
                <div>
                  <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5 }}>{item.desc}</div>
                  {item.example && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 5, fontStyle: 'italic' }}>
                      Ej: {item.example}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

export default HelpModal;
