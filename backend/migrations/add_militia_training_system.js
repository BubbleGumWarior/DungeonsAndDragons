const { pool } = require('../models/database');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Store typed reserve units directly on fiefs.
    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS unit_reserves JSONB DEFAULT '{}'::jsonb;
    `);

    await client.query(`
      UPDATE fiefs
      SET unit_reserves = '{}'::jsonb
      WHERE unit_reserves IS NULL;
    `);

    // Ensure the training table exists and supports per-unit, per-row timers.
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_training (
        id SERIAL PRIMARY KEY,
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        unit_type VARCHAR(60) NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        training_days_required INTEGER NOT NULL,
        days_remaining INTEGER NOT NULL,
        resource_cost JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE fief_training
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'training',
      ADD COLUMN IF NOT EXISTS started_day INTEGER,
      ADD COLUMN IF NOT EXISTS complete_day INTEGER,
      ADD COLUMN IF NOT EXISTS source_unit_type VARCHAR(60),
      ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS linked_army_id INTEGER REFERENCES armies(id) ON DELETE SET NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fief_training_fief_status
      ON fief_training (fief_id, status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fief_training_complete_day
      ON fief_training (complete_day)
      WHERE status = 'training';
    `);

    // Building-level guard assignments (typed). Example: {"Militia": 6, "Guard": 2}
    await client.query(`
      ALTER TABLE fief_buildings
      ADD COLUMN IF NOT EXISTS assigned_guards_by_type JSONB DEFAULT '{}'::jsonb;
    `);

    await client.query(`
      UPDATE fief_buildings
      SET assigned_guards_by_type = '{}'::jsonb
      WHERE assigned_guards_by_type IS NULL;
    `);

    // Transition legacy soldiers into Militia reserve while preserving current value.
    await client.query(`
      UPDATE fiefs
      SET unit_reserves = CASE
        WHEN COALESCE(soldiers, 0) > 0 THEN jsonb_set(COALESCE(unit_reserves, '{}'::jsonb), '{Militia}', to_jsonb(COALESCE(soldiers, 0)), true)
        ELSE COALESCE(unit_reserves, '{}'::jsonb)
      END;
    `);

    // Normalize queue rows to be one unit per row for exploit-proof timing.
    await client.query(`
      UPDATE fief_training
      SET count = 1
      WHERE count IS NULL OR count <= 0;
    `);

    await client.query(`
      UPDATE fief_training
      SET status = 'training'
      WHERE status IS NULL OR status = '';
    `);

    await client.query(`
      UPDATE fief_training
      SET days_remaining = GREATEST(0, COALESCE(days_remaining, 0));
    `);

    await client.query(`
      UPDATE fief_training
      SET complete_day = COALESCE(complete_day, COALESCE(started_day, 0) + GREATEST(0, COALESCE(training_days_required, 0)))
      WHERE complete_day IS NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ add_militia_training_system: migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_militia_training_system failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = run;

if (require.main === module) {
  run().then(() => process.exit(0)).catch(() => process.exit(1));
}
