/**
 * Equipment event handlers
 * Handles real-time equipment and inventory updates
 */

module.exports = (socket, io) => {
  // Handle equipment changes
  socket.on('equipmentUpdate', (data) => {
    try {
      const { campaignId, characterId, action, slot, itemName } = data;
      // Broadcast to all users in the campaign except sender
      socket.to(`campaign_${campaignId}`).emit('equipmentChanged', {
        characterId,
        action, // 'equip' or 'unequip'
        slot,
        itemName,
        timestamp: new Date().toISOString()
      });
      console.log(`⚔️ Equipment update: ${action} ${itemName} in ${slot} for character ${characterId}`);
    } catch (error) {
      console.error('Error handling equipment update:', error);
    }
  });

  // Handle inventory changes
  socket.on('inventoryUpdate', (data) => {
    try {
      const { campaignId, characterId, action, itemName, unequippedFrom, isCustom } = data;
      // Broadcast to all users in the campaign except sender
      socket.to(`campaign_${campaignId}`).emit('inventoryChanged', {
        characterId,
        action, // 'add' or 'remove'
        itemName,
        unequippedFrom,
        isCustom,
        timestamp: new Date().toISOString()
      });
      console.log(`🎒 Inventory update: ${action} ${itemName} for character ${characterId}${isCustom ? ' (custom item)' : ''}`);
    } catch (error) {
      console.error('Error handling inventory update:', error);
    }
  });
};
