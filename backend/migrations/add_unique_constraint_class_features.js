const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function addUniqueConstraintToClassFeatures() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding unique constraint to class_features...');
    
    // First, check if index already exists
    const checkIndex = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'class_features' 
        AND indexname = 'class_features_unique_idx'
    `);
    
    if (checkIndex.rows.length > 0) {
      console.log('Unique index already exists, skipping');
      await client.query('COMMIT');
      return;
    }
    
    // Add unique index to prevent duplicate features (including NULL subclass_id)
    await client.query(`
      CREATE UNIQUE INDEX class_features_unique_idx
      ON class_features (class, level, name, COALESCE(subclass_id, -1))
    `);
    
    await client.query('COMMIT');
    console.log('✅ Unique index added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding unique constraint:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addUniqueConstraintToClassFeatures;

// Run directly if called as script
if (require.main === module) {
  addUniqueConstraintToClassFeatures()
    .then(() => {
      console.log('Unique constraint migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
