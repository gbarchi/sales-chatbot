import React, { useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import DateFilter from '../common/DateFilter';
import { sendChatMessage } from '../../services/api';

function ChatPanel({ messages, suggestions, onNewMessage, onBotResponse, onSuggestionClick, isLoading, setIsLoading, selectedMessageId, onSelectMessage, dateFilter, onDateFilterChange, dateRange }) {
  const messagesEndRef = useRef(null);

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

  const handleSendMessage = async (message) => {
    onNewMessage(message);
    setIsLoading(true);

    try {
      // Build conversation history from previous messages for context
      const conversationHistory = messages
        .filter(m => m.type === 'user' || (m.type === 'bot' && !m.isError))
        .map(m => {
          if (m.type === 'user') {
            return { role: 'user', content: m.content };
          } else {
            // For bot messages, include a summary of what was queried
            return {
              role: 'assistant',
              content: m.content,
              summary: m.explanation || m.content
            };
          }
        });

      const response = await sendChatMessage(message, conversationHistory, dateFilter);
      onBotResponse(response);
    } catch (error) {
      onBotResponse({
        type: 'error',
        message: 'Error de conexión con el servidor',
        suggestion: 'Verifica que el servidor esté ejecutándose en el puerto 3001'
      });
    } finally {
      setIsLoading(false);
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
            isSelected={message.id === selectedMessageId}
            onSelect={onSelectMessage}
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
      <ChatInput onSend={handleSendMessage} disabled={isLoading} />

      <style>{`
        .chat-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
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
          display: flex;
          flex-direction: column;
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
          transform: translateX(4px);
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
      `}</style>
    </div>
  );
}

export default ChatPanel;
