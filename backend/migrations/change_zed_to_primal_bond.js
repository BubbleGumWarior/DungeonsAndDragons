const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function changeZedToPrimalBond() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Finding character named Zed...');
    
    // Find Zed
    const zedResult = await client.query(`
      SELECT id, name, class, level 
      FROM characters 
      WHERE name = 'Zed'
    `);
    
    if (zedResult.rows.length === 0) {
      console.log('❌ Character named Zed not found');
      await client.query('ROLLBACK');
      return;
    }
    
    const zed = zedResult.rows[0];
    console.log(`Found: ${zed.name} (ID: ${zed.id}), Current class: ${zed.class}, Level: ${zed.level}`);
    
    // Update Zed's class to Primal Bond
    console.log('Changing class to Primal Bond...');
    await client.query(`
      UPDATE characters
      SET class = 'Primal Bond',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [zed.id]);
    
    // Remove any existing character skills that don't match Primal Bond
    console.log('Removing old class skills...');
    await client.query(`
      DELETE FROM character_skills
      WHERE character_id = $1
        AND skill_id IN (
          SELECT id FROM skills 
          WHERE class_restriction IS NOT NULL 
            AND class_restriction != 'Primal Bond'
        )
    `, [zed.id]);
    
    // Remove any subclass that doesn't belong to Primal Bond
    console.log('Removing old subclass...');
    await client.query(`
      DELETE FROM character_subclasses
      WHERE character_id = $1
        AND subclass_id NOT IN (
          SELECT id FROM subclasses WHERE class = 'Primal Bond'
        )
    `, [zed.id]);
    
    await client.query('COMMIT');
    console.log('✅ Zed successfully changed to Primal Bond class!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error changing Zed to Primal Bond:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = changeZedToPrimalBond;

// Run directly if called as script
if (require.main === module) {
  changeZedToPrimalBond()
    .then(() => {
      console.log('Migration completed');
      pool.end();
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}
