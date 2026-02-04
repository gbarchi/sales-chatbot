import React, { useState, useEffect } from 'react';
import Layout from './components/common/Layout';
import ChatPanel from './components/chat/ChatPanel';
import LoginPage from './components/auth/LoginPage';
import AdminPanel from './components/admin/AdminPanel';
import { useAuth } from './context/AuthContext';
import { fetchSuggestions, fetchMetadata } from './services/api';

function App() {
  const { isAuthenticated, loading: authLoading, user, logout } = useAuth();
  const [messages, setMessages] = useState([]);
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
    } else if (response.type === 'multi') {
      // Handle multiple query results
      botMessage.content = `Encontré ${response.results.length} resultados para tu consulta.`;
      botMessage.results = response.results;
      botMessage.isMulti = true;
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
  };

  const handleSuggestionClick = (suggestion) => {
    // Trigger the chat input with the suggestion
    const event = new CustomEvent('suggestionSelected', { detail: suggestion });
    window.dispatchEvent(event);
  };

  return (
    <Layout user={user} onLogout={logout} onAdminClick={() => setShowAdminPanel(true)}>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      <div className="app-container">
        <ChatPanel
          messages={messages}
          suggestions={suggestions}
          onNewMessage={handleNewMessage}
          onBotResponse={handleBotResponse}
          onSuggestionClick={handleSuggestionClick}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          dateRange={metadata?.dateRange}
        />
      </div>
      <style>{`
        .app-container {
          height: calc(100vh - 60px);
          display: flex;
          justify-content: center;
          background: var(--background-color);
        }
      `}</style>
    </Layout>
  );
}

export default App;
