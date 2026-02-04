import React, { useState } from 'react';

function DateFilter({ dateRange, onFilterChange, activeFilter }) {
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Calculate preset ranges based on the data's max date or use defaults
  const maxDate = dateRange?.max ? new Date(dateRange.max) : new Date(2025, 11, 31);
  const minDate = dateRange?.min ? new Date(dateRange.min) : new Date(2024, 0, 1);
  const maxYear = maxDate.getFullYear();
  const minYear = minDate.getFullYear();

  // Build year presets dynamically based on available data
  const yearPresets = [];
  for (let year = maxYear; year >= minYear && year >= maxYear - 2; year--) {
    yearPresets.push({
      id: `year-${year}`,
      label: `${year}`,
      getRange: () => ({
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31)
      })
    });
  }

  const presets = [
    { id: 'all', label: 'Todo', getRange: () => null },
    ...yearPresets,
    { id: 'last-3-months', label: 'Últ. 3 meses', getRange: () => {
      const end = new Date(maxDate);
      const start = new Date(maxDate);
      start.setMonth(start.getMonth() - 3);
      return { start, end };
    }},
    { id: 'last-6-months', label: 'Últ. 6 meses', getRange: () => {
      const end = new Date(maxDate);
      const start = new Date(maxDate);
      start.setMonth(start.getMonth() - 6);
      return { start, end };
    }},
  ];

  const handlePresetClick = (preset) => {
    setShowCustom(false);
    const range = preset.getRange();
    onFilterChange({
      id: preset.id,
      label: preset.label,
      range: range
    });
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onFilterChange({
        id: 'custom',
        label: `${customStart} a ${customEnd}`,
        range: {
          start: new Date(customStart),
          end: new Date(customEnd)
        }
      });
      setShowCustom(false);
    }
  };

  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  return (
    <div className={`date-filter ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="filter-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="filter-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>Período: <strong>{activeFilter?.label || 'Todo'}</strong></span>
        </div>
        <button className="toggle-btn" title={isCollapsed ? 'Mostrar filtros' : 'Ocultar filtros'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="preset-buttons">
            {presets.map(preset => (
              <button
                key={preset.id}
                className={`preset-btn ${activeFilter?.id === preset.id ? 'active' : ''}`}
                onClick={() => handlePresetClick(preset)}
              >
                {preset.label}
              </button>
            ))}
            <button
              className={`preset-btn ${activeFilter?.id === 'custom' ? 'active' : ''}`}
              onClick={() => setShowCustom(!showCustom)}
            >
              Personalizado
            </button>
          </div>

          {showCustom && (
            <div className="custom-range">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                min={dateRange?.min ? formatDate(new Date(dateRange.min)) : undefined}
                max={dateRange?.max ? formatDate(new Date(dateRange.max)) : undefined}
              />
              <span>a</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                min={customStart || (dateRange?.min ? formatDate(new Date(dateRange.min)) : undefined)}
                max={dateRange?.max ? formatDate(new Date(dateRange.max)) : undefined}
              />
              <button className="apply-btn" onClick={handleCustomApply}>
                Aplicar
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        .date-filter {
          padding: 10px 16px;
          background: #f8f9fa;
          border-top: 1px solid var(--border-color);
        }

        .date-filter.collapsed {
          padding: 8px 16px;
        }

        .filter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          user-select: none;
        }

        .filter-header:hover .toggle-btn {
          background: #e5e7eb;
        }

        .filter-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .filter-label strong {
          color: var(--primary-color);
          font-weight: 600;
        }

        .toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: background 0.2s;
        }

        .preset-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 10px;
        }

        .preset-btn {
          padding: 5px 10px;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          background: white;
          font-size: 11px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .preset-btn:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .preset-btn.active {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: white;
        }

        .custom-range {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 8px;
          background: white;
          border-radius: 6px;
          border: 1px solid var(--border-color);
        }

        .custom-range input {
          padding: 5px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 11px;
          width: 120px;
        }

        .custom-range span {
          color: var(--text-secondary);
          font-size: 11px;
        }

        .apply-btn {
          padding: 5px 12px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
        }

        .apply-btn:hover {
          background: var(--primary-dark);
        }
      `}</style>
    </div>
  );
}

export default DateFilter;
