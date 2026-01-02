const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

// Database and models
const { initializeDB } = require('./models/database');

// Routes
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const characterRoutes = require('./routes/characters');
const monsterRoutes = require('./routes/monsters');
const monsterInstanceRoutes = require('./routes/monsterInstances');
const armyRoutes = require('./routes/armies');

// Configuration
const { corsOptions } = require('./config/cors');
const { helmetConfig } = require('./config/security');
const { limiter } = require('./config/rateLimit');
const { socketConfig } = require('./config/socket');

// Utilities
const { loadSSLCertificates } = require('./utils/ssl');

// Socket handlers
const { initializeSocketHandlers } = require('./socket');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmetConfig);
app.use(limiter);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Fallback CORS middleware
app.use((req, res, next) => {
  if (!res.get('Access-Control-Allow-Origin')) {
    res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-token, Accept, Origin, X-Requested-With');
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    origin: req.headers.origin,
    referer: req.headers.referer
  });
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/monsters', monsterRoutes);
app.use('/api/monster-instances', monsterInstanceRoutes);
app.use('/api/armies', armyRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// Start server function
const startServer = async () => {
  try {
    // Initialize database
    await initializeDB();
    
    // Create server (HTTPS in production, HTTP in development)
    let server;
    if (process.env.NODE_ENV === 'production') {
      const credentials = loadSSLCertificates();
      server = https.createServer(credentials, app);
      console.log(`🚀 HTTPS Server running on port ${PORT}`);
      console.log(`🔒 SSL certificates loaded successfully`);
    } else {
      server = http.createServer(app);
      console.log(`🚀 HTTP Server running on port ${PORT}`);
      console.log('⚠️  Running in development mode with HTTP server');
    }
    
    // Initialize Socket.IO
    const io = new Server(server, socketConfig);

    // Server-side state management
    const battleMovementState = {}; // { campaignId: { characterId: remainingMovement } }
    const battleCombatState = {}; // { campaignId: { combatants, initiativeOrder, currentTurnIndex } }
    const userSocketMap = new Map(); // Map user IDs to socket IDs

    // Initialize socket event handlers
    initializeSocketHandlers(io, battleMovementState, battleCombatState, userSocketMap);

    // Make io and userSocketMap available to routes
    app.set('io', io);
    app.set('userSocketMap', userSocketMap);
    
    // Start listening
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
      console.log(`🔌 WebSocket server initialized`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
console.log('🚀 Starting D&D Campaign Manager Server...');
startServer();
