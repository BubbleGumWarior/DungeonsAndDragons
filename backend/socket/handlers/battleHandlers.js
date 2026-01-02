/**
 * Battle (mass combat) event handlers
 * Handles large-scale army battles with goal selection and resolution
 */

module.exports = (socket, io) => {
  // Team has selected their goal
  socket.on('teamGoalSelected', (data) => {
    try {
      const { campaignId, battleId, teamName } = data;
      // Broadcast to all clients that this team has selected
      io.to(`campaign_${campaignId}`).emit('teamGoalSelected', {
        battleId,
        teamName,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ Team ${teamName} selected goal for battle ${battleId}`);
    } catch (error) {
      console.error('Error handling team goal selection:', error);
    }
  });

  // Player rolls for a battle goal
  socket.on('battleGoalRolled', (data) => {
    try {
      const { campaignId, goalId, participantId, diceRoll, totalModifier } = data;
      // Broadcast the roll to everyone (DM needs to see it)
      io.to(`campaign_${campaignId}`).emit('battleGoalRollUpdate', {
        goalId,
        participantId,
        diceRoll,
        totalModifier,
        total: diceRoll + totalModifier,
        timestamp: new Date().toISOString()
      });
      console.log(`🎲 Battle goal roll: ${diceRoll} + ${totalModifier} = ${diceRoll + totalModifier}`);
    } catch (error) {
      console.error('Error handling battle goal roll:', error);
    }
  });

  // DM resolves a goal (sets DC and success/fail)
  socket.on('battleGoalResolved', (data) => {
    try {
      const { campaignId, goalId, dc, success, modifierApplied } = data;
      // Broadcast resolution to everyone
      io.to(`campaign_${campaignId}`).emit('battleGoalResolutionUpdate', {
        goalId,
        dc,
        success,
        modifierApplied,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ Battle goal ${goalId} resolved: DC ${dc}, ${success ? 'Success' : 'Fail'}, modifier: ${modifierApplied}`);
    } catch (error) {
      console.error('Error handling battle goal resolution:', error);
    }
  });

  // Request battle state refresh
  socket.on('requestBattleUpdate', (data) => {
    try {
      const { campaignId, battleId } = data;
      // Trigger all clients to refresh battle state
      io.to(`campaign_${campaignId}`).emit('battleStateRefresh', {
        battleId,
        timestamp: new Date().toISOString()
      });
      console.log(`🔄 Battle state refresh requested for battle ${battleId}`);
    } catch (error) {
      console.error('Error handling battle update request:', error);
    }
  });
};
