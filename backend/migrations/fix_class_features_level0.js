const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function fixClassFeaturesLevelConstraint() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Dropping old class_features_level_check constraint...');
    await client.query(`
      ALTER TABLE class_features
      DROP CONSTRAINT IF EXISTS class_features_level_check
    `);
    
    console.log('Adding new class_features_level_check constraint (allowing level 0)...');
    await client.query(`
      ALTER TABLE class_features
      ADD CONSTRAINT class_features_level_check CHECK (level >= 0 AND level <= 20)
    `);
    
    await client.query('COMMIT');
    console.log('✅ Class features level constraint updated to allow level 0');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating class_features level constraint:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = fixClassFeaturesLevelConstraint;

// Run directly if called as script
if (require.main === module) {
  fixClassFeaturesLevelConstraint()
    .then(() => {
      console.log('Constraint fix completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
