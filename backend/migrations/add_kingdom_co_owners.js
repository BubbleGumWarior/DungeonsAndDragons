/**
 * Migration: add_kingdom_co_owners
 * Creates a kingdom_co_owners table so multiple players can share a kingdom.
 */
const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_co_owners (
        id          SERIAL PRIMARY KEY,
        kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        player_id   INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (kingdom_id, player_id)
      )
    `);
    console.log('✅ kingdom_co_owners table created (or already exists)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_co_owners_kingdom_id
        ON kingdom_co_owners (kingdom_id)
    `);
    console.log('✅ index on kingdom_co_owners.kingdom_id ensured');

    await client.query('COMMIT');
    console.log('✅ Migration add_kingdom_co_owners complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
