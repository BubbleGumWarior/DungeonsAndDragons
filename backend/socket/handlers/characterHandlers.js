/**
 * Character event handlers
 * Handles real-time character stat updates (abilities, skills, etc.)
 */

module.exports = (socket, io) => {
  console.log('🎯 Character handlers registered for socket:', socket.id);
  
  // Handle ability score updates
  socket.on('abilityUpdated', (data) => {
    console.log('📥 Backend received abilityUpdated event:', data);
    try {
      const { campaignId, characterId, ability, newScore } = data;
      console.log(`📤 Broadcasting ability update to campaign_${campaignId}:`, { characterId, ability, newScore });
      // Broadcast to all users in the campaign
      io.to(`campaign_${campaignId}`).emit('abilityUpdated', {
        campaignId,
        characterId,
        ability,
        newScore,
        timestamp: new Date().toISOString()
      });
      console.log(`📊 Ability update: Character ${characterId} ${ability.toUpperCase()} set to ${newScore}`);
    } catch (error) {
      console.error('Error handling ability update:', error);
    }
  });

  // Handle skill proficiency updates
  socket.on('skillProficiencyToggled', (data) => {
    try {
      const { campaignId, characterId, skillName, isAdding } = data;
      // Broadcast to all users in the campaign
      io.to(`campaign_${campaignId}`).emit('skillProficiencyToggled', {
        campaignId,
        characterId,
        skillName,
        isAdding,
        timestamp: new Date().toISOString()
      });
      const action = isAdding ? 'added to' : 'removed from';
      console.log(`✨ Skill update: ${skillName} ${action} character ${characterId}`);
    } catch (error) {
      console.error('Error handling skill proficiency toggle:', error);
    }
  });
};
