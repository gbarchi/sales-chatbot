import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { handleChat, getMetadata, getSuggestedQueries } from './controllers/chatController.js';
import { getHistory, deleteHistory, clearHistory } from './controllers/historyController.js';
import {
  login, verifyToken, logout,
  getUsers, createUser, updateUser, updatePassword, deleteUser,
  getAvailableVendors, getAvailableSupervisors
} from './controllers/authController.js';
import { authenticateToken, getAuthStatus } from './middleware/authMiddleware.js';
import dataService from './services/dataService.js';
import llmService from './services/llmService.js';
import { userService } from './services/userService.js';

dotenv.config();

// Handle BigInt serialization for JSON
BigInt.prototype.toJSON = function() {
  return Number(this);
};

const app = express();
const PORT = process.env.PORT || 3001;

// SECURITY: Configure CORS with specific origin and credentials for HttpOnly cookies
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// Rate limiting (simple implementation)
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, start: now });
  } else {
    const data = rateLimit.get(ip);
    if (now - data.start > RATE_LIMIT_WINDOW) {
      rateLimit.set(ip, { count: 1, start: now });
    } else {
      data.count++;
      if (data.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests' });
      }
    }
  }
  next();
});

// Auth routes (public)
app.post('/api/auth/login', login);
app.post('/api/auth/verify', verifyToken);
app.post('/api/auth/logout', logout);
app.get('/api/auth/status', getAuthStatus);

// Admin routes (require admin role)
app.get('/api/admin/users', authenticateToken, getUsers);
app.post('/api/admin/users', authenticateToken, createUser);
app.put('/api/admin/users/:id', authenticateToken, updateUser);
app.put('/api/admin/users/:id/password', authenticateToken, updatePassword);
app.delete('/api/admin/users/:id', authenticateToken, deleteUser);
app.get('/api/admin/vendors', authenticateToken, getAvailableVendors);
app.get('/api/admin/supervisors', authenticateToken, getAvailableSupervisors);

// Protected routes (require authentication if enabled)
app.post('/api/chat', authenticateToken, handleChat);
app.get('/api/metadata', authenticateToken, getMetadata);
app.get('/api/suggestions', authenticateToken, getSuggestedQueries);

// Query history routes
app.get('/api/history', authenticateToken, getHistory);
app.delete('/api/history/:id', authenticateToken, deleteHistory);
app.delete('/api/history', authenticateToken, clearHistory);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', initialized: dataService.initialized });
});

// Initialize and start server
async function start() {
  console.log('Starting Sales Chatbot Server...');

  try {
    // Initialize user service (SQLite database)
    userService.initialize();
    console.log('User Service initialized');

    // Initialize LLM service
    llmService.initialize();
    console.log('LLM Service initialized');

    // Initialize data service (load CSV)
    console.log('Loading data... (this may take a moment for ~2M rows)');
    await dataService.initialize();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Ready to receive queries!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
