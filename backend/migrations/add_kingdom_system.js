/**
 * Migration: add_kingdom_system
 * Adds full kingdom management tables: fiefs, fief_buildings, fief_event_log,
 * kingdom_events, kingdom_actions.
 * Also adds current_day to campaigns and expands the kingdoms table.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── campaigns: add current_day ────────────────────────────────────────────
    const hasCampaignDay = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'current_day'
    `);
    if (hasCampaignDay.rows.length === 0) {
      await client.query(`ALTER TABLE campaigns ADD COLUMN current_day INT DEFAULT 1`);
      console.log('✅ campaigns.current_day added');
    } else {
      console.log('  campaigns.current_day already exists');
    }

    // ── kingdoms: add tier, resources, stats, population ─────────────────────
    const kingdomCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'kingdoms'
    `);
    const kColNames = kingdomCols.rows.map(r => r.column_name);

    if (!kColNames.includes('tier')) {
      await client.query(`ALTER TABLE kingdoms ADD COLUMN tier INT DEFAULT 1`);
      console.log('✅ kingdoms.tier added');
    }
    if (!kColNames.includes('resources')) {
      await client.query(`
        ALTER TABLE kingdoms
        ADD COLUMN resources JSONB DEFAULT '{"gold":0,"food":0,"wood":0,"stone":0}'::jsonb
      `);
      console.log('✅ kingdoms.resources added');
    }
    if (!kColNames.includes('stats')) {
      await client.query(`
        ALTER TABLE kingdoms
        ADD COLUMN stats JSONB DEFAULT '{"economy":5,"military":5,"stability":5}'::jsonb
      `);
      console.log('✅ kingdoms.stats added');
    }
    if (!kColNames.includes('population')) {
      await client.query(`ALTER TABLE kingdoms ADD COLUMN population INT DEFAULT 0`);
      console.log('✅ kingdoms.population added');
    }

    // ── fiefs table ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fiefs (
        id               SERIAL PRIMARY KEY,
        kingdom_id       INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        name             VARCHAR(255) NOT NULL,
        tier             INT DEFAULT 1,
        resources        JSONB DEFAULT '{"gold":0,"food":0,"wood":0,"stone":0}'::jsonb,
        stats            JSONB DEFAULT '{"economy":5,"military":5,"stability":5}'::jsonb,
        population       INT DEFAULT 0,
        is_capital       BOOLEAN DEFAULT false,
        created_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fiefs_kingdom ON fiefs(kingdom_id);`);
    console.log('✅ fiefs table ready');

    // ── fief_buildings table ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_buildings (
        id                          SERIAL PRIMARY KEY,
        fief_id                     INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        name                        VARCHAR(255) NOT NULL,
        building_type               VARCHAR(100) NOT NULL,
        level                       INT DEFAULT 1,
        description                 TEXT,
        construction_days_required  INT NOT NULL,
        days_remaining              INT NOT NULL,
        is_complete                 BOOLEAN DEFAULT false,
        is_upgrade                  BOOLEAN DEFAULT false,
        parent_building_id          INTEGER REFERENCES fief_buildings(id) ON DELETE SET NULL,
        resource_output             JSONB DEFAULT '{}'::jsonb,
        resource_cost               JSONB DEFAULT '{}'::jsonb,
        temp_output_modifier        JSONB DEFAULT '{}'::jsonb,
        temp_modifier_days_remaining INT DEFAULT 0,
        built_at                    TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fief_buildings_fief ON fief_buildings(fief_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fief_buildings_complete ON fief_buildings(is_complete);`);
    console.log('✅ fief_buildings table ready');

    // ── fief_event_log table ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_event_log (
        id           SERIAL PRIMARY KEY,
        fief_id      INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        campaign_day INT NOT NULL,
        event_type   VARCHAR(50) NOT NULL,
        title        VARCHAR(255) NOT NULL,
        details      JSONB DEFAULT '{}'::jsonb,
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fief_event_log_fief ON fief_event_log(fief_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fief_event_log_day ON fief_event_log(campaign_day);`);
    console.log('✅ fief_event_log table ready');

    // ── kingdom_events table ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_events (
        id          SERIAL PRIMARY KEY,
        kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        fief_id     INTEGER REFERENCES fiefs(id) ON DELETE SET NULL,
        title       VARCHAR(255) NOT NULL,
        description TEXT,
        event_type  VARCHAR(50) DEFAULT 'announcement',
        severity    VARCHAR(20) DEFAULT 'low',
        is_resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_kingdom_events_kingdom ON kingdom_events(kingdom_id);`);
    console.log('✅ kingdom_events table ready');

    // ── kingdom_actions table ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_actions (
        id           SERIAL PRIMARY KEY,
        kingdom_id   INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        fief_id      INTEGER REFERENCES fiefs(id) ON DELETE SET NULL,
        title        VARCHAR(255) NOT NULL,
        description  TEXT,
        action_type  VARCHAR(100),
        is_completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP,
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_kingdom_actions_kingdom ON kingdom_actions(kingdom_id);`);
    console.log('✅ kingdom_actions table ready');

    await client.query('COMMIT');
    console.log('\n🎉 Kingdom system migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
