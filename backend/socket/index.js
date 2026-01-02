/**
 * Socket.IO Event Handlers
 * Handles all real-time communication events for the D&D Campaign Manager
 */

const Character = require('../models/Character');
const Monster = require('../models/Monster');
const MonsterInstance = require('../models/MonsterInstance');
const { pool } = require('../models/database');

/**
 * Initialize socket event handlers
 * @param {Server} io - Socket.IO server instance
 * @param {Object} battleMovementState - Server-side battle movement tracking
 * @param {Object} battleCombatState - Server-side combat state tracking
 * @param {Map} userSocketMap - Map of user IDs to socket IDs
 */
const initializeSocketHandlers = (io, battleMovementState, battleCombatState, userSocketMap) => {
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
        
        // Send current combat state for this campaign
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
    
    // Equipment updates
    require('./handlers/equipmentHandlers')(socket, io);
    
    // Movement handlers
    require('./handlers/movementHandlers')(socket, io, battleMovementState);
    
    // Combat handlers
    require('./handlers/combatHandlers')(socket, io, battleCombatState, battleMovementState, userSocketMap);
    
    // Battle (mass combat) handlers
    require('./handlers/battleHandlers')(socket, io);
    
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
};

module.exports = { initializeSocketHandlers };
