const { pool } = require('./models/database');

async function resetBattle() {
  try {
    console.log('Checking battle 1 participants...');
    const res = await pool.query(
      `SELECT id, team_name, has_selected_goal, 
              COALESCE(temp_army_name, 'Army '||id) as name 
       FROM battle_participants 
       WHERE battle_id = 1 
       ORDER BY team_name, id`
    );
    console.table(res.rows);
    
    console.log('\nResetting battle to goal_selection status...');
    await pool.query("UPDATE battles SET status = 'goal_selection', current_round = 1 WHERE id = 1");
    await pool.query("UPDATE battle_participants SET has_selected_goal = false WHERE battle_id = 1");
    await pool.query("DELETE FROM battle_goals WHERE battle_id = 1 AND round_number = 1");
    
    console.log('✅ Battle reset successfully!\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

resetBattle();
