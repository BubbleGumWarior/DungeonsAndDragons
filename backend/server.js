const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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
const beastRoutes = require('./routes/beasts');
const shadowRoutes = require('./routes/shadows');
const mountRoutes = require('./routes/mounts');
const battleMapsRoutes = require('./routes/battleMaps');
const petRoutes = require('./routes/pets');
const kingdomRoutes = require('./routes/kingdoms');
const fiefRoutes = require('./routes/fiefs');
const kingdomEventRoutes = require('./routes/kingdom-events');
const kingdomActionRoutes = require('./routes/kingdom-actions');
const npcRoutes = require('./routes/npcs');
const Character = require('./models/Character');
const Campaign = require('./models/Campaign');
const CombatSession = require('./models/CombatSession');

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
      connectSrc: ["'self'", "wss:", "ws:", "https://www.dungeonlair.co.za", "https://dungeonlair.co.za", "wss://dungeonlair-game.ddns.net", "https://dungeonlair-game.ddns.net"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));

// Rate limiting disabled
// app.use(limiter);

// CORS configuration - Allow Railway and custom domain
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, allow specific domains
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        'https://dungeonlair.co.za',
        'https://www.dungeonlair.co.za',
        'https://dungeonlair-game.ddns.net',
        'https://dungeonsanddragons-production-292a.up.railway.app',
        process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
        process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null
      ].filter(Boolean);
      
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all in production for now
    }
    
    // In development, allow all origins
    return callback(null, true);
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
app.use('/api/beasts', beastRoutes);
app.use('/api/shadows', shadowRoutes);
app.use('/api/mounts', mountRoutes);
app.use('/api/battle-maps', battleMapsRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/kingdoms', kingdomRoutes);
app.use('/api', fiefRoutes);
app.use('/api/kingdoms', kingdomEventRoutes);
app.use('/api/kingdoms', kingdomActionRoutes);
app.use('/api', npcRoutes);

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
    
    try {
      // Core table migrations (must run first to create tables)
      const createSkillsTable = require('./migrations/create_skills_table');
      const createJournalTable = require('./migrations/create_journal_entries_table');
      const addSubclassSystem = require('./migrations/add_subclass_system');
      const addExperienceAndSkills = require('./migrations/add_experience_and_skills');
      
      // Army/Battle structure migrations
      const addArmyCategory = require('./migrations/add_army_category');
      const addKnightsCategory = require('./migrations/add_knights_category');
      const addTroopCounts = require('./migrations/add_troop_counts');
      const addTotalRounds = require('./migrations/add_total_rounds');
      const addCancelledStatus = require('./migrations/add_cancelled_status');
      const addFactionSupport = require('./migrations/add_faction_support');
      const fixEliteArmyCategories = require('./migrations/fix_elite_army_categories');
      
      // Class data migrations (require subclass tables to exist)
      const populateAllClasses = require('./migrations/populate_all_classes_data');
      const populateAllSubclasses = require('./migrations/populate_all_remaining_subclasses');
      
      // Specific class migrations (require all base tables)
      const addPrimalBondClass = require('./migrations/add_primal_bond_class');
      const addPrimalBondSkills = require('./migrations/add_primal_bond_skills');
      const addUniqueConstraintClassFeatures = require('./migrations/add_unique_constraint_class_features');
      const fixClassFeaturesLevel0 = require('./migrations/fix_class_features_level0');
      const addShadowSovereignClass = require('./migrations/add_shadow_sovereign_class');
      const addShadowSovereignSkills = require('./migrations/add_shadow_sovereign_skills');
      const createBattleGoalsTable = require('./migrations/create_battle_goals_table');
      const addImageDataToCharacters = require('./migrations/add_image_data_to_characters');
      const cleanupOldImagePaths = require('./migrations/cleanup_old_image_paths');
      const addMountsTable = require('./migrations/add_mounts_table');
      const addCharlatanClass = require('./migrations/add_charlatan_class');
      const addCharlatanSkills = require('./migrations/add_charlatan_skills');
      const addExpertiseColumn = require('./migrations/add_expertise_column');
      const addImageDataToMonsters = require('./migrations/add_image_data_to_monsters');
      const addMonsterAbilities = require('./migrations/add_monster_abilities');
      const addMonsterCR = require('./migrations/add_monster_cr');
      const seedDefaultMonsters = require('./migrations/seed_default_monsters');
      const addCombatSystem = require('./migrations/add_combat_system');
      
      // Execute migrations in correct order
      const migrations = [
        { name: 'createSkillsTable', fn: createSkillsTable },
        { name: 'createJournalTable', fn: createJournalTable },
        { name: 'addSubclassSystem', fn: addSubclassSystem },
        { name: 'addExperienceAndSkills', fn: addExperienceAndSkills },
        { name: 'addArmyCategory', fn: addArmyCategory },
        { name: 'addKnightsCategory', fn: addKnightsCategory },
        { name: 'addTroopCounts', fn: addTroopCounts },
        { name: 'addTotalRounds', fn: addTotalRounds },
        { name: 'addCancelledStatus', fn: addCancelledStatus },
        { name: 'addFactionSupport', fn: addFactionSupport },
        { name: 'populateAllClasses', fn: populateAllClasses },
        { name: 'populateAllSubclasses', fn: populateAllSubclasses },
        { name: 'addPrimalBondClass', fn: addPrimalBondClass },
        { name: 'addPrimalBondSkills', fn: addPrimalBondSkills },
        { name: 'addUniqueConstraintClassFeatures', fn: addUniqueConstraintClassFeatures },
        { name: 'fixClassFeaturesLevel0', fn: fixClassFeaturesLevel0 },
        { name: 'addShadowSovereignClass', fn: addShadowSovereignClass },
        { name: 'addShadowSovereignSkills', fn: addShadowSovereignSkills },
        { name: 'createBattleGoalsTable', fn: createBattleGoalsTable },
        { name: 'fixEliteArmyCategories', fn: fixEliteArmyCategories },
        { name: 'addImageDataToCharacters', fn: addImageDataToCharacters },
        { name: 'cleanupOldImagePaths', fn: cleanupOldImagePaths },
        { name: 'addMountsTable', fn: addMountsTable },
        { name: 'addCharlatanClass', fn: addCharlatanClass },
        { name: 'addCharlatanSkills', fn: addCharlatanSkills },
        { name: 'addExpertiseColumn', fn: addExpertiseColumn },
        { name: 'addImageDataToMonsters', fn: addImageDataToMonsters },
        { name: 'addMonsterAbilities', fn: addMonsterAbilities },
        { name: 'addMonsterCR', fn: addMonsterCR },
        { name: 'seedDefaultMonsters', fn: seedDefaultMonsters },
        { name: 'addKingdomSystem', fn: require('./migrations/add_kingdom_system') },
        { name: 'addFiefConstruction', fn: require('./migrations/add_fief_construction') },
        { name: 'fiefStatsDefaultOne', fn: require('./migrations/fief_stats_default_one') },
        { name: 'addWorkerAssignments', fn: require('./migrations/add_worker_assignments') },
        { name: 'addTierUpgradeTimer', fn: require('./migrations/add_tier_upgrade_timer') },
        { name: 'addGarrisonTraining', fn: require('./migrations/add_garrison_training') },
        { name: 'addFaithColumn', fn: require('./migrations/add_faith_column') },
        { name: 'addPlayerArmyTraining', fn: require('./migrations/add_player_army_training') },
        { name: 'addArmyGarrisonColumn', fn: require('./migrations/add_army_garrison_column') },
        { name: 'addResearchSystem', fn: require('./migrations/add_research_system') },
        { name: 'addBuildQueue', fn: require('./migrations/add_build_queue') },
        { name: 'addActiveDisasters', fn: require('./migrations/add_active_disasters') },
        { name: 'addCombatSystem', fn: addCombatSystem },
        { name: 'addCampaignChat', fn: require('./migrations/add_campaign_chat') },
        { name: 'addResistancesToCharacters', fn: require('./migrations/add_resistances_to_characters') },
        { name: 'addResistancesToMonsters', fn: require('./migrations/add_resistances_to_monsters') },
        { name: 'seedMonsterResistances', fn: require('./migrations/seed_monster_resistances') },
        { name: 'addClassResources', fn: require('./migrations/add_class_resources') },
        { name: 'addShadowSovereignShadows', fn: require('./migrations/add_shadow_sovereign_shadows') },
        { name: 'addOrderClericDomain', fn: require('./migrations/add_order_cleric_domain') },
        { name: 'addConcealedClass', fn: require('./migrations/add_concealed_class') },
        { name: 'addMountArmor', fn: require('./migrations/add_mount_armor') },
        { name: 'addCampaignBattleMaps', fn: require('./migrations/add_campaign_battle_maps') },
        { name: 'addMountedCombat', fn: require('./migrations/add_mounted_combat') },
        { name: 'addCampaignActiveMap', fn: require('./migrations/add_campaign_active_map') },
        { name: 'addCampaignScores', fn: require('./migrations/add_campaign_scores') },
        { name: 'addTempLimbHealth', fn: require('./migrations/add_temp_limb_health') },
        { name: 'addCampaignNpcs', fn: require('./migrations/add_campaign_npcs') },
      ];
      
      for (const migration of migrations) {
        try {
          await migration.fn();
        } catch (error) {
          console.warn(`⚠️  Migration "${migration.name}" failed (non-fatal):`, error.message);
          // Continue with next migration instead of crashing
        }
      }
      
      console.log('✅ Migration phase completed (some migrations may have failed)');
    } catch (error) {
      console.error('❌ Critical error during migrations:', error.message);
      // Don't exit - let server start anyway so we can access the app
      console.log('⚠️  Server continuing despite migration errors...');
    }
    
    // Create HTTP server (Railway handles SSL termination)
    let server = http.createServer(app);
    
    if (process.env.NODE_ENV === 'production') {
      console.log(`🚀 HTTP Server starting (Railway handles SSL)`);
    } else {
      console.log(`🚀 HTTP Server starting in development mode`);
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

  // ─── Hit dice map by class ───
  const HIT_DICE_MAP = {
    Barbarian: 12, Oathknight: 12,
    Fighter: 10, Paladin: 10, Ranger: 10, 'Primal Bond': 10, 'Shadow Sovereign': 10,
    Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Reaver: 8, Warlock: 8, Charlatan: 8,
    Sorcerer: 6, Wizard: 6,
  };

  // ─── Anti-cheat: track pending/resolved dice requests per campaign ───
  // Structure: { campaignId: { requestId: { type, config, targetPlayerId, status } } }
  const battleRollState = {};

  // ─── Helper: initialise per-limb health for a character (proportional to current HP) ───
  function initCharacterLimbHealth(character) {
    const abilities = typeof character.abilities === 'string' ? JSON.parse(character.abilities) : (character.abilities || {});
    const con = abilities.con ?? 10;
    const conMod = Math.floor((con - 10) / 2);
    const conBonus = Math.max(0, conMod * 0.1);
    // Each limb HP = floor(baseHP × ratio) — NOT normalized, so limbs can exceed baseHP in sum
    const hp = character.hit_points || 1;
    return {
      head:      Math.floor(hp * Math.min(1.0, 0.25 + conBonus)),
      chest:     Math.floor(hp * Math.min(2.0, 1.0 + conBonus)),
      left_arm:  Math.floor(hp * Math.min(1.0, 0.15 + conBonus)),
      right_arm: Math.floor(hp * Math.min(1.0, 0.15 + conBonus)),
      left_leg:  Math.floor(hp * Math.min(1.0, 0.40 + conBonus)),
      right_leg: Math.floor(hp * Math.min(1.0, 0.40 + conBonus)),
    };
  }

  // Server-side storage for battle movement tracking (prevents client-side exploits)
  // Structure: { campaignId: { characterId: remainingMovement } }
  const battleMovementState = {};

  // Server-side combat state per campaign (lightweight cache — DB is source of truth)
  // Structure: { campaignId: { sessionId, combatants: [...], initiativeOrder: [...], currentTurnIndex } }
  const battleCombatState = {};

  // DOT (damage-over-time) conditions: { campaignId: { combatantKey: [{ type, fixedDamage, damageDice, requireRoll, limbTarget, turnsRemaining }] } }
  const battleDotState = {};

  // Darkness level per campaign: 0 = fully lit, 1 = pitch black
  const battleDarknessState = {};

  // Active battle map per campaign: campaignId -> mapId (number | null)
  const activeBattleMapState = {};

  // Active battlefield (army combat) map per campaign: campaignId -> mapId (number | null)
  const activeBattlefieldMapState = {};

  // Rebuild combat cache from any active DB sessions (handles server restarts)
  try {
    const activeSessions = await pool.query(
      `SELECT cs.*,
              array_agg(cc.combatant_key ORDER BY cc.initiative DESC, cc.id ASC)
                FILTER (WHERE cc.id IS NOT NULL) as initiative_order,
              json_agg(
                json_build_object(
                  'id',                 cc.id,
                  'combatant_key',      cc.combatant_key,
                  'character_id',       cc.character_id,
                  'monster_instance_id',cc.monster_instance_id,
                  'monster_id',         mi.monster_id,
                  'player_id',          cc.player_id,
                  'name',               cc.name,
                  'initiative',         cc.initiative,
                  'movement_speed',     cc.movement_speed,
                  'remaining_movement', cc.remaining_movement,
                  'is_monster',         cc.is_monster,
                  'is_beast',           cc.is_beast,
                  'is_pet',             cc.is_pet,
                  'pet_id',             cc.pet_id,
                  'owner_character_id', cc.owner_character_id,
                  'position_x',         cc.position_x,
                  'position_y',         cc.position_y
                ) ORDER BY cc.initiative DESC, cc.id ASC
              ) FILTER (WHERE cc.id IS NOT NULL) as combatants_data
       FROM combat_sessions cs
       LEFT JOIN combat_combatants cc ON cc.session_id = cs.id AND cc.is_active = TRUE
       LEFT JOIN monster_instances mi ON mi.id = cc.monster_instance_id
       WHERE cs.status = 'active'
       GROUP BY cs.id`
    );
    for (const session of activeSessions.rows) {
      const combatantsData = (session.combatants_data || []).filter(Boolean);
      const combatants = combatantsData.map(c => ({
        characterId: c.combatant_key,
        dbId: c.id,
        characterDbId: c.character_id,
        monsterInstanceId: c.monster_instance_id,
        monsterId: c.monster_id,
        playerId: c.player_id,
        name: c.name,
        initiative: c.initiative,
        movement_speed: c.movement_speed,
        isMonster: c.is_monster,
        isBeast: c.is_beast,
        isPet: c.is_pet,
        petId: c.pet_id,
        ownerId: c.owner_character_id,
      }));
      const validKeys = (session.initiative_order || []).filter(Boolean);
      battleCombatState[session.campaign_id] = {
        sessionId: session.id,
        combatants,
        initiativeOrder: validKeys,
        currentTurnIndex: session.current_turn_index,
      };
      // Restore token positions from DB so they survive server restarts
      if (!battleMovementState[session.campaign_id]) battleMovementState[session.campaign_id] = {};
      combatantsData.forEach(c => {
        battleMovementState[session.campaign_id][c.combatant_key] = {
          x: c.position_x != null ? c.position_x : 50,
          y: c.position_y != null ? c.position_y : 50,
          remainingMovement: c.remaining_movement != null ? c.remaining_movement : (c.movement_speed || 30),
        };
      });
    }
    if (activeSessions.rows.length > 0) {
      console.log(`✅ Rebuilt combat cache for ${activeSessions.rows.length} active session(s)`);
    }
  } catch (e) {
    console.warn('⚠️  Could not rebuild combat cache (tables may not exist yet):', e.message);
  }

  // Server-side campaign party grouping state
  // Structure: { campaignId: { partyMemberIds: number[], partyPosition: { x, y } } }
  const partyGroupState = {};

  // Ensure campaigns table has party group columns (idempotent migration)
  try {
    await pool.query(`
      ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS party_member_ids JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS party_position JSONB DEFAULT '{"x":50,"y":50}'::jsonb
    `);
    console.log('✅ Party group columns ensured on campaigns table');
  } catch (err) {
    console.warn('⚠️  Could not add party group columns:', err.message);
  }

  // Map user IDs to socket IDs for targeted notifications
  const userSocketMap = new Map();

  // Track online users per campaign for presence indicators
  // Structure: { campaignId: Set<userId> }
  const campaignPresence = {};

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
          socket.userId = userId;
          console.log(`🔗 Registered user ${userId} with socket ${socket.id}`);
          // If user already joined a campaign, update presence now
          if (socket.campaignId) {
            if (!campaignPresence[socket.campaignId]) campaignPresence[socket.campaignId] = new Set();
            campaignPresence[socket.campaignId].add(userId);
            io.to(`campaign_${socket.campaignId}`).emit('campaignUsersOnline', {
              campaignId: socket.campaignId,
              onlineUserIds: Array.from(campaignPresence[socket.campaignId])
            });
          }
        } catch (error) {
          console.error(`Error registering user ${userId}:`, error);
        }
      });
      
      // Join campaign room for real-time updates
      socket.on('joinCampaign', async (campaignId) => {
        try {
          socket.join(`campaign_${campaignId}`);
          socket.campaignId = campaignId;
          console.log(`👥 User ${socket.id} joined campaign ${campaignId}`);
          // Update presence tracking
          if (socket.userId) {
            if (!campaignPresence[campaignId]) campaignPresence[campaignId] = new Set();
            campaignPresence[campaignId].add(socket.userId);
            io.to(`campaign_${campaignId}`).emit('campaignUsersOnline', {
              campaignId,
              onlineUserIds: Array.from(campaignPresence[campaignId])
            });
          }
          
          // Send current battle movement state for this campaign
          if (battleMovementState[campaignId]) {
            socket.emit('battleMovementSync', {
              movementState: battleMovementState[campaignId]
            });
            console.log(`📊 Sent movement state to user ${socket.id} for campaign ${campaignId}`);
          }
          
          // Send current combat state for this campaign (combatants, initiative order, current turn)
          if (battleCombatState[campaignId]) {
            const log = battleCombatState[campaignId].sessionId
              ? await CombatSession.getLog(battleCombatState[campaignId].sessionId)
              : [];
            // Fetch current monster HP from DB so clients hydrate correctly after refresh
            const monsterHpData = {};
            try {
              const MonsterInstanceSync = require('./models/MonsterInstance');
              const monsterCombatants = battleCombatState[campaignId].combatants.filter(c => c.isMonster);
              for (const mc of monsterCombatants) {
                const instanceId = parseInt(String(mc.characterId), 10);
                if (!isNaN(instanceId)) {
                  const inst = await MonsterInstanceSync.findById(instanceId);
                  if (inst) {
                    const limbHealth = inst.current_limb_health;
                    const totalHP = Object.values(limbHealth).reduce((s, v) => s + v, 0);
                    monsterHpData[String(instanceId)] = { limbHealth, totalHP, tempLimbHealth: inst.temp_limb_health ?? null };
                  }
                }
              }
            } catch (e) { console.warn('Could not fetch monster HP for sync:', e.message); }
            // Fetch current character HP from DB (current + max) so all clients show correct bars
            const characterHpData = {};
            try {
              const charCombatants = battleCombatState[campaignId].combatants.filter(c => !c.isMonster);
              if (charCombatants.length > 0) {
                const charIds = charCombatants.map(c => parseInt(String(c.characterId), 10)).filter(id => !isNaN(id));
                const hpRes = await pool.query(
                  `SELECT id, hit_points,
                          CASE WHEN hit_points_max IS NULL OR hit_points_max <= 0 THEN GREATEST(hit_points, 1) ELSE hit_points_max END AS max_hp,
                          limb_health, temp_limb_health, abilities, COALESCE(hit_dice_remaining, level) AS hit_dice_remaining
                   FROM characters WHERE id = ANY($1::int[])`,
                  [charIds]
                );
                for (const row of hpRes.rows) {
                  let limbHealth = row.limb_health ?? null;

                  // Backfill limb health for legacy rows where HP was reduced but limb data is missing.
                  // Persisting this ensures combat HP survives server restarts.
                  if (!limbHealth && Number(row.max_hp) > 0 && Number(row.hit_points) < Number(row.max_hp)) {
                    const maxHp = Number(row.max_hp);
                    const currentHp = Math.max(0, Number(row.hit_points));
                    const limbMax = initCharacterLimbHealth({ hit_points: maxHp, abilities: row.abilities || {} });

                    const ratio = maxHp > 0 ? (currentHp / maxHp) : 0;
                    const derived = {};
                    let runningTotal = 0;
                    const keys = Object.keys(limbMax);

                    keys.forEach((k, idx) => {
                      const v = idx === keys.length - 1
                        ? Math.max(0, currentHp - runningTotal)
                        : Math.max(0, Math.round(Number(limbMax[k] || 0) * ratio));
                      derived[k] = v;
                      runningTotal += v;
                    });

                    limbHealth = derived;
                    await pool.query('UPDATE characters SET limb_health = $1 WHERE id = $2', [JSON.stringify(derived), row.id]);
                  }

                  characterHpData[String(row.id)] = {
                    current: row.hit_points,
                    max: row.max_hp,
                    limbHealth,
                    tempLimbHealth: row.temp_limb_health ?? null,
                    hitDiceRemaining: row.hit_dice_remaining,
                  };
                }
              }
            } catch (e) { console.warn('Could not fetch character HP for sync:', e.message); }
            // Fetch monster templates for active combat monsters (sent to all clients so players
            // see correct AC and max HP even if visible_to_players is false)
            const combatMonsterTemplates = {};
            try {
              const MonsterModel = require('./models/Monster');
              const monsterCombatantsForTemplates = battleCombatState[campaignId].combatants.filter(c => c.isMonster && c.monsterId);
              const uniqueMonsterIds = [...new Set(monsterCombatantsForTemplates.map(c => c.monsterId))];
              for (const mid of uniqueMonsterIds) {
                const template = await MonsterModel.findById(mid);
                if (template) {
                  // Only send essential fields for display (no image data to keep payload small)
                  combatMonsterTemplates[String(mid)] = {
                    id: template.id,
                    name: template.name,
                    image_url: template.image_url,
                    limb_health: template.limb_health,
                    limb_ac: template.limb_ac,
                    cr: template.cr,
                    resistances: template.resistances,
                  };
                }
              }
            } catch (e) { console.warn('Could not fetch monster templates for sync:', e.message); }
            socket.emit('battleCombatSync', {
              combatants: battleCombatState[campaignId].combatants,
              initiativeOrder: battleCombatState[campaignId].initiativeOrder,
              currentTurnIndex: battleCombatState[campaignId].currentTurnIndex,
              log,
              monsterHpData,
              characterHpData,
              combatMonsterTemplates,
              darknessLevel: battleDarknessState[campaignId] ?? 0,
              dotConditions: battleDotState[campaignId] ?? {},
              activeMapId: activeBattleMapState[campaignId] ?? null,
              activeBattlefieldMapId: activeBattlefieldMapState[campaignId] ?? null,
            });
            // Send fresh action economy and conditions from DB so they survive page refreshes
            try {
              const dbCombatants = await CombatSession.getCombatants(battleCombatState[campaignId].sessionId);
              const conditionsData = {};
              dbCombatants.forEach(c => {
                const rawConds = c.conditions;
                conditionsData[String(c.combatant_key)] = Array.isArray(rawConds)
                  ? rawConds
                  : (typeof rawConds === 'string' ? JSON.parse(rawConds) : []);
              });
              socket.emit('actionEconomyUpdated', { combatants: dbCombatants, campaignId });
              socket.emit('conditionsBulkSync', { conditionsData, campaignId });
            } catch (syncErr) { console.warn('Could not sync economy/conditions on join:', syncErr.message); }
            console.log(`⚔️ Sent combat state to user ${socket.id} for campaign ${campaignId}`);
          }

          // Anti-cheat: re-send any pending dice roll to this user if they just reconnected
          if (socket.userId && battleRollState[campaignId]) {
            for (const [reqId, rollEntry] of Object.entries(battleRollState[campaignId])) {
              if (rollEntry.targetPlayerId !== socket.userId) continue;
              if (rollEntry.status === 'pending') {
                // Attack or generic roll not yet started — resend the original config
                socket.emit(rollEntry.type, rollEntry.config);
                console.log(`🔒 Re-sent pending roll ${reqId} to reconnected user ${socket.userId}`);
              } else if (rollEntry.status === 'hit_submitted') {
                // Player submitted hit roll, DM hasn't approved yet — restore awaiting-approval state
                socket.emit('restoreAttackState', {
                  config: rollEntry.config,
                  phase: 'awaiting_approval',
                  hitTotal: rollEntry.hitTotal,
                });
                console.log(`🔒 Restored hit_submitted state for ${reqId} to user ${socket.userId}`);
              } else if (rollEntry.status === 'damage_pending') {
                // DM approved hit roll, player needs to roll damage — restore damage phase
                socket.emit('restoreAttackState', {
                  config: rollEntry.config,
                  phase: 'damage',
                  hitTotal: rollEntry.hitTotal,
                });
                console.log(`🔒 Restored damage_pending state for ${reqId} to user ${socket.userId}`);
              }
            }
          }

          // Restore active battle map from DB if not already in memory
          if (activeBattleMapState[campaignId] === undefined || activeBattlefieldMapState[campaignId] === undefined) {
            try {
              const mapRes = await pool.query(
                `SELECT active_map_id, active_battlefield_map_id FROM campaigns WHERE id = $1`,
                [campaignId]
              );
              if (activeBattleMapState[campaignId] === undefined) {
                activeBattleMapState[campaignId] = mapRes.rows[0]?.active_map_id ?? null;
              }
              if (activeBattlefieldMapState[campaignId] === undefined) {
                activeBattlefieldMapState[campaignId] = mapRes.rows[0]?.active_battlefield_map_id ?? null;
              }
            } catch (mapErr) {
              console.warn('Could not load active maps from DB:', mapErr.message);
              if (activeBattleMapState[campaignId] === undefined) activeBattleMapState[campaignId] = null;
              if (activeBattlefieldMapState[campaignId] === undefined) activeBattlefieldMapState[campaignId] = null;
            }
          }
          // Send current maps to the joining socket when no combat state exists
          if (!battleCombatState[campaignId]) {
            if (activeBattleMapState[campaignId] != null) {
              socket.emit('activeMapChanged', { campaignId, mapId: activeBattleMapState[campaignId], mapType: 'combat', timestamp: new Date().toISOString() });
            }
          }
          if (activeBattlefieldMapState[campaignId] != null) {
            socket.emit('activeMapChanged', { campaignId, mapId: activeBattlefieldMapState[campaignId], mapType: 'battlefield', timestamp: new Date().toISOString() });
          }

          // Restore party group from DB if not already in memory
          if (!partyGroupState[campaignId]) {
            try {
              const pgRes = await pool.query(
                'SELECT party_member_ids, party_position FROM campaigns WHERE id = $1',
                [campaignId]
              );
              if (pgRes.rows.length > 0) {
                let rawIds = pgRes.rows[0].party_member_ids || [];

                // Filter out IDs of characters that have since been deleted
                if (rawIds.length > 0) {
                  const validRes = await pool.query(
                    'SELECT id FROM characters WHERE id = ANY($1::int[]) AND campaign_id = $2',
                    [rawIds, campaignId]
                  );
                  const validIds = new Set(validRes.rows.map(r => r.id));
                  const filteredIds = rawIds.filter(id => validIds.has(id));

                  // If stale IDs were found, persist the cleaned list back to DB
                  if (filteredIds.length !== rawIds.length) {
                    rawIds = filteredIds;
                    pool.query(
                      'UPDATE campaigns SET party_member_ids = $1 WHERE id = $2',
                      [JSON.stringify(filteredIds), campaignId]
                    ).catch(err => console.warn('Could not clean stale party_member_ids:', err.message));
                  }
                }

                partyGroupState[campaignId] = {
                  partyMemberIds: rawIds,
                  partyPosition: pgRes.rows[0].party_position || { x: 50, y: 50 }
                };
              }
            } catch (dbErr) {
              console.warn('Could not load party group from DB:', dbErr.message);
            }
          }
          if (partyGroupState[campaignId]) {
            socket.emit('partyGroupSync', {
              partyMemberIds: partyGroupState[campaignId].partyMemberIds,
              partyPosition: partyGroupState[campaignId].partyPosition
            });
            console.log(`👥 Sent party grouping state to user ${socket.id} for campaign ${campaignId}`);
          }
        } catch (error) {
          console.error(`Error joining campaign ${campaignId}:`, error);
        }
      });
      
      // Leave campaign room
      socket.on('leaveCampaign', (campaignId) => {
        try {
          socket.leave(`campaign_${campaignId}`);
          // Update presence tracking
          if (socket.userId && campaignPresence[campaignId]) {
            campaignPresence[campaignId].delete(socket.userId);
            io.to(`campaign_${campaignId}`).emit('campaignUsersOnline', {
              campaignId,
              onlineUserIds: Array.from(campaignPresence[campaignId])
            });
          }
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

          // Update server-side movement state (authoritative) — store full position + movement
          battleMovementState[campaignId][characterId] = { x, y, remainingMovement };

          // Persist position to DB so it survives server restarts
          const session = battleCombatState[campaignId];
          if (session?.sessionId) {
            pool.query(
              'UPDATE combat_combatants SET position_x = $1, position_y = $2, remaining_movement = $3 WHERE session_id = $4 AND combatant_key = $5 AND is_active = TRUE',
              [x, y, remainingMovement, session.sessionId, String(characterId)]
            ).catch(err => console.warn('Could not persist position to DB:', err.message));
          }

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

      // Handle party group membership updates
      socket.on('partyGroupUpdate', async (data) => {
        try {
          const { campaignId, partyMemberIds, partyPosition } = data;
          partyGroupState[campaignId] = {
            partyMemberIds: Array.isArray(partyMemberIds) ? partyMemberIds : [],
            partyPosition: partyPosition || partyGroupState[campaignId]?.partyPosition || { x: 50, y: 50 }
          };

          io.to(`campaign_${campaignId}`).emit('partyGroupUpdated', {
            partyMemberIds: partyGroupState[campaignId].partyMemberIds,
            partyPosition: partyGroupState[campaignId].partyPosition,
            timestamp: new Date().toISOString()
          });

          // Persist to database
          try {
            await pool.query(
              'UPDATE campaigns SET party_member_ids = $1, party_position = $2 WHERE id = $3',
              [
                JSON.stringify(partyGroupState[campaignId].partyMemberIds),
                JSON.stringify(partyGroupState[campaignId].partyPosition),
                campaignId
              ]
            );
          } catch (dbErr) {
            console.warn('Could not persist party group update:', dbErr.message);
          }

          console.log(`👥 Party group updated in campaign ${campaignId}: ${partyGroupState[campaignId].partyMemberIds.length} members`);
        } catch (error) {
          console.error('Error handling party group update:', error);
        }
      });

      // Handle party token movement
      socket.on('partyGroupMove', async (data) => {
        try {
          const { campaignId, x, y } = data;

          if (!partyGroupState[campaignId]) {
            partyGroupState[campaignId] = {
              partyMemberIds: [],
              partyPosition: { x: 50, y: 50 }
            };
          }

          partyGroupState[campaignId].partyPosition = { x, y };

          io.to(`campaign_${campaignId}`).emit('partyGroupMoved', {
            x,
            y,
            timestamp: new Date().toISOString()
          });

          // Persist position to database
          try {
            await pool.query(
              'UPDATE campaigns SET party_position = $1 WHERE id = $2',
              [JSON.stringify({ x, y }), campaignId]
            );
          } catch (dbErr) {
            console.warn('Could not persist party position:', dbErr.message);
          }

          console.log(`👥 Party token moved in campaign ${campaignId} to (${x.toFixed(2)}, ${y.toFixed(2)})`);
        } catch (error) {
          console.error('Error handling party group movement:', error);
        }
      });

      // Handle campaign score updates (DM adjusts a player score)
      socket.on('campaignScoreUpdate', (data) => {
        try {
          const { campaignId, playerId, scores } = data;
          io.to(`campaign_${campaignId}`).emit('campaignScoreUpdated', {
            playerId,
            scores,
            timestamp: new Date().toISOString()
          });
          console.log(`🏆 Score updated for player ${playerId} in campaign ${campaignId}`);
        } catch (error) {
          console.error('Error broadcasting campaign score update:', error);
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

          // Get or create a combat session for this campaign
          let session = battleCombatState[campaignId];
          if (!session) {
            // Check DB first
            let dbSession = await CombatSession.findActiveByCampaign(campaignId);
            if (!dbSession) {
              // Fresh combat — clean up stale monster instances so counter resets
              const MonsterInstanceCleanup = require('./models/MonsterInstance');
              try { await MonsterInstanceCleanup.deleteAllByCampaign(campaignId); } catch (e) { console.warn('Could not clean up stale monster instances:', e.message); }
              dbSession = await CombatSession.create(campaignId);
            }
            session = {
              sessionId: dbSession.id,
              combatants: [],
              initiativeOrder: [],
              currentTurnIndex: -1,
            };
            battleCombatState[campaignId] = session;
          }

          if (isMonster) {
            const Monster = require('./models/Monster');
            const MonsterInstance = require('./models/MonsterInstance');

            const monster = await Monster.findById(characterId);
            if (!monster) { console.warn(`Monster ${characterId} not found for combat`); return; }

            const instanceNumber = await MonsterInstance.getNextInstanceNumber(monster.id, campaignId);
            const roll = Math.floor(Math.random() * 20) + 1;
            const monsterInstance = await MonsterInstance.create({
              monster_id: monster.id,
              campaign_id: campaignId,
              instance_number: instanceNumber,
              current_limb_health: monster.limb_health,
              initiative: roll,
            });

            const monsterSpeed = monster.movement_speed || 30;
            const combatantKey = String(monsterInstance.id);
            const combatantName = `${monster.name} #${instanceNumber}`;

            // Persist to DB
            await CombatSession.addCombatant({
              session_id: session.sessionId,
              monster_instance_id: monsterInstance.id,
              combatant_key: combatantKey,
              name: combatantName,
              player_id: targetPlayerId,
              initiative: roll,
              movement_speed: monsterSpeed,
              is_monster: true,
            });

            // Update cache
            const newCombatant = {
              characterId: combatantKey,
              dbId: null,
              monsterInstanceId: monsterInstance.id,
              monsterId: monster.id,
              playerId: targetPlayerId,
              name: combatantName,
              initiative: roll,
              movement_speed: monsterSpeed,
              isMonster: true,
              instanceNumber,
            };
            session.combatants.push(newCombatant);

            // Add monster to movement state with a default position so it appears on the map
            if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
            if (!battleMovementState[campaignId][combatantKey]) {
              const existingCount = session.combatants.length - 1; // monsters added so far (current is last)
              battleMovementState[campaignId][combatantKey] = {
                x: 70 + (existingCount % 4) * 8,
                y: 15 + Math.floor(existingCount / 4) * 15,
                remainingMovement: monsterSpeed,
              };
            }

            session.initiativeOrder = session.combatants
              .slice().sort((a, b) => b.initiative - a.initiative)
              .map(c => c.characterId);

            io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
              combatants: session.combatants,
              initiativeOrder: session.initiativeOrder,
              currentTurnIndex: session.currentTurnIndex,
              timestamp: new Date().toISOString(),
            });
            console.log(`🐉 Monster ${combatantName} added to combat in campaign ${campaignId} (initiative: ${roll})`);
          } else {
            // Regular player character invite — also fetch battle pets
            let battlePets = [];
            try {
              const petResult = await pool.query(
                'SELECT id, name, species, hit_points, hit_points_current, armor_class, speed, abilities FROM character_pets WHERE character_id = $1 AND is_battle_pet = TRUE',
                [characterId]
              );
              battlePets = petResult.rows.map(p => ({
                ...p,
                abilities: typeof p.abilities === 'string' ? JSON.parse(p.abilities) : (p.abilities || {}),
              }));
            } catch (petErr) {
              console.warn('Could not fetch battle pets for invite:', petErr.message);
            }

            io.to(`campaign_${campaignId}`).emit('combatInvite', {
              campaignId,
              characterId,
              targetPlayerId,
              battlePets,
              timestamp: new Date().toISOString(),
            });
            console.log(`📣 Combat invite sent for character ${characterId} in campaign ${campaignId} (${battlePets.length} battle pet(s) included)`);
          }
        } catch (error) {
          console.error('Error sending combat invite:', error);
        }
      });

      // Player accepts an invite to combat
      socket.on('acceptCombatInvite', async (data) => {
        console.log('🚀 acceptCombatInvite called:', JSON.stringify(data));
        try {
          const { campaignId, characterId, playerId, selectedPetIds = [] } = data;

          // Get or create a combat session
          let session = battleCombatState[campaignId];
          if (!session) {
            let dbSession = await CombatSession.findActiveByCampaign(campaignId);
            if (!dbSession) dbSession = await CombatSession.create(campaignId);
            session = { sessionId: dbSession.id, combatants: [], initiativeOrder: [], currentTurnIndex: -1 };
            battleCombatState[campaignId] = session;
          }

          const character = await Character.findById(characterId);
          if (!character) { console.warn(`Character ${characterId} not found for combat`); return; }

          // Roll initiative: d20 + dex modifier
          const roll = Math.floor(Math.random() * 20) + 1;
          const dex = character.abilities?.dex ?? 10;
          const dexMod = Character.getAbilityModifier(dex);
          const initiative = roll + dexMod;

          const movementSpeed = character.movement_speed || 30;
          const combatantKey = String(characterId);

          // Check if character has an equipped mount (is_equipped = true)
          let isMounted = false;
          let mountId = null;
          let mountCurrentHp = null;
          let effectiveMovementSpeed = movementSpeed;
          try {
            const mountResult = await pool.query(
              `SELECT * FROM campaign_mounts WHERE assigned_to_character_id = $1 AND is_equipped = true LIMIT 1`,
              [characterId]
            );
            if (mountResult.rows.length > 0) {
              const mount = mountResult.rows[0];
              isMounted = true;
              mountId = mount.id;
              mountCurrentHp = mount.hp;
              effectiveMovementSpeed = mount.speed || movementSpeed;
            }
          } catch (mountErr) {
            console.error('Error checking equipped mount:', mountErr);
          }

          // Persist combatant to DB
          await CombatSession.addCombatant({
            session_id: session.sessionId,
            character_id: character.id,
            combatant_key: combatantKey,
            name: character.name,
            player_id: playerId,
            initiative,
            movement_speed: effectiveMovementSpeed,
            position_x: character.battle_position_x || 50,
            position_y: character.battle_position_y || 50,
            is_mounted: isMounted,
            mount_id: mountId,
            mount_current_hp: mountCurrentHp,
          });

          // Mark as in combat in DB
          await pool.query('UPDATE characters SET combat_active = TRUE WHERE id = $1', [characterId]);

          // Update movement state cache
          if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
          battleMovementState[campaignId][combatantKey] = effectiveMovementSpeed;

          const newCombatant = {
            characterId: combatantKey,
            playerId,
            name: character.name,
            initiative,
            movement_speed: effectiveMovementSpeed,
            isMounted,
            mountId,
            mountCurrentHp,
          };
          session.combatants.push(newCombatant);

          // Beast companion logic for Primal Bond
          console.log(`🔍 Checking Primal Bond for ${character.name} (class: "${character.class}")`);
          if (character.class === 'Primal Bond') {
            try {
              const beastResult = await pool.query('SELECT * FROM character_beasts WHERE character_id = $1', [characterId]);
              if (beastResult.rows.length > 0) {
                const beast = beastResult.rows[0];
                const level = character.level;
                let shouldAddBeast = false;
                if ((beast.beast_type === 'Cheetah' || beast.beast_type === 'Leopard') && level >= 3) shouldAddBeast = true;
                else if ((beast.beast_type === 'AlphaWolf' || beast.beast_type === 'OmegaWolf') && level >= 6) shouldAddBeast = true;
                else if ((beast.beast_type === 'Elephant' || beast.beast_type === 'Owlbear') && level >= 10) shouldAddBeast = true;

                if (shouldAddBeast) {
                  const beastName = beast.beast_name || beast.beast_type;
                  const beastSpeed = beast.speed || 30;
                  const beastKey = `beast_${characterId}`;

                  await CombatSession.addCombatant({
                    session_id: session.sessionId,
                    combatant_key: beastKey,
                    name: `${beastName} (Companion)`,
                    player_id: playerId,
                    initiative,
                    movement_speed: beastSpeed,
                    is_beast: true,
                    owner_character_id: character.id,
                  });
                  battleMovementState[campaignId][beastKey] = beastSpeed;
                  session.combatants.push({
                    characterId: beastKey,
                    playerId,
                    name: `${beastName} (Companion)`,
                    initiative,
                    movement_speed: beastSpeed,
                    isBeast: true,
                    ownerId: character.id,
                  });
                  console.log(`🐾 Beast companion ${beastName} added to combat`);
                }
              }
            } catch (beastErr) {
              console.error('Error adding beast companion:', beastErr);
            }
          }

          // Battle pets — add each selected pet as its own combatant (DM-controlled)
          if (selectedPetIds && selectedPetIds.length > 0) {
            try {
              for (const petId of selectedPetIds) {
                const petResult = await pool.query(
                  'SELECT * FROM character_pets WHERE id = $1 AND character_id = $2 AND is_battle_pet = TRUE',
                  [petId, characterId]
                );
                if (petResult.rows.length === 0) continue;
                const pet = petResult.rows[0];
                const petAbilities = typeof pet.abilities === 'string' ? JSON.parse(pet.abilities) : (pet.abilities || {});
                const petDex = petAbilities.dex ?? 10;
                const petDexMod = Math.floor((petDex - 10) / 2);
                const petInitiative = Math.floor(Math.random() * 20) + 1 + petDexMod;
                const petSpeed = pet.speed || 30;
                const petKey = `pet_${pet.id}`;

                await CombatSession.addCombatant({
                  session_id: session.sessionId,
                  combatant_key: petKey,
                  name: `${pet.name} (Pet)`,
                  player_id: null,
                  initiative: petInitiative,
                  movement_speed: petSpeed,
                  is_pet: true,
                  pet_id: pet.id,
                  owner_character_id: character.id,
                });

                if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
                battleMovementState[campaignId][petKey] = petSpeed;

                session.combatants.push({
                  characterId: petKey,
                  playerId: null,
                  name: `${pet.name} (Pet)`,
                  initiative: petInitiative,
                  movement_speed: petSpeed,
                  isPet: true,
                  petId: pet.id,
                  ownerId: character.id,
                });
                console.log(`🐾 Battle pet "${pet.name}" added to combat (initiative: ${petInitiative})`);
              }
            } catch (petErr) {
              console.error('Error adding battle pets to combat:', petErr);
            }
          }

          // Sort initiative order
          session.initiativeOrder = session.combatants
            .slice().sort((a, b) => b.initiative - a.initiative)
            .map(c => c.characterId);

          io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
            combatants: session.combatants,
            initiativeOrder: session.initiativeOrder,
            currentTurnIndex: session.currentTurnIndex,
            timestamp: new Date().toISOString(),
          });
          console.log(`🛡️ ${character.name} added to combat in campaign ${campaignId} (initiative: ${initiative})`);
        } catch (error) {
          console.error('Error accepting combat invite:', error);
        }
      });

      // Advance to next turn in initiative order (DM action)
      socket.on('nextTurn', async (data) => {
        try {
          const { campaignId } = data;
          const session = battleCombatState[campaignId];
          if (!session || !session.initiativeOrder || session.initiativeOrder.length === 0) {
            console.warn('No combat state for campaign', campaignId);
            return;
          }

          // Conditions that cause turn to auto-skip
          const SKIP_CONDITIONS = ['stunned', 'incapacitated', 'paralyzed', 'unconscious', 'petrified', 'dead'];

          // Helper: advance index
          const advanceIndex = (idx) => {
            if (idx === -1) return 0;
            return (idx + 1) % session.initiativeOrder.length;
          };

          // Advance at least once
          session.currentTurnIndex = advanceIndex(session.currentTurnIndex);
          if (session.currentTurnIndex === 0 && session.combatants.length > 0) {
            console.log(`⚔️ Starting/looping combat round in campaign ${campaignId}`);
          }

          // Skip stunned/dead combatants (max one full loop to avoid infinite skip)
          let skipped = 0;
          while (skipped < session.initiativeOrder.length) {
            const key = session.initiativeOrder[session.currentTurnIndex];
            const c = session.combatants.find(c => c.characterId === key);
            const conditions = (c?.conditions ?? []).map(s => s.toLowerCase());
            const skipReason = c?.isDead ? 'dead' : conditions.find(s => SKIP_CONDITIONS.includes(s));

            if (!skipReason) break;

            // Notify clients this turn is being skipped
            io.to(`campaign_${campaignId}`).emit('turnSkipped', {
              characterId: key,
              characterName: c?.name || key,
              reason: skipReason.charAt(0).toUpperCase() + skipReason.slice(1),
              campaignId,
              timestamp: new Date().toISOString(),
            });
            console.log(`⏭️ Skipping ${c?.name || key} (${skipReason}) in campaign ${campaignId}`);

            session.currentTurnIndex = advanceIndex(session.currentTurnIndex);
            skipped++;
          }

          const currentCombatantKey = session.initiativeOrder[session.currentTurnIndex];
          const combatant = session.combatants.find(c => c.characterId === currentCombatantKey);
          // Grappled or Restrained combatants have 0 movement this turn
          const combatantConditions = (combatant?.conditions ?? []).map(s => s.toLowerCase());
          const isMovementLocked = combatantConditions.includes('grappled') || combatantConditions.includes('restrained');
          const movementSpeed = isMovementLocked ? 0 : (combatant ? combatant.movement_speed : 30);

          // Persist new turn index
          await CombatSession.updateTurnIndex(session.sessionId, session.currentTurnIndex);

          // Reset action economy + movement for the combatant now taking their turn
          if (session.sessionId) {
            await CombatSession.resetTurnEconomy(session.sessionId, currentCombatantKey);
            // Broadcast the reset economy to all clients so A/BA/R buttons update
            const allCombatantsForEconomy = await CombatSession.getCombatants(session.sessionId);
            io.to(`campaign_${campaignId}`).emit('actionEconomyUpdated', {
              combatants: allCombatantsForEconomy,
              campaignId,
              timestamp: new Date().toISOString(),
            });
          }

          // Update movement cache
          if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
          battleMovementState[campaignId][currentCombatantKey] = movementSpeed;

          // Broadcast turn advance
          io.to(`campaign_${campaignId}`).emit('turnAdvanced', {
            currentCharacterId: currentCombatantKey,
            initiativeOrder: session.initiativeOrder,
            currentTurnIndex: session.currentTurnIndex,
            resetMovementFor: currentCombatantKey,
            movementSpeed,
            timestamp: new Date().toISOString(),
          });

          // Also emit turnStarted for player notification
          io.to(`campaign_${campaignId}`).emit('turnStarted', {
            currentCharacterId: currentCombatantKey,
            playerId: combatant?.playerId,
            characterName: combatant?.name || '',
            campaignId,
            timestamp: new Date().toISOString(),
          });

          // Emit DOT ticks for the current combatant; handle Burning auto-expiry after 3 turns
          const dotList = battleDotState[campaignId]?.[currentCombatantKey] ?? [];
          const expiredTypes = [];
          const remainingDots = [];
          for (const dot of dotList) {
            io.to(`campaign_${campaignId}`).emit('dotTick', {
              combatantKey: currentCombatantKey,
              combatantName: combatant?.name || String(currentCombatantKey),
              dotType: dot.type,
              fixedDamage: dot.fixedDamage ?? null,
              damageDice: dot.damageDice ?? null,
              requireRoll: dot.requireRoll ?? false,
              limbTarget: dot.limbTarget ?? 'chest',
              campaignId,
              timestamp: new Date().toISOString(),
            });
            if (dot.turnsRemaining !== null) {
              const newTurns = dot.turnsRemaining - 1;
              if (newTurns <= 0) {
                expiredTypes.push(dot.type);
              } else {
                remainingDots.push({ ...dot, turnsRemaining: newTurns });
              }
            } else {
              remainingDots.push(dot);
            }
          }
          if (battleDotState[campaignId]) {
            battleDotState[campaignId][currentCombatantKey] = remainingDots;
          }
          // Remove expired DOT conditions from the combatant's conditions array
          if (expiredTypes.length > 0) {
            io.to(`campaign_${campaignId}`).emit('dotConditionsUpdated', { combatantKey: currentCombatantKey, dotConditions: remainingDots, campaignId });
            try {
              if (session.sessionId) {
                const combatantRow = await CombatSession.getCombatantByKey(session.sessionId, currentCombatantKey);
                if (combatantRow) {
                  const newConditions = (combatantRow.conditions || []).filter(c => !expiredTypes.includes(c));
                  await CombatSession.updateCombatant(combatantRow.id, { conditions: newConditions });
                  const cached = session.combatants.find(c => c.characterId === currentCombatantKey);
                  if (cached) cached.conditions = newConditions;
                  io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey: currentCombatantKey, conditions: newConditions, campaignId });
                  for (const expired of expiredTypes) {
                    await CombatSession.addLogEntry({ session_id: session.sessionId, actor_name: 'System', action_type: 'condition', target_name: combatant?.name || String(currentCombatantKey), details: `${expired} condition expired` });
                  }
                  const log = await CombatSession.getLog(session.sessionId);
                  io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
                }
              }
            } catch (e) { console.warn('Error removing expired DOT conditions:', e.message); }
          }

          // Auto-remove 'Disengage' condition at the start of this combatant's turn
          try {
            if (session.sessionId) {
              const disengageRow = await CombatSession.getCombatantByKey(session.sessionId, currentCombatantKey);
              if (disengageRow) {
                // Safe parse: JSONB returns array, but guard against string in case of pg config variance
                const rawConds = disengageRow.conditions;
                const parsedConds = Array.isArray(rawConds)
                  ? rawConds
                  : (typeof rawConds === 'string' ? JSON.parse(rawConds) : []);
                console.log(`🔍 Disengage check for ${currentCombatantKey}: conditions=${JSON.stringify(parsedConds)}`);
                if (parsedConds.some(c => c.toLowerCase() === 'disengage')) {
                  const newConditions = parsedConds.filter(c => c.toLowerCase() !== 'disengage');
                  await CombatSession.updateCombatant(disengageRow.id, { conditions: newConditions });
                  const cached = session.combatants.find(c => String(c.characterId) === String(currentCombatantKey));
                  if (cached) cached.conditions = newConditions;
                  io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey: String(currentCombatantKey), conditions: newConditions, campaignId });
                  console.log(`✅ Disengage removed from ${currentCombatantKey}`);
                }
              } else {
                console.warn(`⚠️  Disengage check: no DB row found for key=${currentCombatantKey} session=${session.sessionId}`);
              }
            }
          } catch (e) { console.warn('Error removing Disengage condition:', e.message); }

          console.log(`➡️ Advanced turn in campaign ${campaignId} to ${currentCombatantKey} (index: ${session.currentTurnIndex})`);
        } catch (error) {
          console.error('Error advancing turn:', error);
        }
      });
      socket.on('resetCombat', async (data) => {
        try {
          const { campaignId } = data;
          const session = battleCombatState[campaignId];

          // End DB session (cascades to all combat_* tables)
          if (session?.sessionId) {
            await CombatSession.endSession(session.sessionId);
          }

          // Clear caches
          delete battleCombatState[campaignId];
          if (battleMovementState[campaignId]) delete battleMovementState[campaignId];
          if (battleDotState[campaignId]) delete battleDotState[campaignId];
          if (battleDarknessState[campaignId]) delete battleDarknessState[campaignId];
          if (activeBattleMapState[campaignId] !== undefined) delete activeBattleMapState[campaignId];

          // Reset characters in DB — also clear temp HP
          await pool.query('UPDATE characters SET combat_active = FALSE, initiative = 0, temp_limb_health = NULL WHERE campaign_id = $1', [campaignId]);

          // Remove monster instances
          const MonsterInstance = require('./models/MonsterInstance');
          await MonsterInstance.removeAllFromCombat(campaignId);
          try { await MonsterInstance.deleteAllByCampaign(campaignId); } catch (e) { console.warn('Could not delete monster instances:', e.message); }

          io.to(`campaign_${campaignId}`).emit('combatReset', { timestamp: new Date().toISOString() });
          console.log(`🔄 Combat reset for campaign ${campaignId}`);
        } catch (error) {
          console.error('Error resetting combat:', error);
        }
      });

      // Player requests an attack — notifies DM to configure dice
      socket.on('requestAttack', (data) => {
        try {
          const { campaignId, requestId, attackerKey, attackerName, targetKey, targetName } = data;
          // Forward to all DMs in this campaign room
          io.to(`campaign_${campaignId}`).emit('attackRequested', {
            requestId,
            campaignId,
            attackerKey,
            attackerName,
            targetKey,
            targetName,
          });
          console.log(`⚔️ Attack request from ${attackerName} targeting ${targetName} in campaign ${campaignId}`);
        } catch (error) {
          console.error('Error handling attack request:', error);
        }
      });

      // DM confirms attack dice — sends hit die + damage die back to the attacking player
      socket.on('confirmAttackDice', (data) => {
        try {
          const { campaignId, requestId, attackerKey, attackerName, targetKey, targetName, hitDie, damageDie, damageDiceGroups, dmName, targetPlayerId } = data;
          const session = battleCombatState[campaignId];
          if (!session) return;
          // Find the attacking combatant's player socket and send only to them
          const attacker = session.combatants.find(c => String(c.characterId) === String(attackerKey));
          const attackerPlayerId = attacker ? attacker.playerId : null;
          // Anti-cheat: record this pending roll so we can re-send on reconnect
          if (!battleRollState[campaignId]) battleRollState[campaignId] = {};
          battleRollState[campaignId][requestId] = {
            type: 'attackDiceConfig',
            status: 'pending',
            targetPlayerId: attackerPlayerId,
            config: { requestId, campaignId, attackerKey, attackerName, targetKey, targetName, hitDie, damageDie, damageDiceGroups: damageDiceGroups ?? null, dmName, attackerPlayerId },
          };
          // Emit to whole room — frontend filters by attackerKey
          io.to(`campaign_${campaignId}`).emit('attackDiceConfig', {
            requestId,
            campaignId,
            attackerKey,
            attackerName,
            targetKey,
            targetName,
            hitDie,
            damageDie,
            damageDiceGroups: damageDiceGroups ?? null,
            dmName,
            attackerPlayerId,
          });
          console.log(`⚔️ DM configured attack: ${hitDie} hit / ${damageDiceGroups ? damageDiceGroups.map(g => `${g.count}${g.diceType}`).join('+') : damageDie} damage for ${attackerName} vs ${targetName}`);
        } catch (error) {
          console.error('Error handling confirm attack dice:', error);
        }
      });

      // Apply damage to a combatant (DM action — real-time HP updates)
      socket.on('applyDamage', async (data) => {
        try {
          const { campaignId, targetKey, targetType, limbName, damage, attackerName } = data;
          const session = battleCombatState[campaignId];
          if (!session) return;

          let updatedHealthData = null;

          if (targetType === 'monster') {
            // targetKey is JSON string of monster instance id ("42")
            const instanceId = parseInt(targetKey, 10);
            const MonsterInstance = require('./models/MonsterInstance');
            const instance = await MonsterInstance.findById(instanceId);
            if (!instance) return;

            const limbHealth = { ...instance.current_limb_health };
            const validLimb = limbHealth[limbName] !== undefined ? limbName : 'chest';

            // Consume temp HP for this limb first before real HP
            const tempLimbHealth = instance.temp_limb_health ? { ...instance.temp_limb_health } : {};
            const tempAvailable = tempLimbHealth[validLimb] ?? 0;
            const tempAbsorbed = Math.min(tempAvailable, damage);
            tempLimbHealth[validLimb] = tempAvailable - tempAbsorbed;
            if (tempLimbHealth[validLimb] <= 0) delete tempLimbHealth[validLimb];
            const remainingDamage = damage - tempAbsorbed;

            // Apply remaining damage to real limb HP
            limbHealth[validLimb] = Math.max(0, (limbHealth[validLimb] || 0) - remainingDamage);

            // Vital hit: head or chest real HP reduced to 0 = instant death — zero all limbs
            const vitalKeys = ['head', 'chest'];
            const vitalKilled = vitalKeys.some(k => limbHealth[k] !== undefined && limbHealth[k] === 0);
            if (vitalKilled) {
              Object.keys(limbHealth).forEach(k => { limbHealth[k] = 0; });
            }

            const tempToStore = Object.keys(tempLimbHealth).length > 0 ? tempLimbHealth : null;
            await pool.query(
              'UPDATE monster_instances SET current_limb_health = $1, temp_limb_health = $2 WHERE id = $3',
              [JSON.stringify(limbHealth), tempToStore ? JSON.stringify(tempToStore) : null, instanceId]
            );

            const totalHP = Object.values(limbHealth).reduce((s, v) => s + v, 0);
            updatedHealthData = { type: 'monster', instanceId, limbHealth, tempLimbHealth: tempToStore, totalHP, isDead: totalHP <= 0 };

            if (totalHP <= 0) {
              await MonsterInstance.removeFromCombat(instanceId);
              // Mark in session cache so turn-skip logic works
              const cachedMonster = session.combatants.find(c => c.characterId === String(instanceId));
              if (cachedMonster) cachedMonster.isDead = true;
            }
          } else if (targetType === 'character') {
            const charId = parseInt(targetKey, 10);
            const character = await Character.findById(charId);
            if (!character) return;

            // Get or initialize per-limb health
            const isFirstInit = !character.limb_health;
            let limbHealth = character.limb_health ?? null;
            if (!limbHealth) {
              limbHealth = initCharacterLimbHealth(character);
            }

            // Consume temp HP for this limb first before real HP
            const validLimb = limbHealth[limbName] !== undefined ? limbName : 'chest';
            const tempLimbHealth = character.temp_limb_health ? { ...character.temp_limb_health } : {};
            const tempAvailable = tempLimbHealth[validLimb] ?? 0;
            const tempAbsorbed = Math.min(tempAvailable, damage);
            tempLimbHealth[validLimb] = tempAvailable - tempAbsorbed;
            if (tempLimbHealth[validLimb] <= 0) delete tempLimbHealth[validLimb];
            const remainingDamage = damage - tempAbsorbed;

            // Apply remaining damage to real limb HP
            limbHealth[validLimb] = Math.max(0, (limbHealth[validLimb] || 0) - remainingDamage);

            // Vital hit: head or chest real HP reduced to 0 = instant death — zero all limbs
            const vitalKeys = ['head', 'chest'];
            const vitalKilled = vitalKeys.some(k => limbHealth[k] !== undefined && limbHealth[k] === 0);
            if (vitalKilled) {
              Object.keys(limbHealth).forEach(k => { limbHealth[k] = 0; });
            }

            // Total HP = sum of real limb HPs
            const newHP = Math.max(0, Object.values(limbHealth).reduce((s, v) => s + Number(v), 0));
            const tempToStore = Object.keys(tempLimbHealth).length > 0 ? tempLimbHealth : null;

            if (isFirstInit) {
              // Preserve the base HP stat in hit_points_max so the UI can always compute limb maxes
              await pool.query(
                'UPDATE characters SET hit_points = $1, limb_health = $2, temp_limb_health = $3, hit_points_max = COALESCE(hit_points_max, $4) WHERE id = $5',
                [newHP, JSON.stringify(limbHealth), tempToStore ? JSON.stringify(tempToStore) : null, character.hit_points, charId]
              );
            } else {
              await pool.query(
                'UPDATE characters SET hit_points = $1, limb_health = $2, temp_limb_health = $3 WHERE id = $4',
                [newHP, JSON.stringify(limbHealth), tempToStore ? JSON.stringify(tempToStore) : null, charId]
              );
            }
            updatedHealthData = { type: 'character', characterId: charId, newHP, limbHealth, tempLimbHealth: tempToStore, isDead: newHP <= 0 };

            if (newHP <= 0 && session.sessionId) {
              if (vitalKilled) {
                // Vital hit = instant death — bypass death saves
                await CombatSession.upsertDeathSaves(session.sessionId, charId, { successes: 0, failures: 3, is_stable: false, is_dead: true });
                // Apply Dead condition
                const combatantKey = String(charId);
                const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
                if (combatant) {
                  const conditions = [...(combatant.conditions || []).filter(c => c !== 'Unconscious'), 'Dead'];
                  await CombatSession.updateCombatant(combatant.id, { conditions });
                  const cached = session.combatants.find(c => c.characterId === combatantKey);
                  if (cached) { cached.conditions = conditions; cached.isDead = true; }
                  io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey, conditions, campaignId });
                }
                io.to(`campaign_${campaignId}`).emit('characterDied', { characterId: charId, campaignId });
                const allSaves = await CombatSession.getDeathSaves(session.sessionId);
                io.to(`campaign_${campaignId}`).emit('deathSavesUpdated', { deathSaves: allSaves, campaignId });
              } else {
                const existing = await CombatSession.getDeathSavesForCharacter(session.sessionId, charId);
                if (!existing) {
                  await CombatSession.upsertDeathSaves(session.sessionId, charId, { successes: 0, failures: 0 });
                }
                io.to(`campaign_${campaignId}`).emit('characterDowned', { characterId: charId, campaignId });
              }
            }
          }

          // Add to combat log
          if (session.sessionId) {
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: attackerName || 'Unknown',
              action_type: 'damage',
              target_name: data.targetName || targetKey,
              limb_name: limbName,
              damage,
            });
          }
          const log = session.sessionId ? await CombatSession.getLog(session.sessionId) : [];
          io.to(`campaign_${campaignId}`).emit('healthUpdated', { ...updatedHealthData, campaignId, timestamp: new Date().toISOString() });
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log, timestamp: new Date().toISOString() });
        } catch (error) {
          console.error('Error applying damage:', error);
        }
      });

      // Apply a condition to a combatant
      socket.on('applyCondition', async (data) => {
        try {
          const { campaignId, combatantKey, condition, appliedBy } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (!combatant) return;

          let conditions = Array.isArray(combatant.conditions) ? combatant.conditions : [];
          if (!conditions.includes(condition)) conditions = [...conditions, condition];
          await CombatSession.updateCombatant(combatant.id, { conditions });

          // Update cache
          const cachedCombatant = session.combatants.find(c => c.characterId === combatantKey);
          if (cachedCombatant) cachedCombatant.conditions = conditions;

          await CombatSession.addLogEntry({ session_id: session.sessionId, actor_name: appliedBy, action_type: 'condition', target_name: combatant.name, details: `${condition} applied` });
          const log = await CombatSession.getLog(session.sessionId);
          io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey, conditions, campaignId });
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
        } catch (error) { console.error('Error applying condition:', error); }
      });

      // Remove a condition from a combatant
      socket.on('removeCondition', async (data) => {
        try {
          const { campaignId, combatantKey, condition } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (!combatant) return;

          let conditions = (Array.isArray(combatant.conditions) ? combatant.conditions : []).filter(c => c !== condition);
          await CombatSession.updateCombatant(combatant.id, { conditions });

          const cachedCombatant = session.combatants.find(c => c.characterId === combatantKey);
          if (cachedCombatant) cachedCombatant.conditions = conditions;

          io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey, conditions, campaignId });
        } catch (error) { console.error('Error removing condition:', error); }
      });

      // Apply a DOT (damage-over-time) condition to a combatant (DM action)
      socket.on('applyDotCondition', async (data) => {
        try {
          const { campaignId, combatantKey, combatantName, dotType, fixedDamage, damageDice, requireRoll, limbTarget } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          // Burning auto-expires after 3 turns; other DOTs persist indefinitely
          const turnsRemaining = dotType === 'Burning' ? 3 : null;

          if (!battleDotState[campaignId]) battleDotState[campaignId] = {};
          const existing = battleDotState[campaignId][combatantKey] ?? [];
          // Avoid duplicate DOT of same type
          const updated = existing.filter(d => d.type !== dotType);
          updated.push({ type: dotType, fixedDamage: fixedDamage ?? null, damageDice: damageDice ?? null, requireRoll: !!requireRoll, limbTarget: limbTarget ?? 'chest', turnsRemaining });
          battleDotState[campaignId][combatantKey] = updated;

          await CombatSession.addLogEntry({
            session_id: session.sessionId,
            actor_name: 'Dungeon Master',
            action_type: 'condition',
            target_name: combatantName,
            details: `${dotType} applied (${fixedDamage ? fixedDamage + ' dmg/turn' : (damageDice || 'roll') + ' dmg/turn'})`,
          });
          const log = await CombatSession.getLog(session.sessionId);
          io.to(`campaign_${campaignId}`).emit('dotConditionsUpdated', { combatantKey, dotConditions: updated, campaignId });
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
        } catch (error) { console.error('Error applying DOT condition:', error); }
      });

      // Remove a DOT condition from a combatant
      socket.on('removeDotCondition', async (data) => {
        try {
          const { campaignId, combatantKey, dotType } = data;
          if (battleDotState[campaignId]?.[combatantKey]) {
            battleDotState[campaignId][combatantKey] = battleDotState[campaignId][combatantKey].filter(d => d.type !== dotType);
          }
          const updated = battleDotState[campaignId]?.[combatantKey] ?? [];
          io.to(`campaign_${campaignId}`).emit('dotConditionsUpdated', { combatantKey, dotConditions: updated, campaignId });
        } catch (error) { console.error('Error removing DOT condition:', error); }
      });

      // DM sets darkness level for the campaign (0 = fully lit, 1 = pitch black)
      socket.on('setDarkness', (data) => {
        try {
          const { campaignId, darknessLevel } = data;
          const clamped = Math.max(0, Math.min(1, Number(darknessLevel) || 0));
          battleDarknessState[campaignId] = clamped;
          io.to(`campaign_${campaignId}`).emit('darknessUpdated', { darknessLevel: clamped, campaignId });
        } catch (error) { console.error('Error setting darkness:', error); }
      });

      // DM confirms DOT damage amount for a tick (fixed or after manual determination)
      socket.on('confirmDotDamage', async (data) => {
        try {
          const { campaignId, targetKey, targetType, combatantName, dotType, damage, limbTarget } = data;
          const session = battleCombatState[campaignId];
          if (!session) return;

          if (targetType === 'character') {
            const charId = parseInt(targetKey, 10);
            const character = await Character.findById(charId);
            if (!character) return;

            // Apply DOT damage to the specific limb (limb-based system)
            const isFirstInit = !character.limb_health;
            let limbHealth = character.limb_health ? { ...character.limb_health } : initCharacterLimbHealth(character);
            const validLimb = limbTarget && limbHealth[limbTarget] !== undefined ? limbTarget : 'chest';
            limbHealth[validLimb] = Math.max(0, (limbHealth[validLimb] || 0) - damage);

            // Vital hit check
            const vitalKilled = ['head', 'chest'].some(k => limbHealth[k] !== undefined && limbHealth[k] === 0);
            if (vitalKilled) Object.keys(limbHealth).forEach(k => { limbHealth[k] = 0; });

            const newHP = Math.max(0, Object.values(limbHealth).reduce((s, v) => s + Number(v), 0));
            if (isFirstInit) {
              await pool.query(
                'UPDATE characters SET hit_points = $1, limb_health = $2, hit_points_max = COALESCE(hit_points_max, $3) WHERE id = $4',
                [newHP, JSON.stringify(limbHealth), character.hit_points, charId]
              );
            } else {
              await pool.query('UPDATE characters SET hit_points = $1, limb_health = $2 WHERE id = $3', [newHP, JSON.stringify(limbHealth), charId]);
            }

            if (session.sessionId) {
              await CombatSession.addLogEntry({
                session_id: session.sessionId,
                actor_name: dotType,
                action_type: 'damage',
                target_name: combatantName,
                limb_name: validLimb,
                damage,
                details: `${dotType} deals ${damage} damage to ${validLimb}`,
              });
            }
            const updatedHealthData = { type: 'character', characterId: charId, newHP, limbHealth, isDead: newHP <= 0, campaignId };
            const log = session.sessionId ? await CombatSession.getLog(session.sessionId) : [];
            io.to(`campaign_${campaignId}`).emit('healthUpdated', { ...updatedHealthData, timestamp: new Date().toISOString() });
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
          } else if (targetType === 'monster') {
            const instanceId = parseInt(targetKey, 10);
            const MonsterInstance = require('./models/MonsterInstance');
            const instance = await MonsterInstance.findById(instanceId);
            if (!instance) return;
            const limbHealth = { ...instance.current_limb_health };
            const validLimb = limbTarget && limbHealth[limbTarget] !== undefined ? limbTarget : 'chest';
            limbHealth[validLimb] = Math.max(0, (limbHealth[validLimb] || 0) - damage);
            const vitalKilled = ['head', 'chest'].some(k => limbHealth[k] !== undefined && limbHealth[k] === 0);
            if (vitalKilled) Object.keys(limbHealth).forEach(k => { limbHealth[k] = 0; });
            await MonsterInstance.updateHealth(instanceId, limbHealth);
            const totalHP = Object.values(limbHealth).reduce((s, v) => s + v, 0);
            if (session.sessionId) {
              await CombatSession.addLogEntry({
                session_id: session.sessionId,
                actor_name: dotType,
                action_type: 'damage',
                target_name: combatantName,
                limb_name: validLimb,
                damage,
                details: `${dotType} deals ${damage} damage to ${validLimb}`,
              });
            }
            const updatedHealthData = { type: 'monster', instanceId, limbHealth, totalHP, isDead: totalHP <= 0 };
            const log = session.sessionId ? await CombatSession.getLog(session.sessionId) : [];
            io.to(`campaign_${campaignId}`).emit('healthUpdated', { ...updatedHealthData, timestamp: new Date().toISOString() });
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
          }
        } catch (error) { console.error('Error confirming DOT damage:', error); }
      });

      // Apply healing to a combatant (DM action)
      socket.on('applyHeal', async (data) => {
        try {
          const { campaignId, targetKey, targetType, targetName, limbName, healAmount, healerName } = data;
          const session = battleCombatState[campaignId];
          if (!session) return;

          let updatedHealthData = null;

          if (targetType === 'character') {
            const charId = parseInt(targetKey, 10);
            const character = await Character.findById(charId);
            if (!character) return;
            // Fetch max HP from DB (hit_points_max column or use current as max if not tracked)
            const maxHpResult = await pool.query(
              `SELECT CASE WHEN hit_points_max IS NULL OR hit_points_max <= 0 THEN GREATEST(hit_points, 1) ELSE hit_points_max END as max_hp
               FROM characters WHERE id = $1`,
              [charId]
            );
            const maxHp = maxHpResult.rows[0]?.max_hp ?? character.hit_points;

            // Get or initialize per-limb health
            const healIsFirstInit = !character.limb_health;
            let limbHealth = character.limb_health ? { ...character.limb_health } : initCharacterLimbHealth(character);

            // maxHp = COALESCE(hit_points_max, hit_points) = base HP stat, used for per-limb caps
            const limbMaxValues = initCharacterLimbHealth({ ...character, hit_points: maxHp });

            // Heal using priority order: head → chest → round-robin arms/legs (same as short rest)
            // Ensure all limb keys exist (null means full — fill with max)
            for (const limb of Object.keys(limbMaxValues)) {
              if (limbHealth[limb] == null) limbHealth[limb] = limbMaxValues[limb];
            }
            let remaining = healAmount;
            // Priority 1: vital limbs
            for (const limb of ['head', 'chest']) {
              if (remaining <= 0) break;
              const needed = limbMaxValues[limb] - limbHealth[limb];
              if (needed > 0) { const h = Math.min(needed, remaining); limbHealth[limb] += h; remaining -= h; }
            }
            // Priority 2: round-robin 1 HP at a time across arms/legs
            if (remaining > 0) {
              const others = ['left_arm', 'right_arm', 'left_leg', 'right_leg'];
              let pass = 0;
              while (remaining > 0 && pass < 1000) {
                pass++;
                let gave = 0;
                for (const limb of others) {
                  if (remaining <= 0) break;
                  if (limbHealth[limb] < limbMaxValues[limb]) { limbHealth[limb]++; remaining--; gave++; }
                }
                if (gave === 0) break;
              }
            }
            // If all limbs at max, use null (same convention as short rest / long rest)
            const allFull = Object.keys(limbMaxValues).every(l => limbHealth[l] >= limbMaxValues[l]);
            const limbHealthToStore = allFull ? null : limbHealth;

            // Total HP = sum of limb HPs (or maxHp if all full)
            const newHP = allFull ? maxHp : Math.max(0, Object.values(limbHealth).reduce((s, v) => s + Number(v), 0));

            if (healIsFirstInit) {
              await pool.query(
                'UPDATE characters SET hit_points = $1, limb_health = $2, hit_points_max = COALESCE(hit_points_max, $3) WHERE id = $4',
                [newHP, limbHealthToStore ? JSON.stringify(limbHealthToStore) : null, character.hit_points, charId]
              );
            } else {
              await pool.query('UPDATE characters SET hit_points = $1, limb_health = $2 WHERE id = $3', [newHP, limbHealthToStore ? JSON.stringify(limbHealthToStore) : null, charId]);
            }
            updatedHealthData = { type: 'character', characterId: charId, newHP, limbHealth: limbHealthToStore, isDead: false };
          } else if (targetType === 'monster') {
            const instanceId = parseInt(targetKey, 10);
            const MonsterInstance = require('./models/MonsterInstance');
            const instance = await MonsterInstance.findById(instanceId);
            if (!instance) return;
            const limbHealth = { ...instance.current_limb_health };
            const validLimb = limbHealth[limbName] !== undefined ? limbName : 'chest';
            // No max per-limb tracked — just add (DM responsibility for limits)
            limbHealth[validLimb] = (limbHealth[validLimb] || 0) + healAmount;
            await MonsterInstance.updateHealth(instanceId, limbHealth);
            const totalHP = Object.values(limbHealth).reduce((s, v) => s + v, 0);
            updatedHealthData = { type: 'monster', instanceId, limbHealth, totalHP, isDead: false };
          }

          if (session.sessionId && updatedHealthData) {
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: healerName || 'Dungeon Master',
              action_type: 'heal',
              target_name: targetName,
              limb_name: null,
              damage: -healAmount,
              details: `Healed ${healAmount} HP (distributed by priority)`,
            });
          }
          const log = session.sessionId ? await CombatSession.getLog(session.sessionId) : [];
          if (updatedHealthData) {
            io.to(`campaign_${campaignId}`).emit('healthUpdated', { ...updatedHealthData, campaignId, timestamp: new Date().toISOString() });
          }
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log, timestamp: new Date().toISOString() });
        } catch (error) { console.error('Error applying heal:', error); }
      });

      // ─── Apply Temporary HP: DM assigns temp HP distributed across limbs ───
      socket.on('applyTempHealth', async (data) => {
        try {
          const { campaignId, targetKey, targetType, targetName, amount } = data;
          const session = battleCombatState[campaignId];
          if (!session || !amount || amount <= 0) return;

          // Distribute evenly across 6 limbs, remainder goes to head first, then chest, etc.
          const LIMB_ORDER = ['head', 'chest', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
          const base = Math.floor(amount / 6);
          const remainder = amount - base * 6;
          const distribution = {};
          LIMB_ORDER.forEach((limb, idx) => {
            distribution[limb] = base + (idx < remainder ? 1 : 0);
          });

          let updatedHealthData = null;

          if (targetType === 'character') {
            const charId = parseInt(targetKey, 10);
            const row = await pool.query('SELECT temp_limb_health FROM characters WHERE id = $1', [charId]);
            if (!row.rows[0]) return;
            const existing = row.rows[0].temp_limb_health || {};
            const newTemp = { ...existing };
            LIMB_ORDER.forEach(limb => {
              newTemp[limb] = (newTemp[limb] || 0) + distribution[limb];
            });
            await pool.query('UPDATE characters SET temp_limb_health = $1 WHERE id = $2', [JSON.stringify(newTemp), charId]);
            updatedHealthData = { type: 'character', characterId: charId, tempLimbHealth: newTemp };
          } else if (targetType === 'monster') {
            const instanceId = parseInt(targetKey, 10);
            const MonsterInstance = require('./models/MonsterInstance');
            const instance = await MonsterInstance.findById(instanceId);
            if (!instance) return;
            const existing = instance.temp_limb_health || {};
            const newTemp = { ...existing };
            LIMB_ORDER.forEach(limb => {
              newTemp[limb] = (newTemp[limb] || 0) + distribution[limb];
            });
            await pool.query('UPDATE monster_instances SET temp_limb_health = $1 WHERE id = $2', [JSON.stringify(newTemp), instanceId]);
            const currentLimbHealth = instance.current_limb_health;
            const totalHP = Object.values(currentLimbHealth).reduce((s, v) => s + v, 0);
            updatedHealthData = { type: 'monster', instanceId, tempLimbHealth: newTemp, limbHealth: currentLimbHealth, totalHP, isDead: false };
          }

          if (session.sessionId && updatedHealthData) {
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: 'Dungeon Master',
              action_type: 'heal',
              target_name: targetName,
              limb_name: null,
              damage: -amount,
              details: `Assigned ${amount} temporary HP (distributed across limbs)`,
            });
          }
          if (updatedHealthData) {
            io.to(`campaign_${campaignId}`).emit('healthUpdated', { ...updatedHealthData, campaignId, timestamp: new Date().toISOString() });
          }
          const log = session.sessionId ? await CombatSession.getLog(session.sessionId) : [];
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log, timestamp: new Date().toISOString() });
        } catch (error) { console.error('Error applying temp health:', error); }
      });

      // ─── Short Rest: DM initiates, each player sees a hit-dice-spending prompt ───
      socket.on('initiateShortRest', async (data) => {
        try {
          const { campaignId } = data;
          const session = battleCombatState[campaignId];
          const charCombatants = session
            ? session.combatants.filter(c => !c.isMonster)
            : [];

          let charIds = charCombatants.map(c => parseInt(String(c.characterId), 10)).filter(id => !isNaN(id));

          // Fallback: if no combat session, fetch all campaign characters
          if (charIds.length === 0) {
            const campChars = await pool.query('SELECT id FROM characters WHERE campaign_id = $1', [parseInt(campaignId, 10)]);
            charIds = campChars.rows.map(r => r.id);
          }
          if (charIds.length === 0) return;

          const res = await pool.query(
            `SELECT id, name, hit_points,
                    CASE WHEN hit_points_max IS NULL OR hit_points_max <= 0 THEN GREATEST(hit_points, 1) ELSE hit_points_max END as max_hp,
                    level, class, abilities, player_id,
                    COALESCE(hit_dice_remaining, level) as hdr,
                    limb_health
             FROM characters WHERE id = ANY($1::int[])`,
            [charIds]
          );

          const characters = res.rows.map(ch => {
            const abilities = typeof ch.abilities === 'string' ? JSON.parse(ch.abilities) : (ch.abilities || {});
            const con = abilities.con ?? 10;
            const conMod = Math.floor((con - 10) / 2);
            const die = HIT_DICE_MAP[ch.class] ?? 8;
            const limbMax = initCharacterLimbHealth({ hit_points: ch.max_hp, abilities });
            const limbMaxTotal = Object.values(limbMax).reduce((s, v) => s + Number(v), 0);
            let limbCurrentTotal = limbMaxTotal;

            if (ch.limb_health) {
              const current = typeof ch.limb_health === 'string' ? JSON.parse(ch.limb_health) : ch.limb_health;
              limbCurrentTotal = Object.values(current || {}).reduce((s, v) => s + Number(v || 0), 0);
            } else if (Number(ch.max_hp) > 0) {
              limbCurrentTotal = Math.round((Number(ch.hit_points) / Number(ch.max_hp)) * limbMaxTotal);
            }

            return {
              characterId: ch.id,
              playerId: ch.player_id,
              name: ch.name,
              die,
              hitDiceRemaining: ch.hdr,
              currentHp: limbCurrentTotal,
              maxHp: limbMaxTotal,
              conMod,
            };
          });

          io.to(`campaign_${campaignId}`).emit('shortRestStarted', { campaignId, characters });

          // Immediately restore short-rest resources and notify all clients
          if (charIds.length > 0) {
            // Warlock pact magic & Monk ki recharge on short rest
            const warlockMonkResult = await pool.query(
              `UPDATE characters
               SET spell_slots_used = '{}'::jsonb,
                   ki_points_remaining = CASE WHEN class = 'Monk' THEN level ELSE ki_points_remaining END
               WHERE id = ANY($1::int[]) AND class IN ('Warlock', 'Monk')
               RETURNING id, class, ki_points_remaining`,
              [charIds]
            );
            for (const ch of warlockMonkResult.rows) {
              if (ch.class === 'Warlock') {
                io.to(`campaign_${campaignId}`).emit('spellSlotUpdated', { characterId: ch.id, spell_slots_used: {} });
              } else if (ch.class === 'Monk') {
                io.to(`campaign_${campaignId}`).emit('kiPointUpdated', { characterId: ch.id, ki_points_remaining: ch.ki_points_remaining });
              }
            }
            // Charlatan Tricks recharge on short rest
            const charlatanResult = await pool.query(
              `UPDATE characters SET tricks_used = 0
               WHERE id = ANY($1::int[]) AND class = 'Charlatan'
               RETURNING id`,
              [charIds]
            );
            for (const ch of charlatanResult.rows) {
              io.to(`campaign_${campaignId}`).emit('trickUpdated', { characterId: ch.id, tricks_used: 0 });
            }
            // Shadow Step recharges on short rest for Shadow Sovereign
            const shadowStepResult = await pool.query(
              `UPDATE characters SET shadow_step_used = 0
               WHERE id = ANY($1::int[]) AND class = 'Shadow Sovereign'
               RETURNING id, COALESCE(shadow_reap_used, 0) as shadow_reap_used`,
              [charIds]
            );
            for (const ch of shadowStepResult.rows) {
              io.to(`campaign_${campaignId}`).emit('shadowResourceUpdated', {
                characterId: ch.id,
                shadow_reap_used: ch.shadow_reap_used,
                shadow_step_used: 0,
              });
            }
          }
          console.log(`💤 Short rest initiated for campaign ${campaignId} (${characters.length} characters)`);
        } catch (error) { console.error('Error initiating short rest:', error); }
      });

      // ─── Short Rest: player spends hit dice (server rolls for them) ───
      socket.on('spendHitDice', async (data) => {
        try {
          const { campaignId, characterId, diceToSpend } = data;
          const charId = parseInt(characterId, 10);
          const res = await pool.query(
            `SELECT id, name, hit_points,
                    CASE WHEN hit_points_max IS NULL OR hit_points_max <= 0 THEN GREATEST(hit_points, 1) ELSE hit_points_max END as max_hp,
                    level, class, abilities, COALESCE(hit_dice_remaining, level) as hdr,
                    limb_health
             FROM characters WHERE id = $1`,
            [charId]
          );
          if (res.rows.length === 0) return;
          const ch = res.rows[0];
          const abilities = typeof ch.abilities === 'string' ? JSON.parse(ch.abilities) : (ch.abilities || {});
          const con = abilities.con ?? 10;
          const conMod = Math.floor((con - 10) / 2);
          const die = HIT_DICE_MAP[ch.class] ?? 8;
          const clampedDice = Math.min(Math.max(0, diceToSpend), ch.hdr);

          // Server rolls — player cannot influence or reroll
          const rolls = [];
          for (let i = 0; i < clampedDice; i++) {
            rolls.push(Math.floor(Math.random() * die) + 1);
          }
          const rawHealing = rolls.reduce((s, r) => s + r, 0) + clampedDice * conMod;
          const totalHealing = Math.max(0, rawHealing);
          const newHp = Math.min(ch.max_hp, ch.hit_points + totalHealing);
          const newRemaining = ch.hdr - clampedDice;

          // Heal limbs in priority order: head → chest → then split evenly across arms/legs
          let newLimbHealth = null;
          if (totalHealing > 0 && ch.limb_health) {
            const limbHealth = typeof ch.limb_health === 'string' ? JSON.parse(ch.limb_health) : ch.limb_health;
            const conBonus = Math.max(0, conMod * 0.1);
            const baseHP = ch.max_hp;
            const limbMax = {
              head:      Math.floor(baseHP * Math.min(1.0, 0.25 + conBonus)),
              chest:     Math.floor(baseHP * Math.min(2.0, 1.0  + conBonus)),
              left_arm:  Math.floor(baseHP * Math.min(1.0, 0.15 + conBonus)),
              right_arm: Math.floor(baseHP * Math.min(1.0, 0.15 + conBonus)),
              left_leg:  Math.floor(baseHP * Math.min(1.0, 0.40 + conBonus)),
              right_leg: Math.floor(baseHP * Math.min(1.0, 0.40 + conBonus)),
            };
            let remaining = totalHealing;
            const healed = { ...limbHealth };
            // Ensure all limb keys exist (NULL means full)
            for (const limb of Object.keys(limbMax)) {
              if (healed[limb] == null) healed[limb] = limbMax[limb];
            }
            // Priority 1: vital limbs
            for (const limb of ['head', 'chest']) {
              if (remaining <= 0) break;
              const cur = healed[limb];
              const max = limbMax[limb];
              const needed = max - cur;
              if (needed > 0) { const h = Math.min(needed, remaining); healed[limb] = cur + h; remaining -= h; }
            }
            // Priority 2: split remaining evenly across limbs
            if (remaining > 0) {
              const others = ['left_arm', 'right_arm', 'left_leg', 'right_leg'];
              let pass = 0;
              while (remaining > 0 && pass < 100) {
                pass++;
                let gave = 0;
                for (const limb of others) {
                  if (remaining <= 0) break;
                  const cur = healed[limb]; const max = limbMax[limb];
                  if (cur < max) { healed[limb] = cur + 1; remaining--; gave++; }
                }
                if (gave === 0) break;
              }
            }
            // Check if all limbs are at max (set to NULL if so, same as long rest convention)
            const allFull = Object.keys(limbMax).every(l => (healed[l] ?? limbMax[l]) >= limbMax[l]);
            newLimbHealth = allFull ? null : JSON.stringify(healed);
          }

          if (newLimbHealth !== undefined) {
            await pool.query(
              'UPDATE characters SET hit_points = $1, hit_dice_remaining = $2, limb_health = $3 WHERE id = $4',
              [newHp, newRemaining, newLimbHealth, charId]
            );
          } else {
            await pool.query(
              'UPDATE characters SET hit_points = $1, hit_dice_remaining = $2 WHERE id = $3',
              [newHp, newRemaining, charId]
            );
          }

          const session = battleCombatState[campaignId];
          if (session?.sessionId && clampedDice > 0) {
            const rollStr = rolls.join(', ');
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: ch.name,
              action_type: 'heal',
              target_name: ch.name,
              damage: -totalHealing,
              details: `Short rest: rolled ${clampedDice}d${die} [${rollStr}] + CON(${conMod >= 0 ? '+' : ''}${conMod}) = ${totalHealing} HP healed`,
            });
            const log = await CombatSession.getLog(session.sessionId);
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
          }

          io.to(`campaign_${campaignId}`).emit('shortRestResult', {
            characterId: charId,
            name: ch.name,
            die,
            diceSpent: clampedDice,
            rolls,
            conMod,
            totalHealed: totalHealing,
            newHp,
            hitDiceRemaining: newRemaining,
            campaignId,
          });
          // Also emit healthUpdated so existing HP bars update
          io.to(`campaign_${campaignId}`).emit('healthUpdated', {
            type: 'character',
            characterId: charId,
            newHP: newHp,
            maxHP: ch.max_hp,
            limbHealth: newLimbHealth === null ? null : (typeof newLimbHealth === 'string' ? JSON.parse(newLimbHealth) : newLimbHealth),
            isDead: newHp <= 0,
            campaignId,
            timestamp: new Date().toISOString(),
          });
          console.log(`💤 ${ch.name} spent ${clampedDice}d${die} → +${totalHealing} HP (now ${newHp}/${ch.max_hp}), ${newRemaining} dice left`);
        } catch (error) { console.error('Error spending hit dice:', error); }
      });

      // ─── Long Rest: restore full HP + recover hit dice for all combatant characters ───
      socket.on('performLongRest', async (data) => {
        try {
          const { campaignId } = data;
          const session = battleCombatState[campaignId];
          // Always rest all campaign characters — a long rest restores everyone, not just active combatants
          const campChars = await pool.query('SELECT id FROM characters WHERE campaign_id = $1', [parseInt(campaignId, 10)]);
          const charIds = campChars.rows.map(r => r.id);
          if (charIds.length === 0) return;

          const res = await pool.query(
            `SELECT id, name,
                    CASE WHEN hit_points_max IS NULL OR hit_points_max <= 0 THEN GREATEST(hit_points, 1) ELSE hit_points_max END as max_hp,
                    level, class, COALESCE(hit_dice_remaining, level) as hdr
             FROM characters WHERE id = ANY($1::int[])`,
            [charIds]
          );

          const results = [];
          for (const ch of res.rows) {
            const recovered = Math.max(1, Math.floor(ch.level / 2));
            const newRemaining = Math.min(ch.level, ch.hdr + recovered);
            const kiRestored = ch.class === 'Monk' ? ch.level : null;
            // Long rest: full HP, clear limb damage, reset all spell slots, restore ki to full, reset class resources
            await pool.query(
              `UPDATE characters
               SET hit_points = $1, hit_dice_remaining = $2, limb_health = NULL,
                   hit_points_max = CASE WHEN hit_points_max IS NULL OR hit_points_max <= 0 THEN $1 ELSE hit_points_max END,
                   spell_slots_used = '{}'::jsonb,
                   ki_points_remaining = CASE WHEN class = 'Monk' THEN level ELSE ki_points_remaining END,
                   tricks_used = CASE WHEN class = 'Charlatan' THEN 0 ELSE tricks_used END,
                   shadow_reap_used = CASE WHEN class = 'Shadow Sovereign' THEN 0 ELSE shadow_reap_used END,
                   shadow_step_used = CASE WHEN class = 'Shadow Sovereign' THEN 0 ELSE shadow_step_used END
               WHERE id = $3`,
              [ch.max_hp, newRemaining, ch.id]
            );
            results.push({ characterId: ch.id, name: ch.name, newHp: ch.max_hp, hitDiceRemaining: newRemaining, kiRestored, class: ch.class });
            // Update live HP bars for each character
            io.to(`campaign_${campaignId}`).emit('healthUpdated', {
              type: 'character',
              characterId: ch.id,
              newHP: ch.max_hp,
              maxHP: ch.max_hp,
              limbHealth: null,
              isDead: false,
              campaignId,
              timestamp: new Date().toISOString(),
            });
            // Explicitly sync cleared spell slots and ki so all clients update regardless of local state
            io.to(`campaign_${campaignId}`).emit('spellSlotUpdated', { characterId: ch.id, spell_slots_used: {} });
            if (kiRestored != null) {
              io.to(`campaign_${campaignId}`).emit('kiPointUpdated', { characterId: ch.id, ki_points_remaining: kiRestored });
            }
            if (ch.class === 'Charlatan') {
              io.to(`campaign_${campaignId}`).emit('trickUpdated', { characterId: ch.id, tricks_used: 0 });
            }
            if (ch.class === 'Shadow Sovereign') {
              io.to(`campaign_${campaignId}`).emit('shadowResourceUpdated', { characterId: ch.id, shadow_reap_used: 0, shadow_step_used: 0 });
            }
          }

          if (session?.sessionId) {
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: 'Dungeon Master',
              action_type: 'heal',
              target_name: 'Party',
              details: `Long rest: all characters fully restored`,
            });
            const log = await CombatSession.getLog(session.sessionId);
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
          }

          io.to(`campaign_${campaignId}`).emit('longRestCompleted', { campaignId, results });
          console.log(`🌙 Long rest completed for campaign ${campaignId} (${results.length} characters restored)`);
        } catch (error) { console.error('Error performing long rest:', error); }
      });

      // ─── Spell Slot & Ki Point sync (DM or player toggles) ───
      socket.on('useSpellSlot', async (data) => {
        try {
          const { campaignId, characterId, slotLevel } = data;
          const result = await pool.query(
            `UPDATE characters
             SET spell_slots_used = jsonb_set(
               COALESCE(spell_slots_used, '{}'::jsonb),
               ARRAY[$1::text],
               (COALESCE((spell_slots_used->>$1)::int, 0) + 1)::text::jsonb
             )
             WHERE id = $2
             RETURNING spell_slots_used`,
            [String(slotLevel), characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('spellSlotUpdated', {
              characterId, spell_slots_used: result.rows[0].spell_slots_used
            });
          }
        } catch (error) { console.error('Error using spell slot:', error); }
      });

      socket.on('restoreSpellSlot', async (data) => {
        try {
          const { campaignId, characterId, slotLevel } = data;
          const result = await pool.query(
            `UPDATE characters
             SET spell_slots_used = jsonb_set(
               COALESCE(spell_slots_used, '{}'::jsonb),
               ARRAY[$1::text],
               GREATEST(0, COALESCE((spell_slots_used->>$1)::int, 0) - 1)::text::jsonb
             )
             WHERE id = $2
             RETURNING spell_slots_used`,
            [String(slotLevel), characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('spellSlotUpdated', {
              characterId, spell_slots_used: result.rows[0].spell_slots_used
            });
          }
        } catch (error) { console.error('Error restoring spell slot:', error); }
      });

      socket.on('useKiPoint', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters
             SET ki_points_remaining = GREATEST(0, COALESCE(ki_points_remaining, level) - 1)
             WHERE id = $1
             RETURNING ki_points_remaining`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('kiPointUpdated', {
              characterId, ki_points_remaining: result.rows[0].ki_points_remaining
            });
          }
        } catch (error) { console.error('Error using ki point:', error); }
      });

      socket.on('restoreKiPoint', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters
             SET ki_points_remaining = LEAST(level, COALESCE(ki_points_remaining, level) + 1)
             WHERE id = $1
             RETURNING ki_points_remaining`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('kiPointUpdated', {
              characterId, ki_points_remaining: result.rows[0].ki_points_remaining
            });
          }
        } catch (error) { console.error('Error restoring ki point:', error); }
      });

      // ─── Charlatan Tricks ───
      socket.on('useTrick', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters SET tricks_used = COALESCE(tricks_used, 0) + 1 WHERE id = $1 RETURNING tricks_used`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('trickUpdated', { characterId, tricks_used: result.rows[0].tricks_used });
          }
        } catch (error) { console.error('Error using trick:', error); }
      });

      socket.on('restoreTrick', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters SET tricks_used = GREATEST(0, COALESCE(tricks_used, 0) - 1) WHERE id = $1 RETURNING tricks_used`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('trickUpdated', { characterId, tricks_used: result.rows[0].tricks_used });
          }
        } catch (error) { console.error('Error restoring trick:', error); }
      });

      // ─── Shadow Sovereign Resources ───
      socket.on('useShadowReap', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters SET shadow_reap_used = COALESCE(shadow_reap_used, 0) + 1 WHERE id = $1
             RETURNING shadow_reap_used, COALESCE(shadow_step_used, 0) as shadow_step_used`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('shadowResourceUpdated', { characterId, shadow_reap_used: result.rows[0].shadow_reap_used, shadow_step_used: result.rows[0].shadow_step_used });
          }
        } catch (error) { console.error('Error using shadow reap:', error); }
      });

      socket.on('restoreShadowReap', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters SET shadow_reap_used = GREATEST(0, COALESCE(shadow_reap_used, 0) - 1) WHERE id = $1
             RETURNING shadow_reap_used, COALESCE(shadow_step_used, 0) as shadow_step_used`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('shadowResourceUpdated', { characterId, shadow_reap_used: result.rows[0].shadow_reap_used, shadow_step_used: result.rows[0].shadow_step_used });
          }
        } catch (error) { console.error('Error restoring shadow reap:', error); }
      });

      socket.on('useShadowStep', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters SET shadow_step_used = COALESCE(shadow_step_used, 0) + 1 WHERE id = $1
             RETURNING COALESCE(shadow_reap_used, 0) as shadow_reap_used, shadow_step_used`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('shadowResourceUpdated', { characterId, shadow_reap_used: result.rows[0].shadow_reap_used, shadow_step_used: result.rows[0].shadow_step_used });
          }
        } catch (error) { console.error('Error using shadow step:', error); }
      });

      socket.on('restoreShadowStep', async (data) => {
        try {
          const { campaignId, characterId } = data;
          const result = await pool.query(
            `UPDATE characters SET shadow_step_used = GREATEST(0, COALESCE(shadow_step_used, 0) - 1) WHERE id = $1
             RETURNING COALESCE(shadow_reap_used, 0) as shadow_reap_used, shadow_step_used`,
            [characterId]
          );
          if (result.rows.length > 0) {
            io.to(`campaign_${campaignId}`).emit('shadowResourceUpdated', { characterId, shadow_reap_used: result.rows[0].shadow_reap_used, shadow_step_used: result.rows[0].shadow_step_used });
          }
        } catch (error) { console.error('Error restoring shadow step:', error); }
      });

      // Roll death saves for a downed character
      socket.on('rollDeathSave', async (data) => {
        try {
          const { campaignId, characterId, result } = data; // result: 'success' | 'failure'
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          let current = await CombatSession.getDeathSavesForCharacter(session.sessionId, characterId);
          const saves = {
            successes: current?.successes || 0,
            failures: current?.failures || 0,
            is_stable: current?.is_stable || false,
            is_dead: current?.is_dead || false,
          };

          if (result === 'success') {
            saves.successes = Math.min(3, saves.successes + 1);
            if (saves.successes >= 3) saves.is_stable = true;
          } else {
            saves.failures = Math.min(3, saves.failures + 1);
            if (saves.failures >= 3) {
              saves.is_dead = true;
              // Apply Dead condition
              const combatantKey = String(characterId);
              const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
              if (combatant) {
                const conditions = [...(combatant.conditions || []).filter(c => c !== 'Unconscious'), 'Dead'];
                await CombatSession.updateCombatant(combatant.id, { conditions });
                const cached = session.combatants.find(c => c.characterId === combatantKey);
                if (cached) { cached.conditions = conditions; cached.isDead = true; }
                io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey, conditions, campaignId });
              }
              io.to(`campaign_${campaignId}`).emit('characterDied', { characterId, campaignId });
            }
          }

          await CombatSession.upsertDeathSaves(session.sessionId, characterId, saves);
          const allSaves = await CombatSession.getDeathSaves(session.sessionId);
          await CombatSession.addLogEntry({ session_id: session.sessionId, action_type: 'death_save', target_name: String(characterId), details: `Death save ${result} (${saves.successes}✓ / ${saves.failures}✗)` });
          const log = await CombatSession.getLog(session.sessionId);
          io.to(`campaign_${campaignId}`).emit('deathSavesUpdated', { deathSaves: allSaves, campaignId });
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
        } catch (error) { console.error('Error rolling death save:', error); }
      });

      // DM: Revive a dead combatant (all limbs set to 1 HP)
      socket.on('reviveCombatant', async (data) => {
        try {
          const { campaignId, targetKey, targetType, reviverName } = data;
          const session = battleCombatState[campaignId];
          if (!session) return;

          let updatedHealthData = null;

          if (targetType === 'monster') {
            const instanceId = parseInt(targetKey, 10);
            const MonsterInstance = require('./models/MonsterInstance');
            const instance = await MonsterInstance.findById(instanceId);
            if (!instance) return;

            const limbHealth = { ...instance.current_limb_health };
            Object.keys(limbHealth).forEach(k => { limbHealth[k] = 1; });
            await MonsterInstance.updateHealth(instanceId, limbHealth);
            // Restore to combat
            await pool.query('UPDATE monster_instances SET in_combat = TRUE WHERE id = $1', [instanceId]);

            const totalHP = Object.values(limbHealth).reduce((s, v) => s + v, 0);
            updatedHealthData = { type: 'monster', instanceId, limbHealth, totalHP, isDead: false };

            const cached = session.combatants.find(c => c.characterId === String(instanceId));
            if (cached) cached.isDead = false;
          } else if (targetType === 'character') {
            const charId = parseInt(targetKey, 10);
            const character = await Character.findById(charId);
            if (!character) return;

            let limbHealth = character.limb_health ?? initCharacterLimbHealth(character);
            const numLimbs = Object.keys(limbHealth).length;
            Object.keys(limbHealth).forEach(k => { limbHealth[k] = 1; });
            const newHP = numLimbs;

            await pool.query(
              'UPDATE characters SET hit_points = $1, limb_health = $2 WHERE id = $3',
              [newHP, JSON.stringify(limbHealth), charId]
            );
            updatedHealthData = { type: 'character', characterId: charId, newHP, limbHealth, isDead: false };

            if (session.sessionId) {
              // Clear death saves — character is revived
              await CombatSession.upsertDeathSaves(session.sessionId, charId, { successes: 0, failures: 0, is_stable: true, is_dead: false });
              const allSaves = await CombatSession.getDeathSaves(session.sessionId);
              io.to(`campaign_${campaignId}`).emit('deathSavesUpdated', { deathSaves: allSaves, campaignId });

              // Remove Dead/Unconscious conditions
              const combatantKey = String(charId);
              const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
              if (combatant) {
                const conditions = (combatant.conditions || []).filter(c => c !== 'Dead' && c !== 'Unconscious');
                await CombatSession.updateCombatant(combatant.id, { conditions });
                const cached = session.combatants.find(c => c.characterId === combatantKey);
                if (cached) { cached.conditions = conditions; cached.isDead = false; }
                io.to(`campaign_${campaignId}`).emit('conditionsUpdated', { combatantKey, conditions, campaignId });
              }
            }
          }

          if (updatedHealthData && session.sessionId) {
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: reviverName || 'DM',
              action_type: 'revive',
              target_name: data.targetName || targetKey,
              details: 'Revived — all limbs restored to 1 HP',
            });
            const log = await CombatSession.getLog(session.sessionId);
            io.to(`campaign_${campaignId}`).emit('healthUpdated', { ...updatedHealthData, campaignId, timestamp: new Date().toISOString() });
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log, timestamp: new Date().toISOString() });
          }
        } catch (error) { console.error('Error reviving combatant:', error); }
      });

      // Set/clear spell concentration for a character
      socket.on('setConcentration', async (data) => {
        try {
          const { campaignId, combatantKey, spellName } = data; // spellName null to clear
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (!combatant) return;
          await CombatSession.updateCombatant(combatant.id, { concentration_spell: spellName || null });

          const cached = session.combatants.find(c => c.characterId === combatantKey);
          if (cached) cached.concentration_spell = spellName || null;

          await CombatSession.addLogEntry({ session_id: session.sessionId, actor_name: combatant.name, action_type: 'concentration', details: spellName ? `Concentrating on ${spellName}` : 'Concentration ended' });
          const log = await CombatSession.getLog(session.sessionId);
          io.to(`campaign_${campaignId}`).emit('concentrationUpdated', { combatantKey, spellName: spellName || null, campaignId });
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
        } catch (error) { console.error('Error setting concentration:', error); }
      });

      // Remove a combatant from active combat (DM action)
      socket.on('removeCombatant', async (data) => {
        try {
          const { campaignId, combatantKey } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (combatant) {
            await CombatSession.removeCombatant(combatant.id);
            if (combatant.monster_instance_id) {
              const MonsterInstance = require('./models/MonsterInstance');
              await MonsterInstance.removeFromCombat(combatant.monster_instance_id);
            }
          }

          // Update cache
          session.combatants = session.combatants.filter(c => c.characterId !== combatantKey);
          session.initiativeOrder = session.initiativeOrder.filter(k => k !== combatantKey);

          // Adjust turn index if needed
          if (session.currentTurnIndex >= session.initiativeOrder.length && session.initiativeOrder.length > 0) {
            session.currentTurnIndex = session.initiativeOrder.length - 1;
          }
          await CombatSession.updateTurnIndex(session.sessionId, session.currentTurnIndex);

          io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
            combatants: session.combatants,
            initiativeOrder: session.initiativeOrder,
            currentTurnIndex: session.currentTurnIndex,
            timestamp: new Date().toISOString(),
          });
        } catch (error) { console.error('Error removing combatant:', error); }
      });

      // Spend an action economy resource
      socket.on('spendActionEconomy', async (data) => {
        try {
          const { campaignId, combatantKey, actionType, spent } = data; // actionType: 'action'|'bonusAction'|'reaction', spent: boolean
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (!combatant) return;

          const fieldMap = { action: 'action_used', bonusAction: 'bonus_action_used', reaction: 'reaction_used' };
          const field = fieldMap[actionType];
          if (!field) return;
          await CombatSession.updateCombatant(combatant.id, { [field]: spent });

          const allCombatants = await CombatSession.getCombatants(session.sessionId);
          io.to(`campaign_${campaignId}`).emit('actionEconomyUpdated', {
            combatants: allCombatants,
            campaignId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) { console.error('Error spending action economy:', error); }
      });

      // DM requests a player to roll dice
      socket.on('requestDiceRoll', async (data) => {
        try {
          const { campaignId, targetPlayerId, targetCharacterName, diceType, rollPurpose, purposeDetail, requesterName, modifier } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const request = await CombatSession.createDiceRequest({
            session_id: session.sessionId,
            requester_id: socket.userId || 0,
            requester_name: requesterName || 'Dungeon Master',
            target_player_id: targetPlayerId,
            target_character_name: targetCharacterName,
            dice_type: diceType,
            roll_purpose: rollPurpose,
            purpose_detail: purposeDetail,
          });

          // Anti-cheat: track pending general roll requests
          if (!battleRollState[campaignId]) battleRollState[campaignId] = {};
          battleRollState[campaignId][request.id] = {
            type: 'diceRollRequested',
            status: 'pending',
            targetPlayerId,
            config: {
              requestId: request.id,
              requesterName: request.requester_name,
              targetCharacterName,
              diceType,
              diceGroups: data.diceGroups ?? null,
              rollPurpose,
              purposeDetail,
              campaignId,
              modifier: modifier || 'none',
              precomputedModifier: data.precomputedModifier ?? null,
            },
          };
          // Send only to the target player
          const targetSocketId = userSocketMap.get(targetPlayerId);
          if (targetSocketId) {
            io.to(targetSocketId).emit('diceRollRequested', {
              requestId: request.id,
              requesterName: request.requester_name,
              targetCharacterName,
              diceType,
              diceGroups: data.diceGroups ?? null,
              rollPurpose,
              purposeDetail,
              campaignId,
              modifier: modifier || 'none',
              precomputedModifier: data.precomputedModifier ?? null,
            });
          }
          console.log(`🎲 Dice roll requested: ${diceType} ${rollPurpose} (mod: ${modifier || 'none'}) for player ${targetPlayerId}`);
        } catch (error) { console.error('Error requesting dice roll:', error); }
      });

      // Player submits dice roll result
      socket.on('submitDiceResult', async (data) => {
        try {
          const { campaignId, requestId, result, rawRoll, total, modifierValue, modifier, rollerName,
                  attackerKey, targetKey, targetName: attackTargetName, hitRoll, damageRoll,
                  purposeDetail, diceType: submittedDiceType, rollPurpose: submittedRollPurpose,
                  allRolls } = data;
          const session = battleCombatState[campaignId];

          let resolvedPurposeDetail = purposeDetail || null;
          let resolvedDiceType = submittedDiceType || null;
          let resolvedRollPurpose = submittedRollPurpose || null;

          // Anti-cheat: reject duplicate submissions for the same requestId
          if (requestId && battleRollState[campaignId]?.[requestId]) {
            const entry = battleRollState[campaignId][requestId];
            const cfg = entry.config || {};
            if (!resolvedPurposeDetail && cfg.purposeDetail) resolvedPurposeDetail = cfg.purposeDetail;
            if (!resolvedDiceType && cfg.diceType) resolvedDiceType = cfg.diceType;
            if (!resolvedRollPurpose && cfg.rollPurpose) resolvedRollPurpose = cfg.rollPurpose;
            if (entry.status === 'resolved') {
              console.warn(`⛔ Duplicate submitDiceResult blocked for requestId ${requestId}`);
              return;
            }
            // Allow hit_submitted (shouldn't normally call submitDiceResult) and damage_pending
            entry.status = 'resolved';
          }

          // total is raw + modifier; result (legacy) is just the raw roll if no modifier
          const finalRaw = rawRoll ?? result;
          const finalTotal = total ?? result;

          // Try to resolve in DB — attack rolls don't create a DB dice request so this may throw; don't let it block the emit
          try {
            await CombatSession.resolveDiceRequest(requestId, finalTotal);
          } catch (_) { /* expected for attack-based rolls */ }

          if (session?.sessionId) {
            const pd = resolvedPurposeDetail;
            const dt = resolvedDiceType || 'd20';
            let breakdown;
            if (modifier && modifier !== 'none' && modifierValue !== undefined && modifierValue !== 0) {
              // Named ability modifier (str/dex/etc)
              const modSign = modifierValue >= 0 ? `+${modifierValue}` : `${modifierValue}`;
              const label = pd ? `${pd} (${modifier.toUpperCase()} ${modSign})` : `${modifier.toUpperCase()} ${modSign}`;
              breakdown = `${rollerName} rolled ${dt}: ${finalRaw} + ${label} = ${finalTotal}`;
            } else if (modifierValue !== undefined && modifierValue !== 0) {
              // Precomputed modifier (Quick Roll skill/save)
              const modSign = modifierValue >= 0 ? `+${modifierValue}` : `${modifierValue}`;
              const label = pd ? `${pd} (${modSign})` : modSign;
              breakdown = `${rollerName} rolled ${dt}: ${finalRaw} + ${label} = ${finalTotal}`;
            } else if (pd) {
              breakdown = `${rollerName} rolled ${dt} for ${pd}: ${finalTotal}`;
            } else {
              breakdown = `${rollerName} rolled ${dt}: ${finalTotal}`;
            }
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: rollerName,
              action_type: 'dice_roll',
              roll_result: finalTotal,
              details: breakdown,
            });
            const log = await CombatSession.getLog(session.sessionId);
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
          }

          io.to(`campaign_${campaignId}`).emit('diceResultReceived', {
            requestId,
            rollerName,
            result: finalRaw,
            rawRoll: finalRaw,
            total: finalTotal,
            modifierValue: modifierValue ?? 0,
            modifier: modifier ?? 'none',
            campaignId,
            attackerKey: attackerKey ?? null,
            targetKey: targetKey ?? null,
            targetName: attackTargetName ?? null,
            hitRoll: hitRoll ?? null,
            damageRoll: damageRoll ?? null,
            diceType: resolvedDiceType,
            rollPurpose: resolvedRollPurpose,
            purposeDetail: resolvedPurposeDetail,
            allRolls: allRolls ?? null,
            timestamp: new Date().toISOString(),
          });
        } catch (error) { console.error('Error submitting dice result:', error); }
      });

      // Reroll request/approve/deny
      socket.on('requestReroll', (data) => {
        const { campaignId, requestId, rollerName: rerollRollerName, diceType } = data;
        io.to(`campaign_${campaignId}`).emit('rerollRequested', { requestId, rollerName: rerollRollerName, diceType });
      });

      socket.on('approveReroll', (data) => {
        const { campaignId, requestId } = data;
        io.to(`campaign_${campaignId}`).emit('rerollApproved', { requestId });
      });

      socket.on('denyReroll', (data) => {
        const { campaignId, requestId } = data;
        io.to(`campaign_${campaignId}`).emit('rerollDenied', { requestId });
      });

      // Hit roll submitted by player — DM approves (proceed to damage) or denies (miss)
      socket.on('submitHitRoll', (data) => {
        const { campaignId, requestId, attackerName, targetName, hitTotal, hitRaw } = data;
        // Anti-cheat: advance to hit_submitted (NOT resolved — damage roll still coming)
        if (requestId && battleRollState[campaignId]?.[requestId]) {
          battleRollState[campaignId][requestId].status = 'hit_submitted';
          battleRollState[campaignId][requestId].hitTotal = hitTotal;
          battleRollState[campaignId][requestId].attackerName = attackerName;
          battleRollState[campaignId][requestId].targetName = targetName;
        }
        io.to(`campaign_${campaignId}`).emit('hitRollResult', { requestId, attackerName, targetName, hitTotal, hitRaw });
      });

      socket.on('approveHitRoll', (data) => {
        const { campaignId, requestId, hitTotal, hitRaw } = data;
        // Advance to damage_pending so refresh restores the player to damage-roll phase
        if (requestId && battleRollState[campaignId]?.[requestId]) {
          battleRollState[campaignId][requestId].status = 'damage_pending';
          battleRollState[campaignId][requestId].hitTotal = hitTotal;
        }
        io.to(`campaign_${campaignId}`).emit('hitRollApproved', { requestId, hitTotal, hitRaw });
      });

      socket.on('denyHitRoll', (data) => {
        const { campaignId, requestId } = data;
        // Attack denied — fully resolved
        if (requestId && battleRollState[campaignId]?.[requestId]) {
          battleRollState[campaignId][requestId].status = 'resolved';
        }
        io.to(`campaign_${campaignId}`).emit('hitRollDenied', { requestId });
      });

      // Manually add a combat log entry (DM notes, spell casts, etc.)
      socket.on('addCombatLog', async (data) => {
        try {
          const { campaignId, actorName, actionType, targetName, details } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          await CombatSession.addLogEntry({ session_id: session.sessionId, actor_name: actorName, action_type: actionType || 'note', target_name: targetName, details });
          const log = await CombatSession.getLog(session.sessionId);
          io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log });
        } catch (error) { console.error('Error adding combat log entry:', error); }
      });

      // ===== BATTLEFIELD / ARMY BATTLE EVENTS =====

      // Participant position update (DM moving armies during planning phase)
      socket.on('battlefieldParticipantMove', (data) => {
        try {
          const { campaignId, battleId, participantId, x, y, remainingMovement } = data;
          // Broadcast to all users in the campaign
          socket.to(`campaign_${campaignId}`).emit('battlefieldParticipantMoved', {
            battleId,
            participantId,
            x,
            y,
            remainingMovement,
            timestamp: new Date().toISOString()
          });
          console.log(`🗺️ Battlefield participant ${participantId} moved to (${x}, ${y}) in campaign ${campaignId}`);
        } catch (error) {
          console.error('Error handling battlefield participant movement:', error);
        }
      });

      // Reset battlefield movement (DM advancing round)
      socket.on('battlefieldMovementReset', (data) => {
        try {
          const { campaignId, battleId, movementState } = data;
          io.to(`campaign_${campaignId}`).emit('battlefieldMovementReset', {
            battleId,
            movementState,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error handling battlefield movement reset:', error);
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
      
      // Handle ability score updates
      socket.on('abilityUpdated', (data) => {
        try {
          const { campaignId, characterId, ability, newScore } = data;
          // Broadcast to all users in the campaign
          io.to(`campaign_${campaignId}`).emit('abilityUpdated', {
            campaignId,
            characterId,
            ability,
            newScore,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error handling ability update:', error);
        }
      });

      socket.on('baseHpUpdated', (data) => {
        try {
          const { campaignId, characterId, newBaseHp } = data;
          io.to(`campaign_${campaignId}`).emit('baseHpUpdated', {
            campaignId,
            characterId,
            newBaseHp,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error handling base HP update:', error);
        }
      });

      // Handle skill proficiency updates
      socket.on('skillProficiencyToggled', (data) => {
        console.log('📥 Backend received skillProficiencyToggled event');
        console.log('📥 Data received:', data);
        console.log('📥 Data type:', typeof data);
        console.log('📥 Data keys:', Object.keys(data || {}));
        try {
          const { campaignId, characterId, skillName, isAdding } = data;
          console.log(`📥 Parsed values - campaignId: ${campaignId}, characterId: ${characterId}, skillName: ${skillName}, isAdding: ${isAdding}`);
          
          const roomName = `campaign_${campaignId}`;
          console.log(`📊 About to broadcast to room: ${roomName}`);
          
          // Get room info
          if (io.sockets.adapter.rooms.has(roomName)) {
            const room = io.sockets.adapter.rooms.get(roomName);
            console.log(`📊 Room ${roomName} has ${room.size} sockets`);
          } else {
            console.log(`⚠️ Room ${roomName} does not exist!`);
          }
          
          // Broadcast to all users in the campaign
          console.log(`📤 Broadcasting skillProficiencyToggled to ${roomName}`);
          io.to(roomName).emit('skillProficiencyToggled', {
            campaignId,
            characterId,
            skillName,
            isAdding,
            timestamp: new Date().toISOString()
          });
          console.log(`✨ Skill proficiency toggled: ${skillName} (${isAdding ? 'added' : 'removed'})`);
        } catch (error) {
          console.error('Error handling skill proficiency toggle:', error);
        }
      });

      socket.on('skillExpertiseToggled', (data) => {
        try {
          const { campaignId, characterId, skillName, isAdding } = data;
          const roomName = `campaign_${campaignId}`;
          io.to(roomName).emit('skillExpertiseToggled', {
            campaignId,
            characterId,
            skillName,
            isAdding,
            timestamp: new Date().toISOString()
          });
          console.log(`✨ Skill expertise toggled: ${skillName} (${isAdding ? 'added' : 'removed'})`);
        } catch (error) {
          console.error('Error handling skill expertise toggle:', error);
        }
      });

      // Handle resistance updates (DM adds/removes resistance tags on a character)
      socket.on('updateResistances', (data) => {
        try {
          const { campaignId, characterId, resistances } = data;
          io.to(`campaign_${campaignId}`).emit('resistancesUpdated', {
            campaignId,
            characterId,
            resistances,
          });
        } catch (error) {
          console.error('Error handling resistance update:', error);
        }
      });

      // Kingdom handlers
      socket.on('createKingdom', async ({ campaignId, targetPlayerId }) => {
        try {
          console.log(`👑 [createKingdom] Received: campaignId=${campaignId}, targetPlayerId=${targetPlayerId}`);
          const Kingdom = require('./models/Kingdom');
          const kingdom = await Kingdom.create({ campaign_id: campaignId, player_id: targetPlayerId });
          console.log(`👑 [createKingdom] Kingdom row created:`, kingdom);
          const room = `campaign_${campaignId}`;
          const roomSockets = await io.in(room).fetchSockets();
          console.log(`👑 [createKingdom] Emitting kingdomNameRequest to room "${room}" (${roomSockets.length} sockets):`, roomSockets.map(s => s.id));
          io.to(room).emit('kingdomNameRequest', {
            kingdomId: kingdom.id,
            targetPlayerId: Number(targetPlayerId)
          });
        } catch (error) {
          console.error('[createKingdom] Error:', error);
        }
      });

      socket.on('nameKingdom', async ({ campaignId, kingdomId, name }) => {
        try {
          console.log(`👑 [nameKingdom] Received: campaignId=${campaignId}, kingdomId=${kingdomId}, name="${name}"`);
          const Kingdom = require('./models/Kingdom');
          const kingdom = await Kingdom.setName(kingdomId, name);
          if (kingdom) {
            io.to(`campaign_${campaignId}`).emit('kingdomActivated', { kingdom });
            io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId, kingdomId: kingdom.id });
            console.log(`👑 [nameKingdom] kingdomActivated emitted for "${name}"`);
          } else {
            console.warn(`👑 [nameKingdom] setName returned null for id=${kingdomId}`);
          }
        } catch (error) {
          console.error('[nameKingdom] Error:', error);
        }
      });

      // Chat handlers
      require('./socket/handlers/chatHandlers')(socket, io, userSocketMap);

      // ── Set active battle map (DM only) ─────────────────────────────────────
      socket.on('setActiveMap', async (data) => {
        try {
          const { campaignId, mapId, mapType = 'combat' } = data; // mapType: 'combat' | 'battlefield'

          if (mapType === 'battlefield') {
            activeBattlefieldMapState[campaignId] = mapId ?? null;
            await pool.query(
              `UPDATE campaigns SET active_battlefield_map_id = $1 WHERE id = $2`,
              [mapId || null, campaignId]
            );
          } else {
            activeBattleMapState[campaignId] = mapId ?? null;
            // Persist to campaigns table (survives server restarts & works without a combat session)
            await pool.query(
              `UPDATE campaigns SET active_map_id = $1 WHERE id = $2`,
              [mapId || null, campaignId]
            );
            // Also persist to the current combat session if one exists
            const session = battleCombatState[campaignId];
            if (session?.sessionId) {
              await pool.query(
                `UPDATE combat_sessions SET active_map_id = $1 WHERE id = $2`,
                [mapId || null, session.sessionId]
              );
            }
          }

          io.to(`campaign_${campaignId}`).emit('activeMapChanged', {
            campaignId,
            mapId: mapId ?? null,
            mapType,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Error setting active map:', error);
        }
      });

      // ── Apply damage to a mount during combat ────────────────────────────────
      socket.on('applyMountDamage', async (data) => {
        try {
          const { campaignId, combatantKey, damage } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (!combatant || !combatant.is_mounted || !combatant.mount_id) return;

          const newMountHp = Math.max(0, (combatant.mount_current_hp || 0) - damage);

          if (newMountHp <= 0) {
            // Mount is dead — fetch mount name
            const mountRow = await pool.query(`SELECT name FROM campaign_mounts WHERE id = $1`, [combatant.mount_id]);
            const mountName = mountRow.rows[0]?.name ?? 'Mount';

            // Fetch character's base movement speed
            let baseSpeed = 30;
            if (combatant.character_id) {
              const charRow = await pool.query(`SELECT movement_speed FROM characters WHERE id = $1`, [combatant.character_id]);
              baseSpeed = charRow.rows[0]?.movement_speed || 30;
            }

            // Unmount: clear mount columns, restore movement
            await CombatSession.updateCombatant(combatant.id, {
              is_mounted: false,
              mount_id: null,
              mount_current_hp: null,
              movement_speed: baseSpeed,
            });
            if (battleMovementState[campaignId]) {
              battleMovementState[campaignId][combatantKey] = baseSpeed;
            }

            // ── Fall damage: 4 damage to a random limb ────────────────────────
            const LIMBS = ['head', 'chest', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
            const fallLimb = LIMBS[Math.floor(Math.random() * LIMBS.length)];
            const FALL_DAMAGE = 4;
            const riderName = combatant.name;

            if (combatant.character_id) {
              try {
                const charRow = await pool.query(`SELECT limb_health, hit_points FROM characters WHERE id = $1`, [combatant.character_id]);
                if (charRow.rows.length > 0) {
                  let limbHealth = charRow.rows[0].limb_health ?? {};
                  const currentLimbHp = Number(limbHealth[fallLimb] ?? 0);
                  const newLimbHp = Math.max(0, currentLimbHp - FALL_DAMAGE);
                  limbHealth = { ...limbHealth, [fallLimb]: newLimbHp };

                  // Recalculate total HP as sum of limbs
                  const totalHp = Object.values(limbHealth).reduce((s, v) => s + Number(v || 0), 0);
                  await pool.query(
                    `UPDATE characters SET limb_health = $1, hit_points = $2 WHERE id = $3`,
                    [JSON.stringify(limbHealth), totalHp, combatant.character_id]
                  );

                  io.to(`campaign_${campaignId}`).emit('healthUpdated', {
                    type: 'character',
                    characterId: combatant.character_id,
                    limbHealth,
                    totalHP: totalHp,
                    campaignId,
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (fallErr) {
                console.error('Error applying fall damage:', fallErr);
              }
            }

            // Log the fall damage
            await CombatSession.addLogEntry({
              session_id: session.sessionId,
              actor_name: riderName,
              action_type: 'damage',
              target_name: riderName,
              limb_name: fallLimb,
              damage: FALL_DAMAGE,
              details: `${riderName} landed on their ${fallLimb.replace('_', ' ')} when their mount died and took ${FALL_DAMAGE} damage`,
            });

            const log = await CombatSession.getLog(session.sessionId);
            io.to(`campaign_${campaignId}`).emit('combatLogUpdated', { log, campaignId, timestamp: new Date().toISOString() });

            // Broadcast mount fell event
            io.to(`campaign_${campaignId}`).emit('mountFell', {
              combatantKey,
              mountName,
              riderName,
              campaignId,
              timestamp: new Date().toISOString(),
            });
          } else {
            // Mount survived — just update HP
            await CombatSession.updateCombatant(combatant.id, { mount_current_hp: newMountHp });
          }

          // Update in-memory session combatants with new mount HP
          const inMem = session.combatants.find(c => String(c.characterId) === String(combatantKey));
          if (inMem) {
            if (newMountHp <= 0) {
              inMem.isMounted = false;
              inMem.mountId = null;
              inMem.mountCurrentHp = null;
              inMem.movement_speed = battleMovementState[campaignId]?.[String(combatantKey)] ?? inMem.movement_speed;
            } else {
              inMem.mountCurrentHp = newMountHp;
            }
          }

          // Broadcast updated combatants using in-memory state (camelCase, consistent with rest of handlers)
          io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
            combatants: session.combatants,
            initiativeOrder: session.initiativeOrder,
            currentTurnIndex: session.currentTurnIndex,
            campaignId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Error applying mount damage:', error);
        }
      });

      // ── Add movement to a combatant (Dash action) ────────────────────────────
      socket.on('addMovement', async (data) => {
        try {
          const { campaignId, combatantKey, additionalMovement } = data;
          const session = battleCombatState[campaignId];
          if (!session?.sessionId) return;

          const combatant = await CombatSession.getCombatantByKey(session.sessionId, combatantKey);
          if (!combatant) return;

          const currentRemaining = Number(combatant.remaining_movement ?? combatant.movement_speed ?? 30);
          const newRemaining = currentRemaining + Number(additionalMovement || 0);

          await CombatSession.updateCombatant(combatant.id, { remaining_movement: newRemaining });
          if (battleMovementState[campaignId]) {
            battleMovementState[campaignId][combatantKey] = newRemaining;
          }

          io.to(`campaign_${campaignId}`).emit('movementUpdated', {
            combatantKey,
            remainingMovement: newRemaining,
            campaignId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Error adding movement:', error);
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
        // Remove from campaign presence and notify others
        if (socket.userId && socket.campaignId && campaignPresence[socket.campaignId]) {
          campaignPresence[socket.campaignId].delete(socket.userId);
          io.to(`campaign_${socket.campaignId}`).emit('campaignUsersOnline', {
            campaignId: socket.campaignId,
            onlineUserIds: Array.from(campaignPresence[socket.campaignId])
          });
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