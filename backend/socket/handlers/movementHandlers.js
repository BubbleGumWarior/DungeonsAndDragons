/**
 * Movement event handlers
 * Handles character movement on world map, battle map, and battlefield
 */

module.exports = (socket, io, battleMovementState) => {
  // Handle real-time character movement on world map
  socket.on('characterMove', (data) => {
    try {
      const { campaignId, characterId, characterName, x, y } = data;
      // Broadcast to all users in the campaign except sender
      socket.to(`campaign_${campaignId}`).emit('characterMoved', {
        characterId,
        characterName,
        x,
        y,
        timestamp: new Date().toISOString()
      });
      console.log(`🗺️ Character moved: ${characterName} to (${x.toFixed(2)}, ${y.toFixed(2)}) in campaign ${campaignId}`);
    } catch (error) {
      console.error('Error handling character movement:', error);
    }
  });

  // Handle real-time character movement on battle map
  socket.on('characterBattleMove', (data) => {
    try {
      const { campaignId, characterId, characterName, x, y, remainingMovement } = data;

      // Initialize campaign movement state if not exists
      if (!battleMovementState[campaignId]) {
        battleMovementState[campaignId] = {};
      }

      // Update server-side movement state (authoritative)
      battleMovementState[campaignId][characterId] = remainingMovement;

      // Broadcast to all users in the campaign except sender
      socket.to(`campaign_${campaignId}`).emit('characterBattleMoved', {
        characterId,
        characterName,
        x,
        y,
        remainingMovement,
        timestamp: new Date().toISOString()
      });
      console.log(`⚔️ Battle character moved: ${characterName} to (${x.toFixed(2)}, ${y.toFixed(2)}) - ${remainingMovement}ft remaining in campaign ${campaignId}`);
    } catch (error) {
      console.error('Error handling battle character movement:', error);
    }
  });

  // Handle real-time battlefield participant movement (armies on battlefield map)
  socket.on('battlefieldParticipantMove', (data) => {
    try {
      const { campaignId, battleId, participantId, x, y, remainingMovement } = data;

      // Broadcast to all users in the campaign except sender
      socket.to(`campaign_${campaignId}`).emit('battlefieldParticipantMoved', {
        battleId,
        participantId,
        x,
        y,
        remainingMovement,
        timestamp: new Date().toISOString()
      });
      console.log(`🗺️ Battlefield participant ${participantId} moved to (${x.toFixed(2)}, ${y.toFixed(2)}) - ${remainingMovement !== undefined ? remainingMovement.toFixed(0) + 'ft remaining' : 'unlimited'} in battle ${battleId}, campaign ${campaignId}`);
    } catch (error) {
      console.error('Error handling battlefield participant movement:', error);
    }
  });
};
