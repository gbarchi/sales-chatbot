import React, { useState, useEffect } from 'react';
import Layout from './components/common/Layout';
import ChatPanel from './components/chat/ChatPanel';
import ChartContainer from './components/charts/ChartContainer';
import LoginPage from './components/auth/LoginPage';
import AdminPanel from './components/admin/AdminPanel';
import { useAuth } from './context/AuthContext';
import { fetchSuggestions, fetchMetadata } from './services/api';

function App() {
  const { isAuthenticated, loading: authLoading, user, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState({ id: 'all', label: 'Todo', range: null });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // useEffect must be before any conditional returns (React hooks rules)
  useEffect(() => {
    // Only load data when authenticated
    if (!isAuthenticated) return;

    const loadInitialData = async () => {
      try {
        const [suggestionsData, metadataData] = await Promise.all([
          fetchSuggestions(),
          fetchMetadata()
        ]);
        setSuggestions(suggestionsData.queries || []);
        setMetadata(metadataData);

        // Add welcome message
        setMessages([{
          id: 1,
          type: 'bot',
          content: `¡Hola! Soy tu asistente de análisis de ventas. Tengo acceso a ${metadataData.rowCount?.toLocaleString() || 'millones de'} registros de ventas desde ${metadataData.dateRange?.min || '2021'} hasta ${metadataData.dateRange?.max || '2024'}.\n\n¿En qué puedo ayudarte? Puedes preguntarme cosas como:\n• "Muéstrame las ventas por mes"\n• "¿Quiénes son los top 10 vendedores?"\n• "Ventas por categoría de producto"`,
          timestamp: new Date()
        }]);
      } catch (error) {
        console.error('Error loading initial data:', error);
        setMessages([{
          id: 1,
          type: 'bot',
          content: 'Error conectando con el servidor. Por favor, asegúrate de que el servidor esté ejecutándose.',
          timestamp: new Date(),
          isError: true
        }]);
      }
    };

    loadInitialData();
  }, [isAuthenticated]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f5f7fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner"></div>
          <p style={{ marginTop: 16, color: '#666' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleNewMessage = (userMessage) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);
  };

  const handleBotResponse = (response) => {
    const botMessage = {
      id: Date.now(),
      type: 'bot',
      timestamp: new Date()
    };

    if (response.type === 'error') {
      botMessage.content = response.message;
      botMessage.suggestion = response.suggestion;
      botMessage.isError = true;
    } else {
      botMessage.content = response.explanation;
      botMessage.data = response.data;
      botMessage.chartType = response.chartType;
      botMessage.chartConfig = response.chartConfig;
      botMessage.sql = response.sql;
      botMessage.rowCount = response.rowCount;
      botMessage.analysis = response.analysis;
    }

    setMessages(prev => [...prev, botMessage]);

    // Auto-select the new message to display its chart
    if (!response.type || response.type !== 'error') {
      setSelectedMessageId(botMessage.id);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    // Trigger the chat input with the suggestion
    const event = new CustomEvent('suggestionSelected', { detail: suggestion });
    window.dispatchEvent(event);
  };

  const handleSelectMessage = (messageId) => {
    setSelectedMessageId(messageId);
  };

  const handleDrillDown = (dimension, value) => {
    // Generate a natural language query for the drill-down
    const drillQuery = `Muéstrame el detalle de ventas de ${value}`;

    // Dispatch custom event to trigger the chat to send this message
    const event = new CustomEvent('drillDownQuery', { detail: drillQuery });
    window.dispatchEvent(event);
  };

  // Get chart data from selected message
  const selectedMessage = messages.find(m => m.id === selectedMessageId);
  const currentChart = selectedMessage?.data ? {
    data: selectedMessage.data,
    chartType: selectedMessage.chartType,
    chartConfig: selectedMessage.chartConfig
  } : null;

  return (
    <Layout user={user} onLogout={logout} onAdminClick={() => setShowAdminPanel(true)}>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      <div className="app-container">
        <div className="chat-section">
          <ChatPanel
            messages={messages}
            suggestions={suggestions}
            onNewMessage={handleNewMessage}
            onBotResponse={handleBotResponse}
            onSuggestionClick={handleSuggestionClick}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            selectedMessageId={selectedMessageId}
            onSelectMessage={handleSelectMessage}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            dateRange={metadata?.dateRange}
          />
        </div>
        <div className="chart-section">
          <ChartContainer
            data={currentChart?.data}
            chartType={currentChart?.chartType}
            chartConfig={currentChart?.chartConfig}
            onDrillDown={handleDrillDown}
          />
        </div>
      </div>
      <style>{`
        .app-container {
          display: grid;
          grid-template-columns: 450px 1fr;
          height: calc(100vh - 60px);
          gap: 0;
        }

        .chat-section {
          background: var(--card-background);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chart-section {
          background: var(--background-color);
          padding: 20px;
          overflow: auto;
        }

        @media (max-width: 1024px) {
          .app-container {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }

          .chat-section {
            border-right: none;
            border-bottom: 1px solid var(--border-color);
          }
        }
      `}</style>
    </Layout>
  );
}

export default App;
