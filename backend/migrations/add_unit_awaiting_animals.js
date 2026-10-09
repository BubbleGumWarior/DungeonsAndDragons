const { pool } = require('../models/database');

// Built-in troops that need a War Horse / Destrier (mirrors MOUNTED_UNIT_LINES in routes/kingdoms.js).
const MOUNTED_UNITS = [
  'Squire', 'Man-at-Arms', 'Heavy Cavalry', 'Knight',
  'Mounted Archer', 'Horse Archer',
  'Spearman Cavalry', 'Shock Cavalry',
  'Lancer', 'Royal Lancer',
];

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'fiefs' AND column_name = 'unit_awaiting_animals'`
    );
    const firstRun = existing.rows.length === 0;

    // Troops that need an animal but have none wait here instead of in unit_reserves.
    await client.query(`ALTER TABLE fiefs ADD COLUMN IF NOT EXISTS unit_awaiting_animals JSONB NOT NULL DEFAULT '{}'::jsonb`);
    // How many recruits of a training batch were given an animal when it was queued.
    await client.query(`ALTER TABLE fief_training ADD COLUMN IF NOT EXISTS animals_locked INTEGER NOT NULL DEFAULT 0`);

    if (firstRun) {
      // Troops that already exist and need an animal lose their place in the reserve / guard posts
      // until the player assigns animals to them (animals already bound keep their troops mounted).
      const fiefs = await client.query(`SELECT id, unit_reserves, unit_awaiting_animals FROM fiefs`);
      for (const fief of fiefs.rows) {
        const reserves = { ...(fief.unit_reserves || {}) };
        const awaiting = { ...(fief.unit_awaiting_animals || {}) };
        let changed = false;
        for (const unit of MOUNTED_UNITS) {
          const bound = Number((await client.query(
            `SELECT COUNT(*)::int AS n FROM fief_animals WHERE fief_id = $1 AND assigned_unit_type = $2`, [fief.id, unit]
          )).rows[0].n);
          let coverage = bound;

          const reserve = Math.max(0, Number(reserves[unit] || 0));
          const keep = Math.min(reserve, coverage);
          coverage -= keep;
          if (reserve - keep > 0) {
            awaiting[unit] = Number(awaiting[unit] || 0) + (reserve - keep);
            changed = true;
          }
          if (reserve > 0) reserves[unit] = keep;

          const training = await client.query(
            `SELECT id, COALESCE(count, 1) AS count FROM fief_training
             WHERE fief_id = $1 AND unit_type = $2 AND status IN ('training', 'ready') ORDER BY id`, [fief.id, unit]
          );
          for (const row of training.rows) {
            const locked = Math.min(Number(row.count), coverage);
            coverage -= locked;
            await client.query(`UPDATE fief_training SET animals_locked = $2 WHERE id = $1`, [row.id, locked]);
          }

          const buildings = await client.query(
            `SELECT id, assigned_guards_by_type FROM fief_buildings WHERE fief_id = $1 AND assigned_guards_by_type ? $2`, [fief.id, unit]
          );
          for (const b of buildings.rows) {
            const guards = { ...(b.assigned_guards_by_type || {}) };
            const posted = Math.max(0, Number(guards[unit] || 0));
            const keepPosted = Math.min(posted, coverage);
            coverage -= keepPosted;
            if (posted - keepPosted > 0) {
              awaiting[unit] = Number(awaiting[unit] || 0) + (posted - keepPosted);
              changed = true;
            }
            if (keepPosted > 0) guards[unit] = keepPosted; else delete guards[unit];
            await client.query(`UPDATE fief_buildings SET assigned_guards_by_type = $2::jsonb WHERE id = $1`, [b.id, JSON.stringify(guards)]);
          }
        }
        if (changed) {
          await client.query(
            `UPDATE fiefs SET unit_reserves = $2::jsonb, unit_awaiting_animals = $3::jsonb WHERE id = $1`,
            [fief.id, JSON.stringify(reserves), JSON.stringify(awaiting)]
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ add_unit_awaiting_animals complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_unit_awaiting_animals failed:', error.message);
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
