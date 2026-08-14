const { pool } = require('../models/database');

// Shadow images used to be written to disk (backend/uploads/shadows). Railway's
// filesystem is ephemeral, so every redeploy wiped those files out from under
// existing rows. Store the image bytes in the database instead (like character/
// pet/monster images already do) so they survive rebuilds.
async function addShadowImageData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE character_shadows
        ADD COLUMN IF NOT EXISTS image_data BYTEA DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(100) DEFAULT NULL
    `);

    // Old filesystem paths are dead links now (the files no longer exist after
    // a redeploy) - clear them so the UI falls back to the default portrait
    // instead of a broken image request.
    await client.query(`
      UPDATE character_shadows
         SET image_url = NULL
       WHERE image_url LIKE '/uploads/%'
    `);

    console.log('✅ image_data/image_mime_type columns added to character_shadows');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding image_data to character_shadows:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addShadowImageData;

if (require.main === module) {
  addShadowImageData()
    .then(() => { console.log('Shadow image_data migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
