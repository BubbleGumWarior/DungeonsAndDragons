const { pool } = require('../models/database');

// One-time price bump: pet food is priced in copper (characters.gold is already stored as total
// copper pieces), and the old 5cp/3cp defaults were placeholders. Bumps the column DEFAULT for any
// future campaigns, and back-fills existing campaigns still sitting at the old defaults.
async function updatePetFoodDefaultPrices() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE campaigns ALTER COLUMN pet_food_meat_price SET DEFAULT 85`);
    await client.query(`ALTER TABLE campaigns ALTER COLUMN pet_food_veg_price SET DEFAULT 42`);

    // Only touch rows still at the old default — a DM who already customized their price is left alone.
    const meatResult = await client.query(`UPDATE campaigns SET pet_food_meat_price = 85 WHERE pet_food_meat_price = 5`);
    const vegResult = await client.query(`UPDATE campaigns SET pet_food_veg_price = 42 WHERE pet_food_veg_price = 3`);

    await client.query('COMMIT');
    console.log(`✅ Pet food default prices updated (${meatResult.rowCount} meat, ${vegResult.rowCount} veg campaign rows backfilled)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating pet food default prices:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = updatePetFoodDefaultPrices;

if (require.main === module) {
  updatePetFoodDefaultPrices()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
