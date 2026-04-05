const { pool } = require('../models/database');

async function addPetsTable() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create character_pets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS character_pets (
        id                  SERIAL PRIMARY KEY,
        character_id        INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        campaign_id         INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name                TEXT NOT NULL,
        species             TEXT NOT NULL DEFAULT 'Unknown',
        description         TEXT DEFAULT '',
        hit_points          INTEGER NOT NULL DEFAULT 10,
        hit_points_current  INTEGER NOT NULL DEFAULT 10,
        armor_class         INTEGER NOT NULL DEFAULT 10,
        speed               INTEGER NOT NULL DEFAULT 30,
        abilities           JSONB NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":2,"wis":10,"cha":6}'::jsonb,
        is_battle_pet       BOOLEAN NOT NULL DEFAULT FALSE,
        image_url           TEXT,
        image_data          BYTEA,
        image_mime_type     TEXT,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_character_pets_character ON character_pets(character_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_character_pets_campaign ON character_pets(campaign_id)
    `);

    await client.query('COMMIT');
    console.log('✅ character_pets table created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating character_pets table:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addPetsTable;

if (require.main === module) {
  addPetsTable()
    .then(() => { console.log('Pets migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
