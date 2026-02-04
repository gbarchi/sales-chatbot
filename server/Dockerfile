# Server Dockerfile
FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "index.js"]
