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

const { initializeDB, pool } = require('./models/database');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const characterRoutes = require('./routes/characters');
const monsterRoutes = require('./routes/monsters');
const monsterInstanceRoutes = require('./routes/monsterInstances');
const armyRoutes = require('./routes/armies');
const skillRoutes = require('./routes/skills');
const journalsRoutes = require('./routes/journals');
const Character = require('./models/Character');
const Campaign = require('./models/Campaign');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "wss:", "ws:", "wss://dungeonlair.ddns.net", "https://dungeonlair.ddns.net"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration - Allow all origins in production for public access
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, allow dungeonlair.ddns.net and any origin
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    // In development, only allow localhost
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://127.0.0.1:3000', 
      'http://localhost:3001',
      'http://localhost:5000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// Serve uploaded files statically with CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
}

// Placeholder for Socket.IO - will be attached after server initialization
let io = null;
app.use((req, res, next) => {
  if (io) {
    req.io = io;
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', journalsRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/monsters', monsterRoutes);
app.use('/api/armies', armyRoutes);
app.use('/api/monster-instances', monsterInstanceRoutes);
app.use('/api/skills', skillRoutes);

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

// In production, serve React app for any non-API routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // Only serve React app for non-API routes
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
    } else {
      res.status(404).json({ error: 'Route not found' });
    }
  });
}

