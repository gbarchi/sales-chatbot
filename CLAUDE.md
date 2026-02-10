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
Frontend → Renders chart (Recharts/Nivo) + analysis
```

### Critical Services

**`server/services/llmService.js`**
- `getSystemPrompt()`: The 300+ line prompt that teaches Claude the database schema, SQL rules, chart selection logic, and comparison/projection patterns
- `processQuery()`: Sends user query + conversation history + date filter context to Claude, parses JSON response
- `analyzeResults()`: Sends SQL results back to Claude for business insights

**Key prompt sections**:
- Date filter exceptions for comparative queries (lines 20-29)
- Comparative queries: temporal (line chart) vs dimensional (grouped bar) (lines 144-215)
- Projections: simplified to avoid DuckDB window function errors (lines 217-235)
- Conversational responses: allows Claude to answer follow-ups without SQL (lines 242-254)

**`server/services/dataService.js`**
- `initialize()`: Loads CSV into DuckDB in-memory on startup (takes ~8 seconds)
- `getMetadata()`: Returns schema, vendedores, supervisores, categorias, provincias for LLM context
- Column definitions with Spanish descriptions for LLM understanding

**`client/src/components/charts/ChartContainer.jsx`**
- Auto-upgrades chart types based on data shape (e.g., "por X y Y" → heatmap)
- Handles 9 chart types: bar, line, pie, area, scatter, combo, heatmap, comparison, grouped-bar
- `comparison` type: multi-line chart for temporal comparisons (month-by-month)
- `grouped-bar`: side-by-side bars for dimensional comparisons (by vendor, province)
- Heatmap uses `@nivo/heatmap` (not custom SVG) after persistent label rendering issues

### Authentication & Security

- JWT tokens stored in HttpOnly cookies (not localStorage)
- Session timeout: 10 minutes of inactivity (tracked in `AuthContext.jsx`)
- Rate limiting: 30 req/min for `/api/chat`, 120 req/min for other routes (lines 36-60 in `server/index.js`)
- User roles: admin, user, vendedor (filters applied automatically by `userService`)

### State Management

**Backend**:
- DuckDB connection is global singleton in `dataService.js`
- SQLite for users/history in `userService.js`
- No Redis/session store — auth tokens are stateless JWT

**Frontend**:
- `AuthContext`: user, token verification, session timeout
- `App.jsx`: messages array, suggestions, metadata, dateFilter
- No Redux — lifting state is sufficient

## Key Learnings (Auto Memory)

**Heatmap**:
- Custom SVG heatmap had unfixable issues with label positioning and number formatting
- Replaced with `@nivo/heatmap` (lines 693-823 in ChartContainer.jsx)
- DuckDB returns COUNT as floats — always use `Math.round()` for display, never rely on `Number.isInteger()` or `% 1 === 0`
- Heatmap SQL must use `LIMIT 500` (not 100) and NO `HAVING` filters to avoid truncation

**LLM Configuration**:
- Model: `claude-haiku-4-5-20251001` (set in `server/.env` as `ANTHROPIC_MODEL`)
- System prompt is in `llmService.js` → `getSystemPrompt()` (~300 lines)
- For comparisons, date filter is **ignored** to allow multi-year queries
- Projections use simple CTEs — avoid window functions inside aggregates (DuckDB binder error)

**Server Stability**:
- Use `res.on('close')` (not `req.on('close')`) to detect client disconnect — Node 18+ behavior changed
- Check `!res.writableFinished` before setting `clientDisconnected = true`
- Always kill all processes on ports 3000/3001 before restarting — stale processes serve old code

## Common Patterns

### Adding a New Chart Type

1. Update `llmService.js` system prompt with SQL example and `chartType` value
2. Add case in `ChartContainer.jsx` `renderChart()` switch statement
3. Test with sample query that triggers the new type

### Modifying Date Filters

Date filter logic is in:
- Frontend: `DateFilter.jsx` (UI) → passed to `/api/chat`
- Backend: `llmService.js` lines 20-29 (injected into system prompt)
- Exception: Comparisons ignore date filter to allow multi-year queries

### Handling DuckDB Errors

- Check SQL in Claude's response JSON — often caused by system prompt issues
- DuckDB doesn't support window functions inside aggregates (`AVG(LAG(...))` fails)
- Use simple CTEs with direct calculations instead

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

Use these to verify functionality:

**Temporal Comparison** (should use line chart):
```
"comparar ventas mes a mes 2024 vs 2025"
```

**Dimensional Comparison** (should use grouped bar):
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
"ventas por categoria y mes"
```
