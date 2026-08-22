const { pool } = require('../models/database');

async function addCompanionArmorLimbsAndCharStockpile() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Food stockpile: per-player → per-character ──────────────────────────
    // Brand-new feature, no production data depends on the old shape yet — clean cut-over.
    await client.query(`DROP TABLE IF EXISTS player_food_stockpiles CASCADE`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS character_food_stockpiles (
        id              SERIAL PRIMARY KEY,
        campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        meat_rations    INTEGER NOT NULL DEFAULT 0,
        veg_rations     INTEGER NOT NULL DEFAULT 0,
        max_slots       INTEGER NOT NULL DEFAULT 10,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, character_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_character_food_stockpiles_campaign ON character_food_stockpiles(campaign_id)`);

    await client.query(`ALTER TABLE campaigns DROP COLUMN IF EXISTS pet_food_default_max_slots`);

    // ── Companion armor system ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS companion_armor_items (
        id                  SERIAL PRIMARY KEY,
        campaign_id         INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id        INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        kind                TEXT NOT NULL DEFAULT 'mount',
        name                TEXT NOT NULL,
        description         TEXT DEFAULT '',
        armor_class_bonus   INTEGER NOT NULL DEFAULT 0,
        slot                TEXT,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`ALTER TABLE companion_armor_items ADD COLUMN IF NOT EXISTS slot TEXT`);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE companion_armor_items ADD CONSTRAINT companion_armor_items_kind_check CHECK (kind IN ('mount','pet'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE companion_armor_items ADD CONSTRAINT companion_armor_items_slot_check CHECK (slot IS NULL OR slot IN ('head','body','front_legs','rear_legs'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companion_armor_items_character ON companion_armor_items(character_id)`);

    // ── Pets: single armor slot + real limb health ───────────────────────────
    await client.query(`
      ALTER TABLE character_pets
        ADD COLUMN IF NOT EXISTS armor_item_id     INTEGER REFERENCES companion_armor_items(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS limb_health        JSONB,
        ADD COLUMN IF NOT EXISTS temp_limb_health    JSONB
    `);

    // ── Mounts: 4 armor slots + real limb health + persisted current HP + abilities + DB images ──
    await client.query(`
      ALTER TABLE campaign_mounts
        ADD COLUMN IF NOT EXISTS armor_head_id        INTEGER REFERENCES companion_armor_items(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS armor_body_id         INTEGER REFERENCES companion_armor_items(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS armor_front_legs_id    INTEGER REFERENCES companion_armor_items(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS armor_rear_legs_id     INTEGER REFERENCES companion_armor_items(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS limb_health           JSONB,
        ADD COLUMN IF NOT EXISTS temp_limb_health       JSONB,
        ADD COLUMN IF NOT EXISTS hit_points_current     INTEGER,
        ADD COLUMN IF NOT EXISTS abilities              JSONB NOT NULL DEFAULT '{"str":16,"dex":13,"con":15,"int":2,"wis":12,"cha":7}'::jsonb,
        ADD COLUMN IF NOT EXISTS image_data              BYTEA,
        ADD COLUMN IF NOT EXISTS image_mime_type          TEXT
    `);
    await client.query(`UPDATE campaign_mounts SET hit_points_current = hp WHERE hit_points_current IS NULL`);

    await client.query('COMMIT');
    console.log('✅ Companion armor/limb-health/per-character-stockpile migration applied');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error applying companion armor/limb-health migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCompanionArmorLimbsAndCharStockpile;

if (require.main === module) {
  addCompanionArmorLimbsAndCharStockpile()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
