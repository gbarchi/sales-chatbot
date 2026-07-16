import React, { useState, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import Layout from './components/common/Layout';
import ChatPanel from './components/chat/ChatPanel';
import LoginPage from './components/auth/LoginPage';
import AdminPanel from './components/admin/AdminPanel';
import QueryLogsPanel from './components/admin/QueryLogsPanel';
import { useAuth } from './context/AuthContext';
import { fetchSuggestions, fetchMetadata, getFavorites } from './services/api';
import HelpModal from './components/chat/HelpModal';

function App() {
  const { isAuthenticated, loading: authLoading, user, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState({ id: 'all', label: 'Todo', range: null });
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showQueryLogs, setShowQueryLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [favorites, setFavorites] = useState([]);

  // useEffect must be before any conditional returns (React hooks rules)
  useEffect(() => {
    // Only load data when authenticated
    if (!isAuthenticated) return;

    let cancelled = false;

    const loadInitialData = async (retries = 3) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (cancelled) return;

        try {
          const [suggestionsData, metadataData] = await Promise.all([
            fetchSuggestions(),
            fetchMetadata()
          ]);

          if (cancelled) return;

          setSuggestions(suggestionsData.queries || []);
          setMetadata(metadataData);

          // Set current year as default filter (or max year available in data)
          const currentYear = new Date().getFullYear();
          const dataMaxYear = metadataData.dateRange?.max
            ? new Date(metadataData.dateRange.max).getFullYear()
            : currentYear;
          const defaultYear = Math.min(currentYear, dataMaxYear);
          console.log('Setting default year filter:', defaultYear, 'current:', currentYear, 'dataMax:', dataMaxYear);

          setDateFilter({
            id: `year-${defaultYear}`,
            label: `${defaultYear}`,
            range: {
              start: new Date(defaultYear, 0, 1),
              end: new Date(defaultYear, 11, 31)
            }
          });

          // Add welcome message
          setMessages([{
            id: 1,
            type: 'bot',
            content: `¡Hola ${user?.name || 'Usuario'}! Soy tu asistente de análisis de ventas. Tengo acceso a ${metadataData.rowCount?.toLocaleString() || 'millones de'} registros de ventas desde ${metadataData.dateRange?.min?.split('T')[0] || '2021'} hasta ${metadataData.dateRange?.max?.split('T')[0] || '2024'}.`,
            timestamp: new Date()
          }]);
          return; // Success — exit retry loop
        } catch (error) {
          console.error(`Error loading initial data (attempt ${attempt + 1}/${retries + 1}):`, error);

          if (attempt < retries && !cancelled) {
            // Wait before retrying: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
          }

          if (cancelled) return;

          // All retries exhausted
          const currentYear = new Date().getFullYear();
          setDateFilter({
            id: `year-${currentYear}`,
            label: `${currentYear}`,
            range: {
              start: new Date(currentYear, 0, 1),
              end: new Date(currentYear, 11, 31)
            }
          });
          setMessages([{
            id: 1,
            type: 'bot',
            content: 'Error conectando con el servidor. Por favor, asegúrate de que el servidor esté ejecutándose.',
            timestamp: new Date(),
            isError: true
          }]);
        }
      }
    };

    loadInitialData();

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Load favorites when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    getFavorites().then(data => setFavorites(Array.isArray(data) ? data : [])).catch(() => {});
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
    } else if (response.type === 'conversational') {
      botMessage.content = response.message;
      botMessage.sql = response.sql;  // Include SQL for debugging when no data found
    } else if (response.type === 'clarification') {
      botMessage.content = response.question;
      botMessage.isClarification = true;
      botMessage.matches = response.matches;
      botMessage.searchTerm = response.searchTerm;
      botMessage.originalQuery = response.originalQuery;
    } else if (response.type === 'multi') {
      // Handle multiple query results
      botMessage.content = `Encontré ${response.results.length} resultados para tu consulta.`;
      // Build explanation from result titles/explanations so conversation history retains context
      // about which families/dimensions were queried (e.g. "ambas familias" follow-ups)
      let multiExplanation = response.results
        .filter(r => !r.error)
        .map(r => r.chartConfig?.title || r.explanation || '')
        .filter(s => s)
        .join(' | ');
      // For profile queries: append key metrics so LLM can reference real numbers in follow-ups
      const profileResult = response.results.find(r => r.chartType === 'profile');
      if (profileResult && profileResult.data && profileResult.data[0]) {
        const row = profileResult.data[0];
        const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : 'N/D';
        const fmtPct = (n) => n != null ? `${n}%` : 'N/D';
        multiExplanation += ` | Datos reales del cliente: VentaTotal=${fmt(row.VentaTotal)}, VentaReciente6M=${fmt(row.VentaReciente6M)}, CrecimientoSemestral=${fmtPct(row.CrecimientoSemestral)}, DiasSinCompra=${row.DiasSinCompra}, FrecuenciaPromDias=${row.FrecuenciaPromDias}d, TicketPromedio=${fmt(row.TicketPromedio)}, TicketReciente=${fmt(row.TicketReciente)}${row.MargenReciente6M != null ? `, MargenReciente6M=${fmtPct(row.MargenReciente6M)}` : ''}${row.MargenUltimos12M != null ? `, MargenUltimos12M=${fmtPct(row.MargenUltimos12M)}` : ''}`;
      }
      botMessage.explanation = multiExplanation;
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
      botMessage.followUps = response.followUps;
      botMessage.provenance = response.provenance;
    }

    setMessages(prev => [...prev, botMessage]);
  };

  const handleSuggestionClick = (suggestion) => {
    // Trigger the chat input with the suggestion
    const event = new CustomEvent('suggestionSelected', { detail: suggestion });
    window.dispatchEvent(event);
  };

  return (
    <Layout user={user} onLogout={logout} onAdminClick={() => setShowAdminPanel(true)} onLogsClick={() => setShowQueryLogs(true)} onHelpClick={() => setShowHelp(true)}>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      {showQueryLogs  && <QueryLogsPanel onClose={() => setShowQueryLogs(false)} />}
      {showHelp       && <HelpModal onClose={() => setShowHelp(false)} />}
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
          favorites={favorites}
          setFavorites={setFavorites}
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
