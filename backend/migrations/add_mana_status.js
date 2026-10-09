/**
 * Migration: add_mana_status
 * Tier 8 mana. Stores each fief's latest daily power result so the Kingdom tab can mark buildings that
 * went unpowered: { unpowered: [buildingId...], draw: number, shortfall: boolean }.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE fiefs ADD COLUMN IF NOT EXISTS mana_status JSONB DEFAULT '{}'::jsonb`);
    await client.query('COMMIT');
    console.log('✅ add_mana_status migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_mana_status migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