// 404 handler for development
if (process.env.NODE_ENV !== 'production') {
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

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
    
    // Run migrations
    console.log('Running database migrations...');
    const createSkillsTable = require('./migrations/create_skills_table');
    await createSkillsTable();
    console.log('Database migrations completed');
    
    // Load SSL certificates with ABSOLUTE paths (following DungeonLair working example)
    const privateKey = fs.readFileSync('d:/Coding/DungeonsAndDragons/Certs/dungeonlair.ddns.net-key.pem', 'utf8');
    const certificate = fs.readFileSync('d:/Coding/DungeonsAndDragons/Certs/dungeonlair.ddns.net-crt.pem', 'utf8');
    const ca = fs.readFileSync('d:/Coding/DungeonsAndDragons/Certs/dungeonlair.ddns.net-chain-only.pem', 'utf8');
    
    const credentials = { key: privateKey, cert: certificate, ca: ca };
    
    let server;
    
    if (process.env.NODE_ENV === 'production') {
      // HTTPS server with SSL certificates (production only)
      server = https.createServer(credentials, app);
      console.log(`🚀 HTTPS Server running on port ${PORT}`);
      console.log(`🔒 SSL certificates loaded successfully`);
    } else {
      // HTTP server (development)
      server = http.createServer(app);
      console.log(`🚀 HTTP Server running on port ${PORT}`);
      console.log('⚠️  Running in development mode with HTTP server');
    }
    
    // Initialize Socket.IO
    io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'Accept', 'Origin', 'X-Requested-With']
      }
    });

  // Server-side storage for battle movement tracking (prevents client-side exploits)
  // Structure: { campaignId: { characterId: remainingMovement } }
  const battleMovementState = {};

  // Server-side combat state per campaign
  // Structure: {
  //   campaignId: {
  //     combatants: [{ characterId, playerId, name, initiative, movement_speed }],
  //     initiativeOrder: [characterId,...] (sorted desc by initiative),
  //     currentTurnIndex: -1
  //   }
  // }
  const battleCombatState = {};

  // Map user IDs to socket IDs for targeted notifications
  const userSocketMap = new Map();

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log(`👤 User connected: ${socket.id}`);
      
      // Add error handler for this socket
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
      
      // Register user ID with socket
      socket.on('registerUser', (userId) => {
        try {
          userSocketMap.set(userId, socket.id);
          console.log(`🔗 Registered user ${userId} with socket ${socket.id}`);
        } catch (error) {
          console.error(`Error registering user ${userId}:`, error);
        }
      });
      
      // Join campaign room for real-time updates
      socket.on('joinCampaign', (campaignId) => {
        try {
          socket.join(`campaign_${campaignId}`);
          console.log(`👥 User ${socket.id} joined campaign ${campaignId}`);
          
          // Send current battle movement state for this campaign
          if (battleMovementState[campaignId]) {
            socket.emit('battleMovementSync', {
              movementState: battleMovementState[campaignId]
            });
            console.log(`📊 Sent movement state to user ${socket.id} for campaign ${campaignId}`);
          }
          
          // Send current combat state for this campaign (combatants, initiative order, current turn)
          if (battleCombatState[campaignId]) {
            socket.emit('battleCombatSync', {
              combatants: battleCombatState[campaignId].combatants,
              initiativeOrder: battleCombatState[campaignId].initiativeOrder,
              currentTurnIndex: battleCombatState[campaignId].currentTurnIndex
            });
            console.log(`⚔️ Sent combat state to user ${socket.id} for campaign ${campaignId}`);
          }
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
      
      // Handle real-time character movement on map
      socket.on('characterMove', (data) => {
        try {
          const { campaignId, characterId, characterName, x, y } = data;
          // Broadcast to all users in the campaign except sender
          socket.to(`campaign_${campaignId}`).emit('characterMoved', {
            characterId,
            characterName,
            x,
            y,
            timestamp: new Date().toISOString()
          });
          console.log(`🗺️ Character moved: ${characterName} to (${x.toFixed(2)}, ${y.toFixed(2)}) in campaign ${campaignId}`);
        } catch (error) {
          console.error('Error handling character movement:', error);
        }
      });

      // Handle real-time character movement on battle map
      socket.on('characterBattleMove', (data) => {
        try {
          const { campaignId, characterId, characterName, x, y, remainingMovement } = data;

          // Initialize campaign movement state if not exists
          if (!battleMovementState[campaignId]) {
            battleMovementState[campaignId] = {};
          }

          // Update server-side movement state (authoritative)
          battleMovementState[campaignId][characterId] = remainingMovement;

          // Broadcast to all users in the campaign except sender
          socket.to(`campaign_${campaignId}`).emit('characterBattleMoved', {
            characterId,
            characterName,
            x,
            y,
            remainingMovement,
            timestamp: new Date().toISOString()
          });
          console.log(`⚔️ Battle character moved: ${characterName} to (${x.toFixed(2)}, ${y.toFixed(2)}) - ${remainingMovement}ft remaining in campaign ${campaignId}`);
        } catch (error) {
          console.error('Error handling battle character movement:', error);
        }
      });

      // Handle real-time battlefield participant movement (armies on battlefield map)
      socket.on('battlefieldParticipantMove', (data) => {
        try {
          const { campaignId, battleId, participantId, x, y, remainingMovement } = data;

          // Broadcast to all users in the campaign except sender
          socket.to(`campaign_${campaignId}`).emit('battlefieldParticipantMoved', {
            battleId,
            participantId,
            x,
            y,
            remainingMovement,
            timestamp: new Date().toISOString()
          });
          console.log(`🗺️ Battlefield participant ${participantId} moved to (${x.toFixed(2)}, ${y.toFixed(2)}) - ${remainingMovement !== undefined ? remainingMovement.toFixed(0) + 'ft remaining' : 'unlimited'} in battle ${battleId}, campaign ${campaignId}`);
        } catch (error) {
          console.error('Error handling battlefield participant movement:', error);
        }
      });

      // Invite a player/character to join combat (DM action)
      socket.on('inviteToCombat', async (data) => {
        try {
          const { campaignId, characterId, targetPlayerId, isMonster } = data;
          
          // If it's a monster, add directly to combat (DM-controlled)
          if (isMonster) {
            // Ensure combat state exists for this campaign
            if (!battleCombatState[campaignId]) {
              battleCombatState[campaignId] = { combatants: [], initiativeOrder: [], currentTurnIndex: -1 };
            }

            // Fetch monster details
            const Monster = require('./models/Monster');
            const MonsterInstance = require('./models/MonsterInstance');
            const monster = await Monster.findById(characterId);
            if (!monster) {
              console.warn(`Monster ${characterId} not found for combat`);
              return;
            }

            // Get next instance number for this monster type in this campaign
            const instanceNumber = await MonsterInstance.getNextInstanceNumber(monster.id, campaignId);

            // Roll initiative for monster (d20 + 0 for now; can be enhanced later)
            const roll = Math.floor(Math.random() * 20) + 1;
            const initiative = roll;

            // Create a new monster instance with its own health pool
            const monsterInstance = await MonsterInstance.create({
              monster_id: monster.id,
              campaign_id: campaignId,
              instance_number: instanceNumber,
              current_limb_health: monster.limb_health,
              initiative: initiative
            });

            // Add to combatants list using the instance ID
            battleCombatState[campaignId].combatants.push({
              characterId: monsterInstance.id, // Use instance ID, not monster template ID
              monsterId: monster.id, // Keep reference to monster template
              playerId: targetPlayerId, // DM's ID
              name: `${monster.name} #${instanceNumber}`,
              initiative,
              movement_speed: 30, // Default monster speed
              isMonster: true,
              instanceNumber: instanceNumber
            });

            // Re-sort initiative order
            battleCombatState[campaignId].initiativeOrder = battleCombatState[campaignId].combatants
              .sort((a, b) => b.initiative - a.initiative)
              .map(c => c.characterId);

            // Don't auto-start combat - let DM click "Start Combat" button
            // currentTurnIndex stays at -1 until nextTurn is clicked

            // Broadcast updated combatants
            io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
              combatants: battleCombatState[campaignId].combatants,
              initiativeOrder: battleCombatState[campaignId].initiativeOrder,
              currentTurnIndex: battleCombatState[campaignId].currentTurnIndex
            });

            console.log(`🐉 Monster ${monster.name} #${instanceNumber} (instance ID: ${monsterInstance.id}) added to combat in campaign ${campaignId} (initiative: ${initiative})`);
          } else {
            // Regular player character invite
            io.to(`campaign_${campaignId}`).emit('combatInvite', {
              campaignId,
              characterId,
              targetPlayerId,
              timestamp: new Date().toISOString()
            });
            console.log(`📣 Combat invite sent for character ${characterId} in campaign ${campaignId} to player ${targetPlayerId}`);
          }
        } catch (error) {
          console.error('Error sending combat invite:', error);
        }
      });

      // Player accepts an invite to combat
      socket.on('acceptCombatInvite', async (data) => {
        try {
          const { campaignId, characterId, playerId } = data;

          // Ensure combat state exists for this campaign
          if (!battleCombatState[campaignId]) {
            battleCombatState[campaignId] = { combatants: [], initiativeOrder: [], currentTurnIndex: -1 };
          }

          // Fetch character to get abilities and movement_speed
          const character = await Character.findById(characterId);
          if (!character) {
            console.warn(`Character ${characterId} not found for combat`);
            return;
          }

          // Roll initiative: d20 + dex modifier
          const roll = Math.floor(Math.random() * 20) + 1;
          const dex = character.abilities?.dex ?? 10;
          const dexMod = Character.getAbilityModifier(dex);
          const initiative = roll + dexMod;

          // Add to combatants list
          battleCombatState[campaignId].combatants.push({
            characterId: character.id,
            playerId: playerId,
            name: character.name,
            initiative,
            movement_speed: character.movement_speed ?? 30
          });

          // Mark character as in combat in DB
          try {
            await pool.query('UPDATE characters SET combat_active = TRUE WHERE id = $1', [characterId]);
          } catch (dbErr) {
            console.error('Error setting combat_active in DB:', dbErr);
          }

          // Initialize movement state for this character
          if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
          battleMovementState[campaignId][characterId] = character.movement_speed ?? 30;

          // Sort initiative order (highest first)
          const sorted = [...battleCombatState[campaignId].combatants].sort((a, b) => b.initiative - a.initiative);
          battleCombatState[campaignId].initiativeOrder = sorted.map(c => c.characterId);

          // Don't auto-start combat - let DM click "Start Combat" button
          // currentTurnIndex stays at -1 until nextTurn is clicked

          // Broadcast updated combatants to all in campaign
          io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
            combatants: sorted,
            initiativeOrder: battleCombatState[campaignId].initiativeOrder,
            currentTurnIndex: battleCombatState[campaignId].currentTurnIndex,
            timestamp: new Date().toISOString()
          });

          console.log(`🛡️ ${character.name} added to combat in campaign ${campaignId} with initiative ${initiative}`);
        } catch (error) {
          console.error('Error accepting combat invite:', error);
        }
      });

      // Advance to next turn in initiative order (DM action)
      socket.on('nextTurn', (data) => {
        try {
          const { campaignId } = data;
          const state = battleCombatState[campaignId];
          if (!state || !state.initiativeOrder || state.initiativeOrder.length === 0) {
            console.warn('No combat state for campaign', campaignId);
            return;
          }

          // If combat hasn't started yet (currentTurnIndex is -1), start it
          if (state.currentTurnIndex === -1) {
            state.currentTurnIndex = 0;
            console.log(`⚔️ Starting combat in campaign ${campaignId}`);
          } else {
            // Advance to next turn
            state.currentTurnIndex = (state.currentTurnIndex + 1) % state.initiativeOrder.length;
          }
          
          const currentCharacterId = state.initiativeOrder[state.currentTurnIndex];

          // Reset only the current character's movement to their movement_speed
          const combatant = state.combatants.find(c => c.characterId === currentCharacterId);
          if (combatant) {
            if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
            battleMovementState[campaignId][currentCharacterId] = combatant.movement_speed;
          }

          // Broadcast turn advance with movement speed included
          io.to(`campaign_${campaignId}`).emit('turnAdvanced', {
            currentCharacterId,
            initiativeOrder: state.initiativeOrder,
            currentTurnIndex: state.currentTurnIndex,
            resetMovementFor: currentCharacterId,
            movementSpeed: combatant ? combatant.movement_speed : 30,
            timestamp: new Date().toISOString()
          });

          console.log(`➡️ Advanced turn in campaign ${campaignId} to character ${currentCharacterId} (index: ${state.currentTurnIndex})`);
        } catch (error) {
          console.error('Error advancing turn:', error);
        }
      });

      // Reset combat - clear all combatants and initiative (DM action)
      socket.on('resetCombat', async (data) => {
        try {
          const { campaignId } = data;
          
          // Clear combat state for this campaign
          if (battleCombatState[campaignId]) {
            delete battleCombatState[campaignId];
          }
          
          // Clear movement state for this campaign
          if (battleMovementState[campaignId]) {
            delete battleMovementState[campaignId];
          }
          
          // Set all characters' combat_active to false in database
          await pool.query('UPDATE characters SET combat_active = FALSE, initiative = 0 WHERE campaign_id = $1', [campaignId]);
          
          // Remove all monster instances from combat
          const MonsterInstance = require('./models/MonsterInstance');
          await MonsterInstance.removeAllFromCombat(campaignId);
          
          // Broadcast combat reset to all users in campaign
          io.to(`campaign_${campaignId}`).emit('combatReset', {
            timestamp: new Date().toISOString()
          });
          
          console.log(`🔄 Combat reset for campaign ${campaignId}`);
        } catch (error) {
          console.error('Error resetting combat:', error);
        }
      });

      // ===== BATTLEFIELD / ARMY BATTLE EVENTS =====

      // Participant position update (DM moving armies during planning phase)
      socket.on('battlefieldParticipantMove', (data) => {
        try {
          const { campaignId, participantId, x, y } = data;
          // Broadcast to all users in the campaign
          socket.to(`campaign_${campaignId}`).emit('battlefieldParticipantMoved', {
            participantId,
            x,
            y,
            timestamp: new Date().toISOString()
          });
          console.log(`🗺️ Battlefield participant ${participantId} moved to (${x}, ${y}) in campaign ${campaignId}`);
        } catch (error) {
          console.error('Error handling battlefield participant movement:', error);
        }
      });

      // Player locks in their battle goal
      socket.on('battleGoalLocked', (data) => {
        try {
          const { campaignId, goalId, participantId, goalName } = data;
          // Broadcast to all users that this goal is locked
          io.to(`campaign_${campaignId}`).emit('battleGoalLockedUpdate', {
            goalId,
            participantId,
            goalName,
            locked: true,
            timestamp: new Date().toISOString()
          });
          console.log(`🔒 Battle goal ${goalName} locked for participant ${participantId}`);
        } catch (error) {
          console.error('Error handling battle goal lock:', error);
        }
      });

      // Player rolls dice for their goal
      socket.on('battleGoalRolled', (data) => {
        try {
          const { campaignId, goalId, participantId, diceRoll, totalModifier } = data;
          // Broadcast the roll to everyone (DM needs to see it)
          io.to(`campaign_${campaignId}`).emit('battleGoalRollUpdate', {
            goalId,
            participantId,
            diceRoll,
            totalModifier,
            total: diceRoll + totalModifier,
            timestamp: new Date().toISOString()
          });
          console.log(`🎲 Battle goal roll: ${diceRoll} + ${totalModifier} = ${diceRoll + totalModifier}`);
        } catch (error) {
          console.error('Error handling battle goal roll:', error);
        }
      });

      // DM resolves a goal (sets DC and success/fail)
      socket.on('battleGoalResolved', (data) => {
        try {
          const { campaignId, goalId, dc, success, modifierApplied } = data;
          // Broadcast resolution to everyone (but not the full results yet)
          io.to(`campaign_${campaignId}`).emit('battleGoalResolutionUpdate', {
            goalId,
            dc,
            success,
            modifierApplied,
            timestamp: new Date().toISOString()
          });
          console.log(`✅ Battle goal ${goalId} resolved: DC ${dc}, ${success ? 'Success' : 'Fail'}, modifier: ${modifierApplied}`);
        } catch (error) {
          console.error('Error handling battle goal resolution:', error);
        }
      });

      // DM sends round results (all goals resolved, scores updated)
      // This is handled by the API route's socket emit, but we can add a refresh trigger
      socket.on('requestBattleUpdate', (data) => {
        try {
          const { campaignId, battleId } = data;
          // Trigger all clients to refresh battle state
          io.to(`campaign_${campaignId}`).emit('battleStateRefresh', {
            battleId,
            timestamp: new Date().toISOString()
          });
          console.log(`🔄 Battle state refresh requested for battle ${battleId}`);
        } catch (error) {
          console.error('Error handling battle update request:', error);
        }
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`👋 User disconnected: ${socket.id}, reason: ${reason}`);
        // Remove from user socket map
        for (const [userId, socketId] of userSocketMap.entries()) {
          if (socketId === socket.id) {
            userSocketMap.delete(userId);
            console.log(`🗑️ Removed user ${userId} from socket map`);
            break;
          }
        }
      });
    });

    // Add error handler for Socket.IO server
    io.on('error', (error) => {
      console.error('Socket.IO server error:', error);
    });

    // Make io and userSocketMap available to routes
    app.set('io', io);
    app.set('userSocketMap', userSocketMap);
    
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