const { pool } = require('../models/database');

async function addShadowImageUrl() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE character_shadows
        ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL
    `);

    console.log('✅ image_url column added to character_shadows');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding image_url to character_shadows:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addShadowImageUrl;

if (require.main === module) {
  addShadowImageUrl()
    .then(() => { console.log('Shadow image_url migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
