const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const { initializeDB } = require('./models/database');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const characterRoutes = require('./routes/characters');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration - Simplified and more robust for development
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'Accept', 'Origin', 'X-Requested-With'],
  preflightContinue: false
};

// Apply CORS before any routes
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Fallback CORS middleware to ensure headers are always set
app.use((req, res, next) => {
  // Only set headers if they haven't been set by the cors middleware
  if (!res.get('Access-Control-Allow-Origin')) {
    res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-token, Accept, Origin, X-Requested-With');
  }
  next();
});

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    origin: req.headers.origin,
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent']
  });
  
  // Log when responses are sent
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`${new Date().toISOString()} - Response ${res.statusCode} for ${req.method} ${req.path}`);
    originalSend.call(this, data);
  };
  
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Ensure CORS headers are always present in error responses
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-token, Accept, Origin, X-Requested-With');
  
  res.status(500).json({ error: 'Internal server error' });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit in development to avoid constant server restarts
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in development to avoid constant server restarts
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Function to start the server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDB();
    
    // Check if SSL certificates exist
    const sslCertPath = path.resolve(__dirname, process.env.SSL_CERT_PATH || '../Certs/cert.pem');
    const sslKeyPath = path.resolve(__dirname, process.env.SSL_KEY_PATH || '../Certs/key.pem');
    
    let server;
    
    if (fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath) && process.env.NODE_ENV === 'production') {
      // HTTPS server with SSL certificates (production only)
      const options = {
        cert: fs.readFileSync(sslCertPath),
        key: fs.readFileSync(sslKeyPath)
      };
      
      server = https.createServer(options, app);
      console.log(`🚀 HTTPS Server running on port ${PORT}`);
      console.log(`🔒 SSL certificates loaded successfully`);
    } else {
      // HTTP server (development)
      server = http.createServer(app);
      console.log(`🚀 HTTP Server running on port ${PORT}`);
      console.log('⚠️  Running in development mode with HTTP server');
    }
    
    // Initialize Socket.IO
    const io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'Accept', 'Origin', 'X-Requested-With']
      }
    });

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log(`👤 User connected: ${socket.id}`);
      
      // Add error handler for this socket
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
      
      // Join campaign room for real-time updates
      socket.on('joinCampaign', (campaignId) => {
        try {
          socket.join(`campaign_${campaignId}`);
          console.log(`👥 User ${socket.id} joined campaign ${campaignId}`);
        } catch (error) {
          console.error(`Error joining campaign ${campaignId}:`, error);
        }
      });
      
      // Leave campaign room
      socket.on('leaveCampaign', (campaignId) => {
        try {
          socket.leave(`campaign_${campaignId}`);
          console.log(`👋 User ${socket.id} left campaign ${campaignId}`);
        } catch (error) {
          console.error(`Error leaving campaign ${campaignId}:`, error);
        }
      });
      
      // Handle equipment changes
      socket.on('equipmentUpdate', (data) => {
        try {
          const { campaignId, characterId, action, slot, itemName } = data;
          // Broadcast to all users in the campaign except sender
          socket.to(`campaign_${campaignId}`).emit('equipmentChanged', {
            characterId,
            action, // 'equip' or 'unequip'
            slot,
            itemName,
            timestamp: new Date().toISOString()
          });
          console.log(`⚔️ Equipment update: ${action} ${itemName} in ${slot} for character ${characterId}`);
        } catch (error) {
          console.error('Error handling equipment update:', error);
        }
      });

      // Handle inventory changes
      socket.on('inventoryUpdate', (data) => {
        try {
          const { campaignId, characterId, action, itemName, unequippedFrom, isCustom } = data;
          // Broadcast to all users in the campaign except sender
          socket.to(`campaign_${campaignId}`).emit('inventoryChanged', {
            characterId,
            action, // 'add' or 'remove'
            itemName,
            unequippedFrom,
            isCustom,
            timestamp: new Date().toISOString()
          });
          console.log(`🎒 Inventory update: ${action} ${itemName} for character ${characterId}${isCustom ? ' (custom item)' : ''}`);
        } catch (error) {
          console.error('Error handling inventory update:', error);
        }
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`👋 User disconnected: ${socket.id}, reason: ${reason}`);
      });
    });

    // Add error handler for Socket.IO server
    io.on('error', (error) => {
      console.error('Socket.IO server error:', error);
    });

    // Make io available to routes
    app.set('io', io);
    
    server.listen(PORT, () => {
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔌 WebSocket server initialized`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  console.log('Server will restart automatically if using nodemon');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  console.log('Server will restart automatically if using nodemon');
  process.exit(0);
});

// Start the server
console.log('🚀 Starting D&D Campaign Manager Server...');
startServer();