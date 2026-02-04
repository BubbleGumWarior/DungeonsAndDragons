/**
 * Battle (mass combat) event handlers
 * Handles large-scale army battles with positioning and movement
 */

module.exports = (socket, io) => {
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
