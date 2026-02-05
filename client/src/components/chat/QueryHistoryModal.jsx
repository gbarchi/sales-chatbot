import React, { useState, useEffect } from 'react';
import { fetchQueryHistory, deleteHistoryItem } from '../../services/api';

function QueryHistoryModal({ isOpen, onClose, onSelectQuery }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchQueryHistory(50);
      setHistory(response.history || []);
    } catch (err) {
      setError('Error al cargar el historial');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteHistoryItem(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Error deleting history item:', err);
    }
  };

  const handleSelect = (queryText) => {
    onSelectQuery(queryText);
    onClose();
  };

  const groupByDate = (items) => {
    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    items.forEach(item => {
      const itemDate = new Date(item.timestamp);
      if (itemDate >= today) {
        groups.today.push(item);
      } else if (itemDate >= yesterday) {
        groups.yesterday.push(item);
      } else if (itemDate >= weekAgo) {
        groups.thisWeek.push(item);
      } else {
        groups.older.push(item);
      }
    });

    return groups;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  const grouped = groupByDate(history);

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={e => e.stopPropagation()}>
        <div className="history-header">
          <div className="history-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Historial de Consultas
          </div>
          <button className="close-button" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="history-content">
          {loading && (
            <div className="history-loading">Cargando historial...</div>
          )}

          {error && (
            <div className="history-error">{error}</div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="history-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p>No hay consultas en el historial</p>
              <span>Tus consultas aparecerán aquí</span>
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <>
              {grouped.today.length > 0 && (
                <div className="history-group">
                  <div className="group-label">Hoy</div>
                  {grouped.today.map(item => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => handleSelect(item.query_text)}
                    >
                      <div className="item-content">
                        <span className="item-text">{item.query_text}</span>
                        <span className="item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <button
                        className="delete-button"
                        onClick={(e) => handleDelete(e, item.id)}
                        title="Eliminar"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {grouped.yesterday.length > 0 && (
                <div className="history-group">
                  <div className="group-label">Ayer</div>
                  {grouped.yesterday.map(item => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => handleSelect(item.query_text)}
                    >
                      <div className="item-content">
                        <span className="item-text">{item.query_text}</span>
                        <span className="item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <button
                        className="delete-button"
                        onClick={(e) => handleDelete(e, item.id)}
                        title="Eliminar"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {grouped.thisWeek.length > 0 && (
                <div className="history-group">
                  <div className="group-label">Esta semana</div>
                  {grouped.thisWeek.map(item => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => handleSelect(item.query_text)}
                    >
                      <div className="item-content">
                        <span className="item-text">{item.query_text}</span>
                        <span className="item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <button
                        className="delete-button"
                        onClick={(e) => handleDelete(e, item.id)}
                        title="Eliminar"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {grouped.older.length > 0 && (
                <div className="history-group">
                  <div className="group-label">Anteriores</div>
                  {grouped.older.map(item => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => handleSelect(item.query_text)}
                    >
                      <div className="item-content">
                        <span className="item-text">{item.query_text}</span>
                        <span className="item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <button
                        className="delete-button"
                        onClick={(e) => handleDelete(e, item.id)}
                        title="Eliminar"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .history-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .history-modal {
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .history-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .history-title svg {
          color: var(--primary-color);
        }

        .close-button {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .close-button:hover {
          background: #f1f3f4;
          color: var(--text-primary);
        }

        .history-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
        }

        .history-loading,
        .history-error {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .history-error {
          color: #dc2626;
        }

        .history-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .history-empty svg {
          margin-bottom: 16px;
          opacity: 0.4;
        }

        .history-empty p {
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 4px 0;
          color: var(--text-primary);
        }

        .history-empty span {
          font-size: 14px;
        }

        .history-group {
          margin-bottom: 20px;
        }

        .group-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          padding-left: 4px;
        }

        .history-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #f8f9fa;
          border-radius: 10px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .history-item:hover {
          background: #e8f4f8;
          transform: translateX(4px);
        }

        .item-content {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .item-text {
          flex: 1;
          font-size: 14px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-time {
          font-size: 12px;
          color: var(--text-secondary);
          flex-shrink: 0;
          background: #e5e7eb;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .delete-button {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          opacity: 0;
        }

        .history-item:hover .delete-button {
          opacity: 1;
        }

        .delete-button:hover {
          background: #fef2f2;
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}

export default QueryHistoryModal;
