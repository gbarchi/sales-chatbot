import React, { useState } from 'react';

function ChatMessage({ message, isSelected, onSelect }) {
  const [showSQL, setShowSQL] = useState(false);
  const isBot = message.type === 'bot';
  const hasChart = isBot && message.data && message.data.length > 0;

  const handleClick = () => {
    if (hasChart && onSelect) {
      onSelect(message.id);
    }
  };

  return (
    <div
      className={`chat-message ${isBot ? 'bot' : 'user'} ${message.isError ? 'error' : ''} ${isSelected ? 'selected' : ''} ${hasChart ? 'has-chart' : ''}`}
      onClick={handleClick}
    >
      {isBot && (
        <div className="avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
          </svg>
        </div>
      )}

      <div className="message-content">
        <div className="message-text">
          {message.content?.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>

        {message.suggestion && (
          <div className="suggestion-hint">
            💡 {message.suggestion}
          </div>
        )}

        {message.rowCount !== undefined && (
          <div className="row-count">
            📊 {message.rowCount} {message.rowCount === 1 ? 'resultado' : 'resultados'}
          </div>
        )}

        {hasChart && (
          <div className={`chart-indicator ${isSelected ? 'active' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" fill="currentColor"/>
            </svg>
            {isSelected ? 'Gráfico visible' : 'Click para ver gráfico'}
          </div>
        )}

        {message.analysis && (
          <div className="analysis-section">
            <div className="analysis-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="currentColor"/>
              </svg>
              Análisis e Insights
            </div>
            <div className="analysis-content">
              {message.analysis.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < message.analysis.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {message.sql && (
          <div className="sql-section">
            <button
              className="sql-toggle"
              onClick={() => setShowSQL(!showSQL)}
            >
              {showSQL ? '▼' : '▶'} Ver SQL
            </button>
            {showSQL && (
              <pre className="sql-code">{message.sql}</pre>
            )}
          </div>
        )}
      </div>

      <style>{`
        .chat-message {
          display: flex;
          gap: 12px;
          max-width: 100%;
        }

        .chat-message.user {
          flex-direction: row-reverse;
        }

        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .message-content {
          max-width: calc(100% - 44px);
        }

        .message-text {
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
        }

        .bot .message-text {
          background: #f1f3f4;
          border-bottom-left-radius: 4px;
        }

        .user .message-text {
          background: var(--primary-color);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .error .message-text {
          background: #fce8e6;
          color: var(--error-color);
        }

        .suggestion-hint {
          margin-top: 8px;
          padding: 8px 12px;
          background: #fff8e1;
          border-radius: 8px;
          font-size: 13px;
          color: #856404;
        }

        .row-count {
          margin-top: 8px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .chat-message.has-chart {
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .chat-message.has-chart:hover {
          transform: translateX(4px);
        }

        .chat-message.selected .message-content {
          border-left: 3px solid var(--primary-color);
          padding-left: 8px;
          margin-left: -11px;
        }

        .chart-indicator {
          margin-top: 8px;
          padding: 6px 10px;
          background: #e8f4fd;
          border-radius: 6px;
          font-size: 12px;
          color: #1976d2;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .chart-indicator.active {
          background: var(--primary-color);
          color: white;
        }

        .chat-message.has-chart:hover .chart-indicator:not(.active) {
          background: #d1e7f8;
        }

        .analysis-section {
          margin-top: 12px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-radius: 12px;
          border-left: 4px solid #f59e0b;
        }

        .analysis-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 13px;
          color: #92400e;
          margin-bottom: 10px;
        }

        .analysis-header svg {
          color: #f59e0b;
        }

        .analysis-content {
          font-size: 13px;
          line-height: 1.6;
          color: #78350f;
        }

        .analysis-content strong {
          color: #92400e;
        }

        .sql-section {
          margin-top: 8px;
        }

        .sql-toggle {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 12px;
          padding: 4px 0;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .sql-toggle:hover {
          color: var(--primary-color);
        }

        .sql-code {
          margin-top: 8px;
          padding: 12px;
          background: #1e1e1e;
          color: #d4d4d4;
          border-radius: 8px;
          font-size: 12px;
          font-family: 'Monaco', 'Consolas', monospace;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

export default ChatMessage;
