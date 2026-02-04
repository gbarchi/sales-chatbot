import React, { useState, useMemo } from 'react';

function DataTable({ data }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [data, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(data.length / rowsPerPage);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatValue = (value, key) => {
    if (value === null || value === undefined) return '-';

    if (typeof value === 'number') {
      const keyLower = key.toLowerCase();

      // Check if it's a COUNT (not monetary) based on column name
      const countKeys = ['cantidad', 'count', 'total_vendedores', 'total_clientes', 'total_productos',
                         'numero', 'num_', 'qty', 'registros', 'documentos', 'facturas', 'items',
                         'unidades', 'lineas', 'clientes', 'productos'];
      if (countKeys.some(k => keyLower.includes(k))) {
        return new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 }).format(value);
      }

      // Check if it's a percentage
      if (keyLower.includes('margen') || keyLower.includes('percent') || keyLower.includes('_pct') || keyLower.includes('crecimiento')) {
        return `${value.toFixed(2)}%`;
      }

      // Check if it's a monetary value based on column name
      const monetaryKeys = ['ventas', 'venta', 'linetotal', 'linecost', 'cost', 'price', 'precio',
                           'monto', 'valor', 'ingreso', 'revenue', 'total_ventas', 'total_monto'];
      if (monetaryKeys.some(k => keyLower.includes(k))) {
        return new Intl.NumberFormat('es-EC', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2
        }).format(value);
      }

      // Regular number (no currency)
      return new Intl.NumberFormat('es-EC').format(value);
    }

    // Handle dates
    if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
      const date = new Date(value);
      return date.toLocaleDateString('es-ES');
    }

    return String(value);
  };

  return (
    <div className="data-table-container">
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} onClick={() => handleSort(col)}>
                  <div className="th-content">
                    <span>{col}</span>
                    {sortConfig.key === col && (
                      <span className="sort-indicator">
                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td key={col}>{formatValue(row[col], col)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ← Anterior
          </button>
          <span className="page-info">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Siguiente →
          </button>
        </div>
      )}

      <style>{`
        .data-table-container {
          width: 100%;
        }

        .table-wrapper {
          overflow-x: auto;
          max-height: 500px;
          overflow-y: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .data-table th {
          position: sticky;
          top: 0;
          background: #f8f9fa;
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: var(--text-primary);
          border-bottom: 2px solid var(--border-color);
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }

        .data-table th:hover {
          background: #e8eaed;
        }

        .th-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sort-indicator {
          font-size: 10px;
          color: var(--primary-color);
        }

        .data-table td {
          padding: 10px 16px;
          border-bottom: 1px solid #f0f0f0;
          color: var(--text-primary);
        }

        .data-table tr:hover td {
          background: #f8faff;
        }

        .data-table tr:last-child td {
          border-bottom: none;
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 16px;
          border-top: 1px solid var(--border-color);
        }

        .pagination button {
          padding: 8px 16px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: white;
          color: var(--text-primary);
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .pagination button:hover:not(:disabled) {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .pagination button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-info {
          font-size: 13px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

export default DataTable;
