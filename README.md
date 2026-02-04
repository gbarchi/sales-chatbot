# Maviju Salesbot

A web-based chatbot powered by Claude AI that allows sales managers, representatives, and supervisors to analyze sales data using natural language queries and dynamic visualizations.

## Features

- **Natural Language Queries**: Ask any question about your sales data in Spanish - Claude AI understands and generates the appropriate SQL
- **Conversation Memory**: Follow-up questions understand context from previous messages
- **Dynamic Visualizations**: Automatic chart selection based on query type (bar, line, pie, area, table)
- **Fast Analytics**: DuckDB-powered backend handles ~2M rows efficiently
- **Claude AI Integration**: All queries are processed by Claude for intelligent SQL generation

## Architecture

```
┌─────────────────────────────────────────┐
│           React Frontend                │
│  ChatPanel │ ChartContainer │ Filters   │
└─────────────────┬───────────────────────┘
                  │ HTTP/REST
┌─────────────────┴───────────────────────┐
│           Node.js Backend               │
│  Express API │ Claude AI │ DuckDB       │
└─────────────────────────────────────────┘
```

## Quick Start with Docker (Recommended)

### 1. Configure Environment

```bash
cd sales-chatbot
cp .env.docker .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
```

### 2. Place your CSV data file

Ensure your sales CSV file is in the parent directory:
```
sales-chatbot/
  └── docker-compose.yml
../MAVIJU_DASHBOARD_VENTAS_ANL_VTA_2 0.csv
```

### 3. Build and Run

```bash
docker-compose up --build
```

The app will be available at:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001

### 4. Stop the Application

```bash
docker-compose down
```

## Manual Installation (Development)

### 1. Install Dependencies

```bash
# Install server dependencies
cd sales-chatbot/server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Environment

Create a `.env` file in the `server` directory:

```bash
cd server
cp ../.env.example .env
```

Add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### 3. Start the Backend

```bash
cd sales-chatbot/server
npm start
```

### 4. Start the Frontend

In a new terminal:

```bash
cd sales-chatbot/client
npm start
```

The React app will open at http://localhost:3000

## Example Queries

You can ask anything about your sales data. The chatbot remembers context:

**First query:**
- "Muéstrame las ventas de Ronny en 2024"

**Follow-up queries (understands context):**
- "Ahora muéstrame las de 2023"
- "¿Y por mes?"
- "¿Cuál fue su mejor cliente?"

**Other examples:**
- "¿Cuáles fueron las ventas totales del último año?"
- "Top 10 vendedores por ventas"
- "¿Qué categorías tienen mejor margen?"
- "Compara las ventas por provincia"
- "Clientes que compraron en 2024 pero no en 2025"

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Process natural language query via Claude |
| `/api/metadata` | GET | Get schema and available filter options |
| `/api/suggestions` | GET | Get example queries |
| `/api/health` | GET | Health check |

## Data Schema

The dataset includes these columns:

| Column | Type | Description |
|--------|------|-------------|
| Fecha | DATE | Transaction date |
| NumSem | INTEGER | Week number |
| CardCode | STRING | Customer code |
| Cardname | STRING | Customer name |
| Categoria_SN | STRING | Business partner category |
| SubCategoria_SN | STRING | Business partner subcategory |
| NombreVendedor | STRING | Salesperson name |
| NombreSupervisor | STRING | Supervisor name |
| ItmsgrpName | STRING | Product group |
| SubFamiliaName | STRING | Product subfamily/brand |
| Categoria | STRING | Product category |
| SubCategoria | STRING | Product subcategory |
| ItemCode | STRING | Item code |
| Dscription | STRING | Item description |
| Quantity | DOUBLE | Quantity sold |
| DiscPrcnt | DOUBLE | Discount percentage |
| Price | DOUBLE | Unit price |
| LineTotal | DOUBLE | Line total (sales) |
| LineCost | DOUBLE | Line cost |
| Margen | DOUBLE | Profit margin (%) |
| DocNum | STRING | Document number |
| ProvinciaPrincipal | STRING | Customer province |
| CiudadPrincipal | STRING | Customer city |
| DocumentoTipo | STRING | Document type |
| Remate | STRING | Clearance indicator |
| MaviOferta | STRING | Mavi offer type |
| Feria | STRING | Fair indicator |
| Web | STRING | Web channel |
| DescGlobal | DOUBLE | Global discount |

## Technology Stack

- **Frontend**: React 18, Recharts, Nginx
- **Backend**: Node.js, Express, DuckDB
- **AI**: Anthropic Claude API
- **Containerization**: Docker, Docker Compose
