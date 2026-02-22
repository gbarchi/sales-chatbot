# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maviju Salesbot is a Spanish-language sales analytics chatbot powered by Claude AI (Haiku 4.5) that converts natural language questions into SQL queries, executes them on a 2M-row sales dataset using DuckDB, and renders interactive charts.

**Key constraint**: The CSV data file (`MAVIJU_DASHBOARD_VENTAS_ANL_VTA_2 0.csv`, 857MB) lives in the parent directory (`/Users/gbarchi/Claude/Sales Chatbot/`) and is loaded into DuckDB on server startup.

## Development Commands

### Starting the Application

**Backend** (must start first to load CSV into DuckDB):
```bash
cd server
npm start
# Server runs on http://localhost:3001
```

**Frontend**:
```bash
cd client
npm start
# React dev server runs on http://localhost:3000
```

**Kill stale processes** (critical after code changes that don't hot-reload):
```bash
lsof -ti :3000 | xargs kill -9  # Frontend
lsof -ti :3001 | xargs kill -9  # Backend
```

### Docker Deployment

```bash
docker-compose up --build
# Frontend: http://localhost
# Backend: http://localhost:3001
```

## Architecture

### Three-Tier Flow

```
User Query (Spanish)
    ↓
Frontend (React) → /api/chat
    ↓
LLM Service (Claude Haiku) → Generates JSON: {sql, chartType, chartConfig}
    ↓
Data Service (DuckDB) → Executes SQL on 2M rows
    ↓
LLM Service → Analyzes results, generates insights
    ↓
Frontend → Renders chart (Recharts/Nivo/Leaflet) + analysis
```

### Critical Services

**`server/services/llmService.js`**
- `getSystemPrompt()`: ~600-line prompt teaching Claude the schema, SQL rules, chart types, comparison/projection patterns, and special chart types (map, plan, churn, mba)
- `processQuery()`: Sends user query + conversation history + date filter context to Claude, parses JSON response
- `analyzeResults()`: Sends SQL results back to Claude for business insights; has special branches for churn and visit-plan results

**Key prompt sections**:
- Date filter context + exceptions for comparative queries
- Role-based security filter (injected for vendedor/supervisor roles)
- Schema columns (margin columns hidden when `canViewMargin === false`)
- Metadata: vendedores, supervisores, familias, categorias, subfamilias, subcategorias, ciudades
- Special chart types: `map`, `plan`, `churn`, `multi-line`, `grouped-bar`, `comparison`, `heatmap`
- Comparative queries: temporal (line chart) vs dimensional (grouped-bar)
- Projections: simple CTEs (avoid window functions inside aggregates — DuckDB binder error)
- Conversational responses (no SQL)

**`server/services/dataService.js`**
- `initialize()`: Loads CSV into DuckDB in-memory on startup (~8 seconds)
- `getMetadata()`: Returns schema + vendedores, supervisores, categorias, provincias, subfamilias, subcategorias, ciudades for LLM context
- CreditLine < $20 treated as 0 (CASE WHEN in SQL to suppress false alerts)

**`server/services/userService.js`**
- SQLite for users, sessions, query history, saved queries (Favoritos)
- Tables: `users`, `query_history`, `saved_queries`
- `getSavedQueries()`, `saveQuery()`, `deleteSavedQuery()`, `renameSavedQuery()`

**`server/controllers/favoritesController.js`** (new)
- 4 handlers: `getFavorites`, `saveFavorite`, `deleteFavorite`, `renameFavorite`
- Routes in `server/index.js`: GET/POST/DELETE/PATCH `/api/favorites`

**`client/src/components/charts/ChartContainer.jsx`**
- Handles 12 chart types: bar, line, pie, area, scatter, combo, heatmap, comparison, grouped-bar, multi-line, map, plan, churn, table
- `comparison` type: multi-line chart for temporal comparisons (month-by-month)
- `grouped-bar`: side-by-side bars for dimensional comparisons (by vendor, province)
- `map` type: Leaflet MapContainer with CircleMarkers, popups, route mode, client type badges, credit alerts, purchase prediction
- `plan` type: visit agenda cards sorted by priority
- `churn` type: at-risk client cards with risk factor badge
- Heatmap uses `@nivo/heatmap` (not custom SVG)

**`client/src/components/charts/DataTable.jsx`**
- `humanizeCol()`: maps raw column names (e.g., `Cupo_Credito`) to readable Spanish labels

**`client/src/components/chat/`**
- `ChatPanel.jsx`: orchestrates messages, favorites state, history modal, date filter
- `ChatMessage.jsx`: renders bot messages with ⭐ save-to-favorites button (only when `userQuery` exists)
- `ChatInput.jsx`: input bar with ⭐ Favoritos and 🕐 History buttons
- `FavoritesModal.jsx`: list saved queries with run/rename/delete
- `HelpModal.jsx`: 5-tab user guide (Gráficos, Mapa, Análisis, Filtros, Consejos)
- `QueryHistoryModal.jsx`: persisted query history grouped by date

**`client/src/components/common/Layout.jsx`**
- Header with ? (HelpModal), admin users, admin logs, and logout buttons

### Authentication & Security

- JWT tokens stored in HttpOnly cookies (not localStorage)
- Session timeout: 10 minutes of inactivity (tracked in `AuthContext.jsx`)
- Rate limiting: 30 req/min for `/api/chat`, 120 req/min for other routes
- User roles: admin, user, vendedor (role filter injected automatically by `userService`)
- Margin restriction: 4-layer protection — pre-check keywords → hide schema columns → hide prompt examples → clean history

### State Management

**Backend**:
- DuckDB connection is global singleton in `dataService.js`
- SQLite for users/history/favorites in `userService.js`
- No Redis/session store — auth tokens are stateless JWT

**Frontend**:
- `AuthContext`: user, token verification, session timeout
- `App.jsx`: messages, suggestions, metadata, dateFilter, favorites, showHelp
- No Redux — lifting state is sufficient

## Key Learnings

**Heatmap**:
- Custom SVG heatmap had unfixable issues → replaced with `@nivo/heatmap`
- DuckDB returns COUNT as floats — always use `Math.round()`, never `Number.isInteger()`
- Heatmap SQL must use `LIMIT 500` (not 100) and NO `HAVING` filters

**Map**:
- Jitter key precision: use `toFixed(4)` (~11m grouping), NOT `toFixed(5)` (1m — too fine, misses near-duplicates)
- Credit ring: outer `CircleMarker` with `fillOpacity: 0` renders a colored ring border
- Client types: prospecto (no sales), perdido (>180d inactive), activo
- `DiasHastaCompra` = `FrecuenciaDias - DiasSinComprar` — negative means overdue

**Entity Resolution**:
- `server/services/entityResolver.js`: normalizes + resolves partial names to exact DB values
- Person names (NombreVendedor, NombreSupervisor): matched word-by-word, not full substring
- Other dimensions: full substring match with ILIKE

**LLM Configuration**:
- Model: `claude-haiku-4-5-20251001` (set in `server/.env` as `ANTHROPIC_MODEL`)
- System prompt: `llmService.js` → `getSystemPrompt()`
- For comparisons, date filter is **ignored** to allow multi-year queries
- Currency: always $ (dólares) — explicit rule in both `getSystemPrompt` and `analyzeResults`
- Accents matter in DuckDB: `ILIKE '%iluminacion%'` does NOT match `'Iluminación'`

**Server Stability**:
- Use `res.on('close')` (not `req.on('close')`) to detect client disconnect — Node 18+ behavior
- Always kill all processes on ports 3000/3001 before restarting — stale processes serve old code

## Common Patterns

### Adding a New Chart Type

1. Update `llmService.js` system prompt with keywords, SQL example, `chartType`, and `chartConfig` format
2. Add `case 'newtype':` in `ChartContainer.jsx` `renderChart()` switch statement
3. If the new type needs special analysis, add a branch in `analyzeResults()`
4. Test with a sample query that triggers the new type

### Modifying Date Filters

Date filter logic is in:
- Frontend: `DateFilter.jsx` (UI) → passed to `/api/chat`
- Backend: `llmService.js` (injected into system prompt as `dateFilterContext`)
- Exception: Comparisons and churn/plan queries ignore the date filter

### Handling DuckDB Errors

- Check SQL in Claude's response JSON — often caused by system prompt issues
- DuckDB doesn't support window functions inside aggregates (`AVG(LAG(...))` fails)
- Use simple CTEs with direct calculations instead
- COUNT values returned as floats — use `Math.round()` for display

### Authentication Flow

1. `POST /api/auth/login` → returns JWT in HttpOnly cookie
2. `authenticateToken` middleware validates cookie on protected routes
3. Session timeout tracked client-side in `AuthContext.jsx` (10min inactivity)
4. `POST /api/auth/logout` clears cookie

## File Locations

- **CSV Data**: `/Users/gbarchi/Claude/Sales Chatbot/MAVIJU_DASHBOARD_VENTAS_ANL_VTA_2 0.csv`
- **Server .env**: `server/.env` (not committed, contains `ANTHROPIC_API_KEY`)
- **Auto Memory**: `~/.claude/projects/-Users-gbarchi-Claude-Sales-Chatbot/memory/MEMORY.md`

## Testing Queries

**Temporal Comparison** (should use `comparison` line chart):
```
"comparar ventas mes a mes 2024 vs 2025"
```

**Dimensional Comparison** (should use `grouped-bar`):
```
"comparar ventas por provincia entre 2024 y 2025"
```

**Projection** (should use simple CTE):
```
"proyecta las ventas de 2026 basado en 2025"
```

**Conversational** (should respond without SQL):
```
"¿por qué usaste un crecimiento del 5%?"
```

**Heatmap** (should use @nivo/heatmap):
```
"ventas por categoria y mes — mapa de calor"
```

**Map** (should use Leaflet MapContainer):
```
"mapa de clientes de Ronny"
```

**Churn** (should use churn cards):
```
"qué clientes están en riesgo de abandono"
```

**Visit Plan** (should use plan cards):
```
"plan de visitas para esta semana"
```

**Favoritos** (save a bot response):
- Hover a bot message → click ⭐ → type name → Save
- Open ⭐ button in ChatInput to manage saved queries

**HelpModal**:
- Click ? button in header → 5-tab guide appears
