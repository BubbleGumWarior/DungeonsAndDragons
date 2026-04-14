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
    console.log('🔍 About to start try block');
    
    try {
      console.log('✅ Inside try block');
      // Add error handler for this socket
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
      console.log('✅ Error handler registered');
      
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
          console.log(`📋 Socket rooms:`, Array.from(socket.rooms));
        
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
    
    // Character updates (abilities, skills, etc.)
    console.log('📦 Loading character handlers...');
    const characterHandlers = require('./handlers/characterHandlers');
    console.log('📦 Character handlers module loaded:', typeof characterHandlers);
    characterHandlers(socket, io);
    console.log('📦 Character handlers called');
    
    // Movement handlers
    require('./handlers/movementHandlers')(socket, io, battleMovementState);
    
    // Combat handlers
    require('./handlers/combatHandlers')(socket, io, battleCombatState, battleMovementState, userSocketMap);
    
    // Battle (mass combat) handlers
    require('./handlers/battleHandlers')(socket, io);

    // Chat handlers
    require('./handlers/chatHandlers')(socket, io, userSocketMap);
    
    // Kingdom handlers
    socket.on('createKingdom', async ({ campaignId, targetPlayerId, availableResources, waterAccess, buildableLand }) => {
      try {
        console.log(`👑 [createKingdom] Received from socket ${socket.id}: campaignId=${campaignId}, targetPlayerId=${targetPlayerId}, availableResources=${JSON.stringify(availableResources)}, waterAccess=${waterAccess}, buildableLand=${buildableLand}`);
        if (!availableResources || typeof availableResources !== 'object') {
          console.warn('[createKingdom] availableResources missing or invalid — using defaults');
        }
        const Kingdom = require('../models/Kingdom');
        const kingdom = await Kingdom.create({
          campaign_id: campaignId,
          player_id: targetPlayerId,
          available_resources: availableResources,
          water_access: waterAccess,
          buildable_land: buildableLand,
        });
        console.log(`👑 [createKingdom] Kingdom row created:`, kingdom);
        const room = `campaign_${campaignId}`;
        const roomSockets = await io.in(room).fetchSockets();
        console.log(`👑 [createKingdom] Emitting kingdomNameRequest to room "${room}" (${roomSockets.length} sockets)`);
        roomSockets.forEach(s => console.log(`   - socket ${s.id}`));
        io.to(room).emit('kingdomNameRequest', {
          kingdomId: kingdom.id,
          targetPlayerId: Number(targetPlayerId)
        });
        console.log(`👑 [createKingdom] kingdomNameRequest emitted with targetPlayerId=${Number(targetPlayerId)}`);
      } catch (error) {
        console.error('[createKingdom] Error:', error);
      }
    });

    socket.on('nameKingdom', async ({ campaignId, kingdomId, kingdomName, fiefName, name }) => {
      try {
        // Support both old (name) and new (kingdomName + fiefName) formats
        const resolvedKingdomName = kingdomName || name;
        const resolvedFiefName = fiefName || null;
        console.log(`👑 [nameKingdom] Received: campaignId=${campaignId}, kingdomId=${kingdomId}, kingdomName="${resolvedKingdomName}", fiefName="${resolvedFiefName}"`);
        const Kingdom = require('../models/Kingdom');
        const kingdom = await Kingdom.setName(kingdomId, resolvedKingdomName);
        if (kingdom) {
          // Rename the capital fief if a name was provided
          if (resolvedFiefName) {
            await pool.query(
              `UPDATE fiefs SET name = $1 WHERE kingdom_id = $2 AND is_capital = true`,
              [resolvedFiefName, kingdomId]
            );
          }
          // Insert 3 starting Tents (free, already complete)
          const capitalFief = await pool.query(
            `SELECT id FROM fiefs WHERE kingdom_id = $1 AND is_capital = true LIMIT 1`,
            [kingdomId]
          );
          if (capitalFief.rows[0]) {
            const fiefId = capitalFief.rows[0].id;
            for (let i = 1; i <= 3; i++) {
              await pool.query(
                `INSERT INTO fief_buildings (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, queue_position, resource_output, resource_cost)
                 VALUES ($1, 'Tent', 'shelter', 1, 'A basic shelter that houses up to 4 people.', 0, 0, true, NULL, $2, $3)`,
                [fiefId, JSON.stringify({ capacity: 4 }), JSON.stringify({})]
              );
            }
          }
          // Fetch and emit full kingdom data
          const fullKingdom = await Kingdom.findByIdFull(kingdomId);
          io.to(`campaign_${campaignId}`).emit('kingdomActivated', { kingdom: fullKingdom || kingdom });
          console.log(`👑 [nameKingdom] Kingdom "${resolvedKingdomName}" activated, kingdomActivated emitted to campaign_${campaignId}`);
        } else {
          console.warn(`👑 [nameKingdom] setName returned null for id=${kingdomId}`);
        }
      } catch (error) {
        console.error('[nameKingdom] Error:', error);
      }
    });

    // DM: update land resources for a fief after creation
    socket.on('updateFiefLandResources', async ({ campaignId, fiefId, availableResources, waterAccess, buildableLand }) => {
      try {
        console.log(`👑 [updateFiefLandResources] fiefId=${fiefId}, resources=${JSON.stringify(availableResources)}`);
        const updates = [];
        const params = [];
        if (availableResources && typeof availableResources === 'object') {
          params.push(JSON.stringify(availableResources));
          updates.push(`available_resources = $${params.length}`);
        }
        if (typeof waterAccess === 'boolean') {
          params.push(waterAccess);
          updates.push(`water_access = $${params.length}`);
        }
        if (buildableLand != null && Number.isFinite(Number(buildableLand))) {
          params.push(Math.max(1, Math.min(1000, Number(buildableLand))));
          updates.push(`buildable_land = $${params.length}`);
        }
        if (updates.length > 0) {
          params.push(fiefId);
          await pool.query(`UPDATE fiefs SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
          io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId, fiefId });
          console.log(`👑 [updateFiefLandResources] Updated fief ${fiefId}`);
        }
      } catch (error) {
        console.error('[updateFiefLandResources] Error:', error);
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
    
    } catch (error) {
      console.error(`❌ Error initializing socket handlers for ${socket.id}:`, error);
    }
  });

  // Add error handler for Socket.IO server
  io.on('error', (error) => {
    console.error('Socket.IO server error:', error);
  });
};

module.exports = { initializeSocketHandlers };
