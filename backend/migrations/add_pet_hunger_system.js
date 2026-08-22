const { pool } = require('../models/database');

async function addPetHungerSystem() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Diet / hunger / feeding-mode columns on pets and mounts ────────────
    await client.query(`
      ALTER TABLE character_pets
        ADD COLUMN IF NOT EXISTS diet             TEXT NOT NULL DEFAULT 'omnivore',
        ADD COLUMN IF NOT EXISTS food_consumption  INTEGER NOT NULL DEFAULT 4,
        ADD COLUMN IF NOT EXISTS hunger            INTEGER NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS feeding_mode      TEXT NOT NULL DEFAULT 'self'
    `);
    // Postgres has no "ADD CONSTRAINT IF NOT EXISTS" — guard with a DO block instead.
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE character_pets ADD CONSTRAINT character_pets_diet_check CHECK (diet IN ('herbivore','carnivore','omnivore'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE character_pets ADD CONSTRAINT character_pets_feeding_mode_check CHECK (feeding_mode IN ('self','automatic'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      ALTER TABLE campaign_mounts
        ADD COLUMN IF NOT EXISTS diet             TEXT NOT NULL DEFAULT 'omnivore',
        ADD COLUMN IF NOT EXISTS food_consumption  INTEGER NOT NULL DEFAULT 4,
        ADD COLUMN IF NOT EXISTS hunger            INTEGER NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS feeding_mode      TEXT NOT NULL DEFAULT 'self'
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE campaign_mounts ADD CONSTRAINT campaign_mounts_diet_check CHECK (diet IN ('herbivore','carnivore','omnivore'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE campaign_mounts ADD CONSTRAINT campaign_mounts_feeding_mode_check CHECK (feeding_mode IN ('self','automatic'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ── Campaign-wide food market settings ──────────────────────────────────
    await client.query(`
      ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS pet_food_meat_price        INTEGER NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS pet_food_veg_price          INTEGER NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS pet_food_default_max_slots  INTEGER NOT NULL DEFAULT 10
    `);

    // ── Per-player shared food stockpile ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_food_stockpiles (
        id                  SERIAL PRIMARY KEY,
        campaign_id         INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        meat_rations        INTEGER NOT NULL DEFAULT 0,
        veg_rations         INTEGER NOT NULL DEFAULT 0,
        max_slots_override  INTEGER,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, player_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_player_food_stockpiles_campaign ON player_food_stockpiles(campaign_id)
    `);

    await client.query('COMMIT');
    console.log('✅ Pet hunger system migration applied (diet/hunger/feeding columns + player_food_stockpiles)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error applying pet hunger system migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addPetHungerSystem;

if (require.main === module) {
  addPetHungerSystem()
    .then(() => { console.log('Pet hunger system migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
