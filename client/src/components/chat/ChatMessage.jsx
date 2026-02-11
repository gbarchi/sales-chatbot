import React, { useState } from 'react';
import ChartCarousel from '../charts/ChartCarousel';
import ChartContainer from '../charts/ChartContainer';

function ChatMessage({ message, onClarificationSelect }) {
  const [showSQL, setShowSQL] = useState(false);
  const isBot = message.type === 'bot';
  const hasChart = isBot && message.data && message.data.length > 0;
  const hasMultiResults = isBot && message.results && message.results.length > 0;

  const handleDrillDown = (dimension, value) => {
    const drillQuery = `Muéstrame el detalle de ventas de ${value}`;
    const event = new CustomEvent('drillDownQuery', { detail: drillQuery });
    window.dispatchEvent(event);
  };

  // Convert markdown-style bold (**text**) to JSX with <strong> tags
  const renderMarkdownLine = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className={`chat-message ${isBot ? 'bot' : 'user'} ${message.isError ? 'error' : ''}`}>
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
              {renderMarkdownLine(line)}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>

        {message.suggestion && (
          <div className="suggestion-hint">
            💡 {message.suggestion}
          </div>
        )}

        {message.isClarification && (
          <div className="clarification-options">
            {message.matches.map((name, idx) => (
              <button
                key={idx}
                className="clarification-option"
                onClick={() => onClarificationSelect(name, message.searchTerm, message.originalQuery)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {message.rowCount !== undefined && !hasMultiResults && (
          <div className="row-count">
            📊 {message.rowCount} {message.rowCount === 1 ? 'resultado' : 'resultados'}
          </div>
        )}

        {/* Single chart inline */}
        {hasChart && !hasMultiResults && (
          <div className="inline-chart">
            <ChartContainer
              data={message.data}
              chartType={message.chartType}
              chartConfig={message.chartConfig}
              onDrillDown={handleDrillDown}
            />
          </div>
        )}

        {/* Multi-results in carousel */}
        {hasMultiResults && (
          <div className="multi-results-container">
            <ChartCarousel results={message.results} onDrillDown={handleDrillDown} />
          </div>
        )}

        {/* Analysis section - always shown after chart */}
        {message.analysis && !hasMultiResults && (
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
                  {renderMarkdownLine(line)}
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

        .message-text strong {
          font-weight: 600;
          color: inherit;
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

        .inline-chart {
          margin-top: 16px;
          border-radius: 12px;
          overflow-x: auto;
          overflow-y: hidden;
          border: 1px solid var(--border-color);
          background: white;
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

        .multi-results-container {
          margin-top: 12px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
        }

        .clarification-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .clarification-option {
          padding: 8px 16px;
          background: white;
          border: 1.5px solid var(--primary-color);
          border-radius: 20px;
          color: var(--primary-color);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .clarification-option:hover {
          background: var(--primary-color);
          color: white;
        }
      `}</style>
    </div>
  );
}

export default ChatMessage;
