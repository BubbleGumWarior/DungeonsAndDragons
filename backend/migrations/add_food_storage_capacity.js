/*
 * Migration: give food its own storage pool, separate from the general
 * (wood/stone/minerals/gold/faith) warehouse capacity.
 *
 * Previously all resources — including food — competed for the same shared
 * `storage_capacity` pool, which meant an idle woodpile could crowd out food
 * storage entirely and starve a population even with ample farming/hunting
 * production. `food_storage_capacity` is now tracked separately, scaled by
 * fief tier as a base, plus Granary-chain building bonuses on top.
 */
const { pool } = require('../models/database');

async function addFoodStorageCapacity() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS food_storage_capacity INTEGER NOT NULL DEFAULT 100
    `);

    // Backfill existing fiefs with a sane starting value based on tier (matches
    // Campaign.FOOD_STORAGE_BASE_BY_TIER) — the app will recompute the exact
    // figure (base + granary buildings + research) on the next fief load or
    // day advance anyway, this just avoids a bare 100 for higher-tier fiefs
    // in the interim.
    await client.query(`
      UPDATE fiefs
      SET food_storage_capacity = CASE
        WHEN tier >= 5 THEN 10000
        WHEN tier = 4 THEN 5000
        WHEN tier = 3 THEN 1000
        WHEN tier = 2 THEN 500
        ELSE 100
      END
      WHERE food_storage_capacity = 100
    `);

    await client.query('COMMIT');
    console.log('✅ add_food_storage_capacity: migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_food_storage_capacity migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addFoodStorageCapacity;

if (require.main === module) {
  addFoodStorageCapacity()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
