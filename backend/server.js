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

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token']
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ error: 'Internal server error' });
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
        credentials: true
      }
    });

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log(`� User connected: ${socket.id}`);
      
      // Join campaign room for real-time updates
      socket.on('joinCampaign', (campaignId) => {
        socket.join(`campaign_${campaignId}`);
        console.log(`👥 User ${socket.id} joined campaign ${campaignId}`);
      });
      
      // Leave campaign room
      socket.on('leaveCampaign', (campaignId) => {
        socket.leave(`campaign_${campaignId}`);
        console.log(`👋 User ${socket.id} left campaign ${campaignId}`);
      });
      
      // Handle equipment changes
      socket.on('equipmentUpdate', (data) => {
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
      });
      
      socket.on('disconnect', () => {
        console.log(`� User disconnected: ${socket.id}`);
      });
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
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();