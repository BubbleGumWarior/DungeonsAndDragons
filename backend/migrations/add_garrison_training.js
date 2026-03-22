const { pool } = require('../models/database');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add garrison column to fiefs
    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS garrison JSONB DEFAULT '{"infantry":0,"archers":0,"cavalry":0}'::jsonb;
    `);

    // Backfill any NULLs
    await client.query(`
      UPDATE fiefs SET garrison = '{"infantry":0,"archers":0,"cavalry":0}'::jsonb
      WHERE garrison IS NULL;
    `);

    // Create training queue table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_training (
        id                       SERIAL PRIMARY KEY,
        fief_id                  INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        unit_type                VARCHAR(50) NOT NULL,
        count                    INTEGER NOT NULL DEFAULT 1,
        training_days_required   INTEGER NOT NULL,
        days_remaining           INTEGER NOT NULL,
        resource_cost            JSONB DEFAULT '{}'::jsonb,
        created_at               TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('Migration add_garrison_training: success');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = run;

if (require.main === module) {
  run().then(() => process.exit(0)).catch(() => process.exit(1));
}
