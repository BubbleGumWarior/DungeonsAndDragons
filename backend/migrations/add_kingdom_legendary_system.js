const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_legendary_characters (
        id SERIAL PRIMARY KEY,
        kingdom_id INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        bonuses JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_legendary_characters_kingdom
      ON kingdom_legendary_characters (kingdom_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_legendary_assignments (
        id SERIAL PRIMARY KEY,
        legendary_id INTEGER NOT NULL REFERENCES kingdom_legendary_characters(id) ON DELETE CASCADE,
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (legendary_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_legendary_assignments_fief
      ON kingdom_legendary_assignments (fief_id)
    `);

    await client.query('COMMIT');
    console.log('✅ add_kingdom_legendary_system complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_legendary_system failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = migrate;
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
