import React, { useState, useEffect, useRef } from 'react';

function ChatInput({ onSend, disabled, onHistoryClick, onFavoritesClick }) {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handleSuggestion = (event) => {
      setMessage(event.detail);
      inputRef.current?.focus();
    };

    window.addEventListener('suggestionSelected', handleSuggestion);
    return () => window.removeEventListener('suggestionSelected', handleSuggestion);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="chat-input-container" onSubmit={handleSubmit}>
      <div className="input-wrapper">
        <button
          type="button"
          onClick={onHistoryClick}
          className="history-button"
          title="Historial de consultas"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={onFavoritesClick}
          className="history-button"
          title="Consultas favoritas"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pregunta sobre tus ventas..."
          disabled={disabled}
          rows={1}
          className="chat-textarea"
        />
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="send-button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div className="input-hint">
        Presiona Enter para enviar
      </div>

      <style>{`
        .chat-input-container {
          padding: 16px;
          border-top: 1px solid var(--border-color);
          background: white;
        }

        .input-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: #f1f3f4;
          border-radius: 24px;
          padding: 8px 8px 8px 16px;
          transition: all 0.2s ease;
        }

        .input-wrapper:focus-within {
          background: white;
          box-shadow: 0 0 0 2px var(--primary-color);
        }

        .chat-textarea {
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          font-size: 14px;
          font-family: inherit;
          line-height: 1.5;
          max-height: 120px;
          outline: none;
        }

        .chat-textarea::placeholder {
          color: var(--text-secondary);
        }

        .chat-textarea:disabled {
          opacity: 0.6;
        }

        .send-button {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: var(--primary-color);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .send-button:hover:not(:disabled) {
          background: var(--primary-dark);
          transform: scale(1.05);
        }

        .send-button:disabled {
          background: #e0e0e0;
          color: #9e9e9e;
          cursor: not-allowed;
        }

        .history-button {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .history-button:hover {
          background: rgba(0, 0, 0, 0.05);
          color: var(--primary-color);
        }

        .input-hint {
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 8px;
          text-align: center;
        }
      `}</style>
    </form>
  );
}

export default ChatInput;
