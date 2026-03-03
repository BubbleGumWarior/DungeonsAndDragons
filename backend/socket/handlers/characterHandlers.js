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

  // Handle armor class updates
  socket.on('armorClassUpdated', (data) => {
    console.log('📥 Backend received armorClassUpdated event:', data);
    try {
      const { campaignId, characterId, newArmorClass } = data;
      console.log(`📤 Broadcasting armor class update to campaign_${campaignId}:`, { characterId, newArmorClass });
      io.to(`campaign_${campaignId}`).emit('armorClassUpdated', {
        campaignId,
        characterId,
        newArmorClass,
        timestamp: new Date().toISOString()
      });
      console.log(`🛡️ Armor class update: Character ${characterId} AC set to ${newArmorClass}`);
    } catch (error) {
      console.error('Error handling armor class update:', error);
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
