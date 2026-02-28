const { pool } = require('../models/database');

/**
 * Migration: Clean up old filesystem image paths
 * 
 * This migration removes old filesystem image paths (e.g., /uploads/characters/...)
 * from the image_url column for characters that don't have image_data.
 * This prevents 404 errors for images that were never migrated to database storage.
 */

async function cleanupOldImagePaths() {
  const client = await pool.connect();
  
  try {
    console.log('Starting cleanup of old filesystem image paths...');
    
    // Clear image_url for characters with filesystem paths but no image_data
    const result = await client.query(`
      UPDATE characters
      SET image_url = NULL
      WHERE image_url LIKE '/uploads/%'
        AND (image_data IS NULL OR image_data = '')
    `);
    
    console.log(`✓ Cleaned up ${result.rowCount} old image path(s)`);
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  cleanupOldImagePaths()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = cleanupOldImagePaths;
