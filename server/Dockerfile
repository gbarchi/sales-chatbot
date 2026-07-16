# Server Dockerfile
FROM node:20-slim

WORKDIR /app

# Build deps for native modules (better-sqlite3, duckdb) — used only if no
# prebuilt binary is available for the target platform.
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Data dirs: /app/data holds the bind-mounted CSV; /app/dbdata is the
# persistent SQLite volume mountpoint.
RUN mkdir -p /app/data /app/dbdata

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "index.js"]
