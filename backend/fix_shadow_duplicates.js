const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432
});

async function fixDuplicates() {
  try {
    console.log('Deleting ALL duplicate class features...');
    
    // Keep only the oldest entry (lowest id) for each unique (class, level, name, subclass_id) combination
    const result = await pool.query(`
      DELETE FROM class_features
      WHERE id IN (
        SELECT id
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY class, level, name, COALESCE(subclass_id, -1) ORDER BY id) as rn
          FROM class_features
        ) t
        WHERE t.rn > 1
      )
    `);
    
    console.log(`Deleted ${result.rowCount} duplicate features`);
    
    // Verify the cleanup
    const check = await pool.query(`
      SELECT class, level, name, subclass_id, COUNT(*) as count 
      FROM class_features 
      GROUP BY class, level, name, subclass_id
      HAVING COUNT(*) > 1
    `);
    
    console.log(`Remaining duplicates: ${check.rows.length}`);
    if (check.rows.length > 0) {
      console.log(check.rows);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
