import React, { useState } from 'react';
import ChartCarousel from '../charts/ChartCarousel';
import ChartContainer from '../charts/ChartContainer';
import { sendFeedback } from '../../services/api';

function ChatMessage({ message, onClarificationSelect, onFollowUpClick, userQuery, onSaveFavorite }) {
  const [showSQL, setShowSQL] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(null); // 'up' | 'down' | null
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const isBot = message.type === 'bot';
  const hasChart = isBot && message.data && message.data.length > 0;
  const hasMultiResults = isBot && message.results && message.results.length > 0;

  const submitRating = async (rating, correction = null) => {
    setFeedbackRating(rating);
    if (rating === 'down' && !correction) {
      setShowCorrection(true); // prompt for the correct value on a thumbs-down
    } else {
      setShowCorrection(false);
    }
    try {
      await sendFeedback({
        rating,
        query_text: userQuery || null,
        sql: message.sql || null,
        chart_type: message.chartType || null,
        correction: correction || null,
      });
    } catch (e) {
      // Non-blocking: feedback failures should never disrupt the conversation.
      console.error('Feedback failed:', e);
    }
  };

  const handleDrillDown = (dimension, value) => {
    const drillQuery = `Muéstrame el detalle de ventas de ${value}`;
    const event = new CustomEvent('drillDownQuery', { detail: drillQuery });
    window.dispatchEvent(event);
  };

  const handleOpenSaveDialog = () => {
    setSaveName(userQuery || '');
    setShowSaveDialog(true);
  };

  const handleSave = () => {
    if (saveName.trim() && onSaveFavorite) {
      onSaveFavorite(saveName.trim(), userQuery);
    }
    setShowSaveDialog(false);
  };

  const handleCancelSave = () => {
    setShowSaveDialog(false);
  };

  // Render inline markdown: **bold** and *italic*
  const renderInline = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*'))   return <em key={idx}>{part.slice(1, -1)}</em>;
      return part;
    });
  };

  // Convert markdown lines: ## heading, **bold**, *italic*
  const renderMarkdownLine = (text) => {
    if (text.startsWith('## ')) return <strong style={{ display: 'block', marginTop: 4, letterSpacing: '0.3px' }}>{renderInline(text.slice(3))}</strong>;
    if (text.startsWith('# '))  return <strong style={{ display: 'block', marginTop: 4 }}>{renderInline(text.slice(2))}</strong>;
    return renderInline(text);
  };

  return (
    <div className={`chat-message ${isBot ? 'bot' : 'user'} ${message.isError ? 'error' : ''} chat-message-wrapper`}>
      {isBot && !message.isError && !!userQuery && (
        <div className="save-favorite-area">
          <button
            className="save-favorite-btn"
            onClick={handleOpenSaveDialog}
            title="Guardar como favorito"
          >
            &#9733;
          </button>
          {showSaveDialog && (
            <div className="save-favorite-dialog" onClick={e => e.stopPropagation()}>
              <div className="save-favorite-title">Guardar como favorito</div>
              <input
                className="save-favorite-input"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancelSave(); }}
                placeholder="Nombre del favorito"
                autoFocus
              />
              <div className="save-favorite-buttons">
                <button className="save-fav-cancel" onClick={handleCancelSave}>Cancelar</button>
                <button className="save-fav-save" onClick={handleSave}>Guardar</button>
              </div>
            </div>
          )}
        </div>
      )}
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

        {message.followUps && message.followUps.length > 0 && !hasMultiResults && (
          <div className="followup-section">
            <div className="followup-label">💬 Podrías preguntar:</div>
            <div className="followup-chips">
              {message.followUps.map((q, i) => (
                <button key={i} className="followup-chip" onClick={() => onFollowUpClick && onFollowUpClick(q)}>
                  {q}
                </button>
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

        {/* Provenance footer: source tier, freshness, and visible warning when
            the SQL was silently auto-corrected or relaxed. */}
        {isBot && !hasMultiResults && message.provenance && (
          <div className="provenance">
            <span className="prov-item" title="Origen del resultado">
              {message.provenance.source === 'semantic-layer'
                ? `✓ vía métrica${message.provenance.metrics?.length ? ` ${message.provenance.metrics.join(', ')}` : ' canónica'}`
                : '◦ SQL directo'}
            </span>
            {message.provenance.dataFreshness && (
              <span className="prov-item" title="Última fecha en los datos">📅 Datos hasta {message.provenance.dataFreshness}</span>
            )}
            {message.provenance.rowCount != null && (
              <span className="prov-item">{message.provenance.rowCount} fila{message.provenance.rowCount === 1 ? '' : 's'}</span>
            )}
            {(message.provenance.sqlWasAutoCorrected || message.provenance.sqlWasRelaxed) && (
              <span className="prov-warn" title="La consulta se ajustó automáticamente; verifica el resultado">
                ⚠ {message.provenance.sqlWasAutoCorrected ? 'consulta auto-corregida' : 'filtros relajados'}
              </span>
            )}
          </div>
        )}

        {/* Answer feedback (trust + correction harvesting) */}
        {isBot && !message.isError && !!userQuery && (hasChart || message.sql) && (
          <div className="feedback-row">
            {feedbackRating === null ? (
              <>
                <span className="feedback-label">¿Útil?</span>
                <button className="feedback-btn" title="Respuesta correcta" onClick={() => submitRating('up')}>👍</button>
                <button className="feedback-btn" title="Respuesta incorrecta" onClick={() => submitRating('down')}>👎</button>
              </>
            ) : (
              <span className="feedback-thanks">
                {feedbackRating === 'up' ? '✓ Gracias por tu feedback' : '✓ Gracias, lo revisaremos'}
              </span>
            )}
            {showCorrection && (
              <div className="correction-box">
                <input
                  type="text"
                  className="correction-input"
                  placeholder="¿Cuál era el dato correcto? (opcional)"
                  value={correctionText}
                  onChange={(e) => setCorrectionText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && correctionText.trim()) submitRating('down', correctionText.trim()); }}
                />
                <button
                  className="correction-send"
                  disabled={!correctionText.trim()}
                  onClick={() => submitRating('down', correctionText.trim())}
                >
                  Enviar
                </button>
              </div>
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

        .chat-message-wrapper {
          position: relative;
        }

        .save-favorite-area {
          position: absolute;
          top: 4px;
          right: 4px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          z-index: 10;
        }

        .save-favorite-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: #ccc;
          cursor: pointer;
          border-radius: 6px;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: all 0.2s ease;
          line-height: 1;
        }

        .chat-message-wrapper:hover .save-favorite-btn {
          opacity: 1;
        }

        .save-favorite-btn:hover {
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.1);
        }

        .save-favorite-dialog {
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 12px 14px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          width: 260px;
          margin-top: 4px;
        }

        .save-favorite-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .save-favorite-input {
          width: 100%;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          color: var(--text-primary);
          box-sizing: border-box;
          margin-bottom: 8px;
        }

        .save-favorite-input:focus {
          border-color: var(--primary-color);
        }

        .save-favorite-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .save-fav-cancel {
          padding: 5px 12px;
          border: 1px solid var(--border-color);
          background: white;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.15s ease;
        }

        .save-fav-cancel:hover {
          background: #f1f3f4;
        }

        .save-fav-save {
          padding: 5px 12px;
          border: none;
          background: var(--primary-color);
          color: white;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .save-fav-save:hover {
          background: var(--primary-dark);
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
          flex: 1;
          min-width: 0;
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

        .followup-section {
          margin-top: 10px;
        }

        .followup-label {
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .followup-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .followup-chip {
          padding: 5px 12px;
          background: white;
          border: 1.5px solid var(--primary-color);
          border-radius: 16px;
          color: var(--primary-color);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .followup-chip:hover {
          background: var(--primary-color);
          color: white;
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

        .provenance {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
          font-size: 11px;
          color: #6b7280;
        }
        .prov-item { white-space: nowrap; }
        .prov-warn {
          color: #92400e;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 1px 6px;
          white-space: nowrap;
        }

        .feedback-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }
        .feedback-label { font-size: 12px; color: #6b7280; }
        .feedback-btn {
          background: none;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 2px 8px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1.4;
        }
        .feedback-btn:hover { background: #f3f4f6; }
        .feedback-thanks { font-size: 12px; color: #059669; }
        .correction-box {
          display: flex;
          gap: 6px;
          margin-top: 6px;
          width: 100%;
        }
        .correction-input {
          flex: 1;
          padding: 5px 8px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 12px;
        }
        .correction-send {
          padding: 4px 10px;
          border: none;
          border-radius: 6px;
          background: var(--primary-color);
          color: #fff;
          font-size: 12px;
          cursor: pointer;
        }
        .correction-send:disabled { opacity: 0.5; cursor: not-allowed; }

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
