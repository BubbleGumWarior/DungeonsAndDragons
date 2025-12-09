const pool = require('../models/database').pool;

async function migrateFactionSupport() {
  try {
    console.log('🔄 Starting faction support migration...');

    // Add faction_color to battle_participants
    await pool.query(`
      ALTER TABLE battle_participants 
      ADD COLUMN IF NOT EXISTS faction_color VARCHAR(7) DEFAULT '#808080',
      ADD COLUMN IF NOT EXISTS has_selected_goal BOOLEAN DEFAULT FALSE;
    `);
    console.log('✅ Added faction_color and has_selected_goal to battle_participants');

    // Add faction_color to battle_invitations
    await pool.query(`
      ALTER TABLE battle_invitations 
      ADD COLUMN IF NOT EXISTS faction_color VARCHAR(7) DEFAULT '#808080';
    `);
    console.log('✅ Added faction_color to battle_invitations');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateFactionSupport()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrateFactionSupport;
