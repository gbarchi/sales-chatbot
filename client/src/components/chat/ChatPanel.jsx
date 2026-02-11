import React, { useRef, useEffect, useCallback, useState } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import QueryHistoryModal from './QueryHistoryModal';
import DateFilter from '../common/DateFilter';
import { sendChatMessage } from '../../services/api';

function ChatPanel({ messages, suggestions, onNewMessage, onBotResponse, onSuggestionClick, isLoading, setIsLoading, dateFilter, onDateFilterChange, dateRange }) {
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [showHistory, setShowHistory] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for drill-down events from chart clicks
  useEffect(() => {
    const handleDrillDown = (event) => {
      if (!isLoading) {
        handleSendMessage(event.detail);
      }
    };

    window.addEventListener('drillDownQuery', handleDrillDown);
    return () => window.removeEventListener('drillDownQuery', handleDrillDown);
  }, [isLoading, messages]); // Include messages for conversation history

  const handleCancelQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [setIsLoading]);

  const handleClarificationSelect = useCallback((selectedName, searchTerm, originalQuery) => {
    const regex = new RegExp(searchTerm, 'gi');
    const clarifiedQuery = originalQuery.replace(regex, selectedName);
    handleSendMessage(clarifiedQuery);
  }, []);

  const handleSendMessage = async (message) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    onNewMessage(message);
    setIsLoading(true);

    try {
      // Build conversation history from previous messages for context
      // CRITICAL: Skip user messages that resulted in errors to prevent contaminating the LLM's context
      // If a user asked about margins and got an error, that query shouldn't influence future queries
      const conversationHistory = [];
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.type === 'user') {
          // Look ahead for this user's bot response
          const nextBot = messages.slice(i + 1).find(m => m.type === 'bot');
          // Only include user message if the bot response was NOT an error
          if (nextBot && !nextBot.isError) {
            conversationHistory.push({ role: 'user', content: msg.content });
          }
          // If nextBot is an error or doesn't exist, skip this user message entirely
        } else if (msg.type === 'bot' && !msg.isError) {
          // For bot messages, include a summary of what was queried
          conversationHistory.push({
            role: 'assistant',
            content: msg.content,
            summary: msg.explanation || msg.content
          });
        }
      }

      const response = await sendChatMessage(message, conversationHistory, dateFilter, abortControllerRef.current.signal);

      // Detect explicit chart type requests in the user's message
      // and inject userExplicitRequest flag if LLM missed it
      if (response && response.chartConfig && !response.chartConfig.userExplicitRequest) {
        const msgLower = message.toLowerCase();
        const explicitTablePhrases = ['en una tabla', 'en tabla', 'como tabla', 'formato tabla', 'quiero tabla', 'quiero una tabla', 'muéstrame en tabla', 'muéstrame como tabla', 'dame una tabla', 'en formato de tabla', 'tabla detallada', 'en formato tabla', 'detalle', 'detalle por', 'listado', 'listado de', 'a que clientes', 'a que productos', 'a que provincias', 'por cada cliente', 'para cada cliente', 'de cada cliente', 'cuales son los clientes', 'lista de clientes', 'quiénes son los clientes', 'quienes son los clientes'];
        const explicitBarPhrases = ['en barras', 'en un gráfico de barras', 'gráfico de barras', 'como barras', 'en forma de barras'];
        const explicitLinePhrases = ['en líneas', 'en un gráfico de líneas', 'gráfico de líneas', 'como líneas'];
        const explicitPiePhrases = ['en pie', 'pie chart', 'gráfico circular', 'gráfico de pastel', 'como pastel'];

        if (explicitTablePhrases.some(p => msgLower.includes(p))) {
          response.chartConfig.userExplicitRequest = true;
          response.chartType = 'table';
        } else if (explicitBarPhrases.some(p => msgLower.includes(p))) {
          response.chartConfig.userExplicitRequest = true;
          response.chartType = 'bar';
        } else if (explicitLinePhrases.some(p => msgLower.includes(p))) {
          response.chartConfig.userExplicitRequest = true;
          response.chartType = 'line';
        } else if (explicitPiePhrases.some(p => msgLower.includes(p))) {
          response.chartConfig.userExplicitRequest = true;
          response.chartType = 'pie';
        }
      }

      onBotResponse(response);
    } catch (error) {
      // Don't show error if request was cancelled by user
      if (error.name === 'AbortError') {
        onBotResponse({
          type: 'error',
          message: 'Consulta cancelada',
          suggestion: 'Puedes realizar una nueva consulta'
        });
      } else {
        onBotResponse({
          type: 'error',
          message: 'Error de conexión con el servidor',
          suggestion: 'Verifica que el servidor esté ejecutándose en el puerto 3001'
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const showSuggestions = messages.length <= 1 && suggestions.length > 0;

  return (
    <div className="chat-panel">
      <div className="messages-container">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onClarificationSelect={handleClarificationSelect}
          />
        ))}

        {isLoading && (
          <div className="loading-message">
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="loading-text">Analizando datos...</span>
            <button className="cancel-button" onClick={handleCancelQuery} title="Cancelar consulta">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Detener
            </button>
          </div>
        )}

        {showSuggestions && (
          <div className="suggestions-section">
            <h4>Consultas sugeridas:</h4>
            <div className="suggestions-grid">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="suggestion-button"
                  onClick={() => handleSendMessage(suggestion.text)}
                >
                  <span className="suggestion-category">{suggestion.category}</span>
                  <span className="suggestion-text">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <DateFilter
        dateRange={dateRange}
        activeFilter={dateFilter}
        onFilterChange={onDateFilterChange}
      />
      <ChatInput
        onSend={handleSendMessage}
        disabled={isLoading}
        onHistoryClick={() => setShowHistory(true)}
      />

      <QueryHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectQuery={handleSendMessage}
      />

      <style>{`
        .chat-panel {
          width: 100%;
          max-width: 900px;
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--card-background);
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .loading-message {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #f8f9fa;
          border-radius: 12px;
          color: var(--text-secondary);
        }

        .loading-dots {
          display: flex;
          gap: 4px;
        }

        .loading-dots span {
          width: 8px;
          height: 8px;
          background: var(--primary-color);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
        .loading-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .loading-text {
          font-size: 14px;
          flex: 1;
        }

        .cancel-button {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border: 1px solid #dc2626;
          background: white;
          color: #dc2626;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-button:hover {
          background: #dc2626;
          color: white;
        }

        .suggestions-section {
          margin-top: 8px;
        }

        .suggestions-section h4 {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 12px;
          font-weight: 500;
        }

        .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .suggestion-button {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 12px 16px;
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .suggestion-button:hover {
          border-color: var(--primary-color);
          background: #f8faff;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .suggestion-category {
          font-size: 11px;
          color: var(--primary-color);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .suggestion-text {
          font-size: 14px;
          color: var(--text-primary);
        }

        @media (max-width: 768px) {
          .chat-panel {
            max-width: 100%;
          }

          .messages-container {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}

export default ChatPanel;
