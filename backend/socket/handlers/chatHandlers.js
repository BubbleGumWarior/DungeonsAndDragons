const { pool } = require('../../models/database');

module.exports = (socket, io, userSocketMap) => {
  // Send a chat message
  socket.on('chatMessage', async ({ campaignId, content }) => {
    try {
      if (!campaignId || !content || !content.trim()) return;

      const userId = socket.userId;
      if (!userId) return;

      // Fetch user and verify campaign membership
      const userResult = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) return;
      const user = userResult.rows[0];

      // Verify membership: DM of campaign or has a character in campaign
      const campaignResult = await pool.query('SELECT dungeon_master_id FROM campaigns WHERE id = $1', [campaignId]);
      if (campaignResult.rows.length === 0) return;
      const campaign = campaignResult.rows[0];

      const isDM = campaign.dungeon_master_id === Number(userId);
      if (!isDM) {
        const charResult = await pool.query(
          'SELECT id FROM characters WHERE player_id = $1 AND campaign_id = $2 LIMIT 1',
          [userId, campaignId]
        );
        if (charResult.rows.length === 0) return; // not a member
      }

      const messageType = isDM ? 'dm' : 'player';
      const trimmed = content.trim().slice(0, 2000); // max length guard

      const result = await pool.query(
        `INSERT INTO campaign_chat_messages (campaign_id, sender_id, sender_name, message_type, content)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [campaignId, userId, user.username, messageType, trimmed]
      );

      io.to(`campaign_${campaignId}`).emit('chatMessageReceived', result.rows[0]);
    } catch (error) {
      console.error('[chatMessage] Error:', error);
    }
  });

  // DM requests a player to make a roll outside combat
  socket.on('requestOutOfCombatRoll', async ({
    campaignId, targetPlayerId, targetCharacterName,
    diceType, rollPurpose, purposeDetail, modifier, precomputedModifier, diceGroups
  }) => {
    try {
      const userId = socket.userId;
      if (!userId) return;

      // Validate DM ownership
      const campaignResult = await pool.query('SELECT dungeon_master_id FROM campaigns WHERE id = $1', [campaignId]);
      if (campaignResult.rows.length === 0) return;
      if (campaignResult.rows[0].dungeon_master_id !== Number(userId)) return;

      const dmUser = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
      const dmName = dmUser.rows[0]?.username ?? 'DM';

      const requestId = Date.now();

      // Emit roll request directly to the target player's socket
      const targetSocketId = userSocketMap.get(Number(targetPlayerId));
      if (targetSocketId) {
        io.to(targetSocketId).emit('outOfCombatRollRequested', {
          requestId,
          campaignId,
          targetPlayerId,
          targetCharacterName,
          diceType: diceType || 'd20',
          rollPurpose: rollPurpose || 'ability_check',
          purposeDetail: purposeDetail || rollPurpose || 'ability_check',
          modifier: modifier || 'none',
          precomputedModifier: precomputedModifier ?? null,
          requesterName: dmName,
          diceGroups: diceGroups ?? null,
        });
      }

      // Broadcast server message to whole room
      const label = purposeDetail || rollPurpose || 'roll';
      const serverContent = `${dmName} is requesting ${targetCharacterName} make a ${label} (${diceType || 'd20'})`;
      const result = await pool.query(
        `INSERT INTO campaign_chat_messages (campaign_id, sender_id, sender_name, message_type, content)
         VALUES ($1, $2, $3, 'server', $4) RETURNING *`,
        [campaignId, userId, dmName, serverContent]
      );

      io.to(`campaign_${campaignId}`).emit('chatMessageReceived', result.rows[0]);
    } catch (error) {
      console.error('[requestOutOfCombatRoll] Error:', error);
    }
  });

  // Player submits a completed out-of-combat roll
  socket.on('submitOutOfCombatRoll', async ({
    campaignId, requestId, rawRoll, total, modifierValue, modifier,
    rollerName, diceType, purposeDetail, allRolls
  }) => {
    try {
      if (!campaignId || !rollerName) return;

      const safeRaw = Number(rawRoll) || 0;
      const safeMod = Number(modifierValue) || 0;
      const safeTotal = Number(total) || safeRaw + safeMod;

      const rollData = {
        diceType: diceType || 'd20',
        rolls: allRolls ? allRolls.flatMap(g => g.rolls) : [safeRaw],
        modifier: safeMod,
        total: safeTotal,
        purpose: purposeDetail || 'roll',
        diceGroups: allRolls && allRolls.length > 0 ? allRolls : null,
      };

      const modLabel = safeMod !== 0 ? ` ${safeMod >= 0 ? '+' : ''}${safeMod} (${modifier || '?'})` : '';
      const content = `${rollerName} rolled ${purposeDetail || 'roll'}: ${safeRaw}${modLabel} = ${safeTotal}`;

      const result = await pool.query(
        `INSERT INTO campaign_chat_messages (campaign_id, sender_name, message_type, content, roll_data)
         VALUES ($1, $2, 'roll_result', $3, $4) RETURNING *`,
        [campaignId, rollerName, content, JSON.stringify(rollData)]
      );

      io.to(`campaign_${campaignId}`).emit('chatMessageReceived', result.rows[0]);
    } catch (error) {
      console.error('[submitOutOfCombatRoll] Error:', error);
    }
  });
};
