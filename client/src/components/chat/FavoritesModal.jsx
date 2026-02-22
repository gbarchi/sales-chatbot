import React, { useState } from 'react';

function FavoritesModal({ favorites, onClose, onSelect, onDelete, onRename }) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const handleStartRename = (e, item) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const handleSaveRename = (id) => {
    if (editingName.trim()) {
      onRename(id, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      handleSaveRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleSelect = (queryText) => {
    onSelect(queryText);
    onClose();
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={e => e.stopPropagation()}>
        <div className="history-header">
          <div className="history-title">
            <span style={{ fontSize: 20 }}>&#9733;</span>
            Favoritos
          </div>
          <button className="close-button" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="history-content">
          {favorites.length === 0 && (
            <div className="history-empty">
              <span style={{ fontSize: 48, opacity: 0.3 }}>&#9733;</span>
              <p>No tienes consultas guardadas</p>
              <span>Haz clic en &#9733; en cualquier respuesta del chat para guardar.</span>
            </div>
          )}

          {favorites.length > 0 && favorites.map(item => (
            <div
              key={item.id}
              className="history-item favorites-item"
              onClick={() => editingId !== item.id && handleSelect(item.query_text)}
            >
              <div className="item-content">
                {editingId === item.id ? (
                  <input
                    className="favorites-rename-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => handleRenameKeyDown(e, item.id)}
                    onBlur={() => handleSaveRename(item.id)}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="item-text favorites-name">{item.name}</span>
                )}
              </div>
              <div className="favorites-actions">
                <button
                  className="favorites-run-button"
                  onClick={e => { e.stopPropagation(); handleSelect(item.query_text); }}
                  title="Ejecutar"
                >
                  &#9654;
                </button>
                <button
                  className="favorites-rename-button"
                  onClick={e => handleStartRename(e, item)}
                  title="Renombrar"
                >
                  &#9998;
                </button>
                <button
                  className="delete-button favorites-delete-button"
                  onClick={e => handleDelete(e, item.id)}
                  title="Eliminar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
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

        .history-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .history-empty p {
          font-size: 16px;
          font-weight: 500;
          margin: 8px 0 4px 0;
          color: var(--text-primary);
        }

        .history-empty span {
          font-size: 14px;
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
          flex-direction: column;
          gap: 4px;
        }

        .item-text {
          font-size: 14px;
          color: var(--text-primary);
          line-height: 1.4;
          word-break: break-word;
        }

        .favorites-name {
          font-weight: 600;
        }

        .favorites-query-preview {
          font-size: 11px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .favorites-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s ease;
          flex-shrink: 0;
        }

        .favorites-item:hover .favorites-actions {
          opacity: 1;
        }

        .favorites-run-button,
        .favorites-rename-button {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .favorites-run-button:hover {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .favorites-rename-button:hover {
          background: #e3f2fd;
          color: #1565c0;
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
        }

        .favorites-delete-button {
          width: 28px;
          height: 28px;
        }

        .delete-button:hover {
          background: #fef2f2;
          color: #dc2626;
        }

        .favorites-rename-input {
          width: 100%;
          border: 1px solid var(--primary-color);
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 14px;
          font-family: inherit;
          outline: none;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}

export default FavoritesModal;
