const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

// Initialize database tables
const initializeDB = async () => {
  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'Player' CHECK (role IN ('Dungeon Master', 'Player')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        dungeon_master_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create characters table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        race VARCHAR(50) NOT NULL,
        class VARCHAR(50) NOT NULL,
        background VARCHAR(50),
        level INTEGER DEFAULT 1 CHECK (level >= 1 AND level <= 20),
        hit_points INTEGER NOT NULL,
        armor_class INTEGER NOT NULL,
        abilities JSONB NOT NULL, -- {str: 10, dex: 14, con: 12, int: 13, wis: 15, cha: 8}
        skills JSONB DEFAULT '[]'::jsonb, -- Array of skill names
        equipment JSONB DEFAULT '[]'::jsonb, -- Array of equipment items (unequipped)
        equipped_items JSONB DEFAULT '{}'::jsonb, -- {head: null, chest: null, legs: null, feet: null, main_hand: null, off_hand: null}
        spells JSONB DEFAULT '[]'::jsonb, -- Array of spells
        backstory TEXT DEFAULT '',
        personality_traits TEXT DEFAULT '',
        ideals TEXT DEFAULT '',
        bonds TEXT DEFAULT '',
        flaws TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, campaign_id) -- One character per player per campaign
      );
    `);

    // Create inventory table for D&D 5e items
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        item_name VARCHAR(255) PRIMARY KEY,
        category VARCHAR(50) NOT NULL CHECK (category IN ('Weapon', 'Armor', 'Tool', 'General', 'Magic Item', 'Consumable')),
        subcategory VARCHAR(100),
        description TEXT NOT NULL,
        damage_dice VARCHAR(20),
        damage_type VARCHAR(20),
        range_normal INTEGER,
        range_long INTEGER,
        weight DECIMAL(5,2),
        cost_cp INTEGER, -- Cost in copper pieces
        armor_class INTEGER,
        limb_armor_class JSONB DEFAULT '{}'::jsonb, -- {head: 5, chest: 14, hands: 2, feet: 4}
        strength_requirement INTEGER,
        stealth_disadvantage BOOLEAN DEFAULT FALSE,
        properties JSONB DEFAULT '[]'::jsonb, -- Array of weapon/armor properties
        rarity VARCHAR(20) DEFAULT 'Common' CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact')),
        attunement_required BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_dm ON campaigns(dungeon_master_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns(name);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_characters_player ON characters(player_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_characters_player_campaign ON characters(player_id, campaign_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_subcategory ON inventory(subcategory);
    `);

    // Seed inventory with D&D 5e items
    await seedInventory();

    // Run database migrations to add any missing columns
    await runMigrations();

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Run database migrations to add missing columns
const runMigrations = async () => {
  try {
    console.log('Running database migrations...');
    
    // Migration 1: Add equipped_items column if it doesn't exist
    const checkEquippedItemsColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'characters' 
      AND column_name = 'equipped_items'
    `);
    
    if (checkEquippedItemsColumn.rows.length === 0) {
      console.log('Adding equipped_items column to characters table...');
      await pool.query(`
        ALTER TABLE characters 
        ADD COLUMN equipped_items JSONB DEFAULT '{}'::jsonb
      `);
      console.log('✅ equipped_items column added successfully');
    } else {
      console.log('✅ equipped_items column already exists');
    }
    
    // Migration 2: Add limb_armor_class column to inventory table if it doesn't exist
    const checkLimbArmorColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'inventory' 
      AND column_name = 'limb_armor_class'
    `);
    
    if (checkLimbArmorColumn.rows.length === 0) {
      console.log('Adding limb_armor_class column to inventory table...');
      await pool.query(`
        ALTER TABLE inventory 
        ADD COLUMN limb_armor_class JSONB DEFAULT '{}'::jsonb
      `);
      console.log('✅ limb_armor_class column added successfully');
      
      // Update existing armor items with appropriate limb AC values
      console.log('Updating existing armor items with limb-specific AC...');
      await updateExistingArmorWithLimbAC();
      console.log('✅ Existing armor items updated');
    } else {
      console.log('✅ limb_armor_class column already exists');
    }
    
    // Migration 3: Add image_url column to characters table if it doesn't exist
    const checkImageUrlColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'characters' 
      AND column_name = 'image_url'
    `);
    
    if (checkImageUrlColumn.rows.length === 0) {
      console.log('Adding image_url column to characters table...');
      await pool.query(`
        ALTER TABLE characters 
        ADD COLUMN image_url VARCHAR(500)
      `);
      console.log('✅ image_url column added successfully');
    } else {
      console.log('✅ image_url column already exists');
    }
    
    // Migration 4: Add map position columns to characters table if they don't exist
    const checkMapPositionColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'characters' 
      AND column_name IN ('map_position_x', 'map_position_y')
    `);
    
    if (checkMapPositionColumns.rows.length < 2) {
      console.log('Adding map_position_x and map_position_y columns to characters table...');
      await pool.query(`
        ALTER TABLE characters 
        ADD COLUMN IF NOT EXISTS map_position_x DECIMAL(5,2) DEFAULT 50.00,
        ADD COLUMN IF NOT EXISTS map_position_y DECIMAL(5,2) DEFAULT 50.00
      `);
      console.log('✅ map position columns added successfully');
    } else {
      console.log('✅ map position columns already exist');
    }
    
    // Migration 5: Add movement_speed and battle position columns to characters table
    const checkMovementColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'characters' 
      AND column_name IN ('movement_speed', 'battle_position_x', 'battle_position_y')
    `);
    
    if (checkMovementColumns.rows.length < 3) {
      console.log('Adding movement_speed and battle position columns to characters table...');
      await pool.query(`
        ALTER TABLE characters 
        ADD COLUMN IF NOT EXISTS movement_speed INTEGER DEFAULT 30,
        ADD COLUMN IF NOT EXISTS battle_position_x DECIMAL(5,2) DEFAULT 50.00,
        ADD COLUMN IF NOT EXISTS battle_position_y DECIMAL(5,2) DEFAULT 50.00
      `);
      
      // Update existing characters to have movement_speed of 30
      await pool.query(`
        UPDATE characters 
        SET movement_speed = 30 
        WHERE movement_speed IS NULL
      `);
      
      console.log('✅ movement_speed and battle position columns added successfully');
    } else {
      console.log('✅ movement_speed and battle position columns already exist');
    }
    
    // Migration 6: Add combat_active and initiative columns to characters table
    const checkCombatColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'characters' 
      AND column_name IN ('combat_active', 'initiative')
    `);
    
    if (checkCombatColumns.rows.length < 2) {
      console.log('Adding combat_active and initiative columns to characters table...');
      await pool.query(`
        ALTER TABLE characters 
        ADD COLUMN IF NOT EXISTS combat_active BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS initiative INTEGER DEFAULT 0
      `);
      
      console.log('✅ combat_active and initiative columns added successfully');
    } else {
      console.log('✅ combat_active and initiative columns already exist');
    }
    
    // Migration 7: Create monsters table for encyclopedia
    const checkMonstersTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'monsters'
      );
    `);
    
    if (!checkMonstersTable.rows[0].exists) {
      console.log('Creating monsters table...');
      await pool.query(`
        CREATE TABLE monsters (
          id SERIAL PRIMARY KEY,
          campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT DEFAULT '',
          image_url VARCHAR(500),
          limb_health JSONB DEFAULT '{"head": 10, "chest": 30, "left_arm": 15, "right_arm": 15, "left_leg": 20, "right_leg": 20}'::jsonb,
          limb_ac JSONB DEFAULT '{"head": 10, "chest": 12, "left_arm": 10, "right_arm": 10, "left_leg": 10, "right_leg": 10}'::jsonb,
          visible_to_players BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Create index for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_monsters_campaign ON monsters(campaign_id);
      `);
      
      console.log('✅ monsters table created successfully');
    } else {
      console.log('✅ monsters table already exists');
    }
    
    // Migration 8: Create monster_instances table for tracking individual monster instances in combat
    const checkMonsterInstancesTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'monster_instances'
      );
    `);
    
    if (!checkMonsterInstancesTable.rows[0].exists) {
      console.log('Creating monster_instances table...');
      await pool.query(`
        CREATE TABLE monster_instances (
          id SERIAL PRIMARY KEY,
          monster_id INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
          campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          instance_number INTEGER NOT NULL,
          current_limb_health JSONB NOT NULL,
          in_combat BOOLEAN DEFAULT TRUE,
          initiative INTEGER DEFAULT 0,
          battle_position_x DECIMAL(5,2) DEFAULT 50.00,
          battle_position_y DECIMAL(5,2) DEFAULT 50.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(monster_id, campaign_id, instance_number)
        );
      `);
      
      // Create index for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_monster_instances_monster ON monster_instances(monster_id);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_monster_instances_campaign ON monster_instances(campaign_id);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_monster_instances_in_combat ON monster_instances(in_combat);
      `);
      
      console.log('✅ monster_instances table created successfully');
    } else {
      console.log('✅ monster_instances table already exists');
    }
    
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running database migrations:', error);
  }
};

// Update existing armor items with limb-specific AC
const updateExistingArmorWithLimbAC = async () => {
  try {
    // Get all armor items
    const armorItems = await pool.query(`
      SELECT item_name, subcategory, armor_class 
      FROM inventory 
      WHERE category = 'Armor'
    `);
    
    for (const item of armorItems.rows) {
      const subcategory = (item.subcategory || '').toLowerCase();
      const itemName = item.item_name.toLowerCase();
      const ac = item.armor_class || 0;
      let limbAC = {};
      
      // Determine which limb(s) this armor protects
      if (subcategory.includes('shield') || itemName.includes('shield')) {
        // Shields protect hands/off-hand
        limbAC = { hands: ac };
      } else if (subcategory.includes('helmet') || subcategory === 'helmet' || 
                 itemName.includes('helmet') || itemName.includes('hat') || 
                 itemName.includes('circlet') || itemName.includes('crown')) {
        // Helmets protect head
        limbAC = { head: ac };
      } else if (subcategory.includes('boot') || subcategory.includes('shoe') || 
                 itemName.includes('boot') || itemName.includes('shoe')) {
        // Boots protect feet
        limbAC = { feet: ac };
      } else if (subcategory.includes('gauntlet') || subcategory.includes('glove') ||
                 itemName.includes('gauntlet') || itemName.includes('glove')) {
        // Gauntlets/gloves protect hands
        limbAC = { hands: ac };
      } else {
        // All other armor (chest pieces) protects torso/chest
        limbAC = { chest: ac };
      }
      
      // Update the item
      await pool.query(`
        UPDATE inventory 
        SET limb_armor_class = $1
        WHERE item_name = $2
      `, [JSON.stringify(limbAC), item.item_name]);
    }
  } catch (error) {
    console.error('Error updating armor with limb AC:', error);
    throw error;
  }
};

// Seed inventory with D&D 5e items
const seedInventory = async () => {
  try {
    // Check if inventory is already seeded
    const existingItems = await pool.query('SELECT COUNT(*) FROM inventory');
    if (parseInt(existingItems.rows[0].count) > 0) {
      console.log('Inventory already seeded, skipping...');
      return;
    }

    const items = [
      // Weapons - Simple Melee
      {
        item_name: 'Dagger',
        category: 'Weapon',
        subcategory: 'Simple Melee',
        description: 'A small, easily concealed blade. Light and finesse weapon that can be thrown.',
        damage_dice: '1d4',
        damage_type: 'piercing',
        range_normal: 20,
        range_long: 60,
        weight: 1.0,
        cost_cp: 200,
        properties: JSON.stringify(['finesse', 'light', 'thrown'])
      },
      {
        item_name: 'Mace',
        category: 'Weapon',
        subcategory: 'Simple Melee',
        description: 'A heavy club with a weighted head, designed to crush armor and bone.',
        damage_dice: '1d6',
        damage_type: 'bludgeoning',
        weight: 4.0,
        cost_cp: 500,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Spear',
        category: 'Weapon',
        subcategory: 'Simple Melee',
        description: 'A long shaft with a sharp point, versatile weapon that can be thrown.',
        damage_dice: '1d6',
        damage_type: 'piercing',
        range_normal: 20,
        range_long: 60,
        weight: 3.0,
        cost_cp: 100,
        properties: JSON.stringify(['thrown', 'versatile'])
      },
      
      // Weapons - Martial Melee
      {
        item_name: 'Longsword',
        category: 'Weapon',
        subcategory: 'Martial Melee',
        description: 'A straight, double-edged blade about 3 feet long. The classic knightly weapon.',
        damage_dice: '1d8',
        damage_type: 'slashing',
        weight: 3.0,
        cost_cp: 1500,
        properties: JSON.stringify(['versatile'])
      },
      {
        item_name: 'Rapier',
        category: 'Weapon',
        subcategory: 'Martial Melee',
        description: 'A thin, light sword designed for thrusting attacks. Favored by duelists.',
        damage_dice: '1d8',
        damage_type: 'piercing',
        weight: 2.0,
        cost_cp: 2500,
        properties: JSON.stringify(['finesse'])
      },
      {
        item_name: 'Shortsword',
        category: 'Weapon',
        subcategory: 'Martial Melee',
        description: 'A short, light sword designed for quick strikes and close combat.',
        damage_dice: '1d6',
        damage_type: 'piercing',
        weight: 2.0,
        cost_cp: 1000,
        properties: JSON.stringify(['finesse', 'light'])
      },
      
      // Weapons - Simple Ranged
      {
        item_name: 'Shortbow',
        category: 'Weapon',
        subcategory: 'Simple Ranged',
        description: 'A small bow made from a single piece of wood. Easy to use but limited range.',
        damage_dice: '1d6',
        damage_type: 'piercing',
        range_normal: 80,
        range_long: 320,
        weight: 2.0,
        cost_cp: 2500,
        properties: JSON.stringify(['ammunition', 'two-handed'])
      },
      
      // Weapons - Martial Ranged
      {
        item_name: 'Crossbow',
        category: 'Weapon',
        subcategory: 'Martial Ranged',
        description: 'A mechanical bow that shoots bolts with great force and accuracy.',
        damage_dice: '1d8',
        damage_type: 'piercing',
        range_normal: 100,
        range_long: 400,
        weight: 5.0,
        cost_cp: 7500,
        properties: JSON.stringify(['ammunition', 'loading', 'two-handed'])
      },
      
      // Armor - Light
      {
        item_name: 'Leather Armor',
        category: 'Armor',
        subcategory: 'Light Armor',
        description: 'Chest protection made from tough but flexible leather. Allows for good mobility.',
        armor_class: 11,
        limb_armor_class: JSON.stringify({ chest: 11 }),
        weight: 10.0,
        cost_cp: 1000,
        properties: JSON.stringify([])
      },
      
      // Armor - Medium
      {
        item_name: 'Chain Mail',
        category: 'Armor',
        subcategory: 'Medium Armor',
        description: 'Made of interlocking metal rings. Provides good protection with moderate mobility.',
        armor_class: 13,
        limb_armor_class: JSON.stringify({ chest: 13 }),
        weight: 20.0,
        cost_cp: 7500,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Scale Mail',
        category: 'Armor',
        subcategory: 'Medium Armor',
        description: 'Consists of a coat of leather covered with overlapping pieces of metal.',
        armor_class: 14,
        limb_armor_class: JSON.stringify({ chest: 14 }),
        weight: 45.0,
        cost_cp: 5000,
        stealth_disadvantage: true,
        properties: JSON.stringify([])
      },
      
      // Armor - Heavy
      {
        item_name: 'Plate Armor',
        category: 'Armor',
        subcategory: 'Heavy Armor',
        description: 'Plate consists of shaped, interlocking metal plates to cover the entire body.',
        armor_class: 18,
        limb_armor_class: JSON.stringify({ chest: 18 }),
        weight: 65.0,
        cost_cp: 150000,
        strength_requirement: 15,
        stealth_disadvantage: true,
        properties: JSON.stringify([])
      },
      
      // Shield
      {
        item_name: 'Shield',
        category: 'Armor',
        subcategory: 'Shield',
        description: 'A shield is made from wood or metal and is carried in one hand.',
        armor_class: 2,
        limb_armor_class: JSON.stringify({ hands: 2 }),
        weight: 6.0,
        cost_cp: 1000,
        properties: JSON.stringify([])
      },
      
      // Add some additional armor pieces for different limbs
      {
        item_name: 'Steel Helmet',
        category: 'Armor',
        subcategory: 'Helmet',
        description: 'A sturdy metal helmet that protects the head from blows.',
        armor_class: 5,
        limb_armor_class: JSON.stringify({ head: 5 }),
        weight: 3.0,
        cost_cp: 2500,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Leather Boots',
        category: 'Armor',
        subcategory: 'Light Armor',
        description: 'Sturdy leather boots reinforced for protection.',
        armor_class: 3,
        limb_armor_class: JSON.stringify({ feet: 3 }),
        weight: 2.0,
        cost_cp: 500,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Steel Boots',
        category: 'Armor',
        subcategory: 'Heavy Armor',
        description: 'Metal-plated boots that provide excellent protection for the feet.',
        armor_class: 6,
        limb_armor_class: JSON.stringify({ feet: 6 }),
        weight: 4.0,
        cost_cp: 3000,
        properties: JSON.stringify([])
      },
      
      // Tools
      {
        item_name: 'Thieves\' Tools',
        category: 'Tool',
        subcategory: 'Artisan Tools',
        description: 'Set of tools including a small file, lock picks, small mirror, and narrow-bladed scissors.',
        weight: 1.0,
        cost_cp: 2500,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Herbalism Kit',
        category: 'Tool',
        subcategory: 'Artisan Tools',
        description: 'Includes pouches to store herbs, clippers for gathering plants, and a mortar and pestle.',
        weight: 3.0,
        cost_cp: 500,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Smith\'s Tools',
        category: 'Tool',
        subcategory: 'Artisan Tools',
        description: 'Hammers, tongs, charcoal, rags, and a whetstone for working metal.',
        weight: 8.0,
        cost_cp: 2000,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Artisan\'s Tools',
        category: 'Tool',
        subcategory: 'Artisan Tools',
        description: 'Specialized tools for a particular craft or trade.',
        weight: 5.0,
        cost_cp: 3000,
        properties: JSON.stringify([])
      },
      
      // General Equipment
      {
        item_name: 'Backpack',
        category: 'General',
        subcategory: 'Container',
        description: 'A leather pack with shoulder straps. Can hold up to 30 pounds of gear.',
        weight: 5.0,
        cost_cp: 200,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Bedroll',
        category: 'General',
        subcategory: 'Camping Gear',
        description: 'A sleeping bag and blanket for outdoor rest.',
        weight: 7.0,
        cost_cp: 100,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Rope (50 feet)',
        category: 'General',
        subcategory: 'Utility',
        description: 'Hemp rope, useful for climbing, binding, or securing items.',
        weight: 10.0,
        cost_cp: 200,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Rations (1 day)',
        category: 'General',
        subcategory: 'Food & Drink',
        description: 'Dry foods suitable for extended travel, including jerky, nuts, and hardtack.',
        weight: 2.0,
        cost_cp: 100,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Waterskin',
        category: 'General',
        subcategory: 'Food & Drink',
        description: 'A leather container that can hold up to 4 pints of liquid.',
        weight: 5.0,
        cost_cp: 200,
        properties: JSON.stringify([])
      },
      {
        item_name: 'Torch',
        category: 'General',
        subcategory: 'Light Source',
        description: 'A wooden rod with wrapped cloth soaked in oil. Burns for 1 hour and sheds bright light.',
        weight: 1.0,
        cost_cp: 1,
        properties: JSON.stringify([])
      }
    ];

    // Insert all items
    for (const item of items) {
      await pool.query(`
        INSERT INTO inventory (
          item_name, category, subcategory, description, damage_dice, 
          damage_type, range_normal, range_long, weight, cost_cp, 
          armor_class, limb_armor_class, strength_requirement, stealth_disadvantage, properties, rarity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Common')
        ON CONFLICT (item_name) DO NOTHING
      `, [
        item.item_name, item.category, item.subcategory, item.description,
        item.damage_dice, item.damage_type, item.range_normal, item.range_long,
        item.weight, item.cost_cp, item.armor_class, item.limb_armor_class || '{}',
        item.strength_requirement, item.stealth_disadvantage, item.properties
      ]);
    }

    console.log('Inventory seeded successfully with D&D 5e items');
  } catch (error) {
    console.error('Error seeding inventory:', error);
  }
};

module.exports = {
  pool,
  initializeDB
};