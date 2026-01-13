/**
 * Combat event handlers  
 * Handles turn-based combat, initiative, and combat invites
 * VERSION: 2026-01-08-DEBUG
 */

console.log('🔥🔥🔥 COMBAT HANDLERS MODULE LOADED - DEBUG VERSION 2026-01-08 🔥🔥🔥');

const Character = require('../../models/Character');
const Monster = require('../../models/Monster');
const MonsterInstance = require('../../models/MonsterInstance');
const { pool } = require('../../models/database');

module.exports = (socket, io, battleCombatState, battleMovementState, userSocketMap) => {
  // Invite a player/character to join combat (DM action)
  socket.on('inviteToCombat', async (data) => {
    try {
      const { campaignId, characterId, targetPlayerId, isMonster } = data;
      
      // If it's a monster, add directly to combat (DM-controlled)
      if (isMonster) {
        // Ensure combat state exists for this campaign
        if (!battleCombatState[campaignId]) {
          battleCombatState[campaignId] = { combatants: [], initiativeOrder: [], currentTurnIndex: -1 };
        }

        // Fetch monster details
        const monster = await Monster.findById(characterId);
        if (!monster) {
          console.warn(`Monster ${characterId} not found for combat`);
          return;
        }

        // Get next instance number for this monster type in this campaign
        const instanceNumber = await MonsterInstance.getNextInstanceNumber(monster.id, campaignId);

        // Roll initiative for monster (d20 + 0 for now; can be enhanced later)
        const roll = Math.floor(Math.random() * 20) + 1;
        const initiative = roll;

        // Create a new monster instance with its own health pool
        const monsterInstance = await MonsterInstance.create({
          monster_id: monster.id,
          campaign_id: campaignId,
          instance_number: instanceNumber,
          current_limb_health: monster.limb_health,
          initiative: initiative
        });

        // Add to combatants list using the instance ID
        battleCombatState[campaignId].combatants.push({
          characterId: monsterInstance.id,
          monsterId: monster.id,
          playerId: targetPlayerId,
          name: `${monster.name} #${instanceNumber}`,
          initiative,
          movement_speed: 30,
          isMonster: true,
          instanceNumber: instanceNumber
        });

        // Re-sort initiative order
        battleCombatState[campaignId].initiativeOrder = battleCombatState[campaignId].combatants
          .sort((a, b) => b.initiative - a.initiative)
          .map(c => c.characterId);

        // Broadcast updated combatants
        io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
          combatants: battleCombatState[campaignId].combatants,
          initiativeOrder: battleCombatState[campaignId].initiativeOrder,
          currentTurnIndex: battleCombatState[campaignId].currentTurnIndex
        });

        console.log(`🐉 Monster ${monster.name} #${instanceNumber} (instance ID: ${monsterInstance.id}) added to combat in campaign ${campaignId} (initiative: ${initiative})`);
      } else {
        // Regular player character invite
        io.to(`campaign_${campaignId}`).emit('combatInvite', {
          campaignId,
          characterId,
          targetPlayerId,
          timestamp: new Date().toISOString()
        });
        console.log(`📣 Combat invite sent for character ${characterId} in campaign ${campaignId} to player ${targetPlayerId}`);
      }
    } catch (error) {
      console.error('Error sending combat invite:', error);
    }
  });

  // Player accepts an invite to combat
  socket.on('acceptCombatInvite', async (data) => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 DEBUG: acceptCombatInvite handler STARTED');
    console.log('🚀 DEBUG: Data received:', JSON.stringify(data));
    console.log('═══════════════════════════════════════════════════════');
    try {
      const { campaignId, characterId, playerId } = data;

      // Ensure combat state exists for this campaign
      if (!battleCombatState[campaignId]) {
        battleCombatState[campaignId] = { combatants: [], initiativeOrder: [], currentTurnIndex: -1 };
      }

      // Fetch character to get abilities and movement_speed
      const character = await Character.findById(characterId);
      if (!character) {
        console.warn(`Character ${characterId} not found for combat`);
        return;
      }

      console.log(`🔍 DEBUG: Character found - Name: "${character.name}", Class: "${character.class}", Level: ${character.level}`);

      // Roll initiative: d20 + dex modifier
      const roll = Math.floor(Math.random() * 20) + 1;
      const dex = character.abilities?.dex ?? 10;
      const dexMod = Character.getAbilityModifier(dex);
      const initiative = roll + dexMod;

      // Add to combatants list
      battleCombatState[campaignId].combatants.push({
        characterId: character.id,
        playerId: playerId,
        name: character.name,
        initiative,
        movement_speed: character.movement_speed ?? 30
      });

      // Mark character as in combat in DB
      try {
        await pool.query('UPDATE characters SET combat_active = TRUE WHERE id = $1', [characterId]);
      } catch (dbErr) {
        console.error('Error setting combat_active in DB:', dbErr);
      }

      // Initialize movement state for this character
      if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
      battleMovementState[campaignId][characterId] = character.movement_speed ?? 30;

      // Check if character is Primal Bond and should have their beast companion added
      console.log(`🔍 DEBUG: Character class check - Class: "${character.class}", Is Primal Bond: ${character.class === 'Primal Bond'}`);
      
      if (character.class === 'Primal Bond') {
        console.log(`🐾 DEBUG: ${character.name} is Primal Bond class, checking for beast companion...`);
        try {
          // Fetch beast companion
          const beastResult = await pool.query(
            'SELECT * FROM character_beasts WHERE character_id = $1',
            [characterId]
          );

          console.log(`🔍 DEBUG: Beast query result - Rows found: ${beastResult.rows.length}`);

          if (beastResult.rows.length > 0) {
            const beast = beastResult.rows[0];
            const beastType = beast.beast_type;
            const characterLevel = character.level;
            
            console.log(`🐾 DEBUG: Beast found - Type: "${beastType}", Character Level: ${characterLevel}`);
            console.log(`🔍 DEBUG: Full beast data:`, JSON.stringify(beast, null, 2));
            
            // Check if beast should be added based on level requirements
            let shouldAddBeast = false;
            let matchReason = '';
            
            // Agile Hunter (Cheetah/Leopard) gets beast at level 3
            if ((beastType === 'Cheetah' || beastType === 'Leopard') && characterLevel >= 3) {
              shouldAddBeast = true;
              matchReason = `Agile Hunter (${beastType}) at level ${characterLevel} >= 3`;
            }
            // Packbound (Alpha Wolf/Omega Wolf) gets beast at level 6
            else if ((beastType === 'AlphaWolf' || beastType === 'OmegaWolf') && characterLevel >= 6) {
              shouldAddBeast = true;
              matchReason = `Packbound (${beastType}) at level ${characterLevel} >= 6`;
            }
            // Colossal Bond (Elephant/Owlbear) gets beast at level 10
            else if ((beastType === 'Elephant' || beastType === 'Owlbear') && characterLevel >= 10) {
              shouldAddBeast = true;
              matchReason = `Colossal Bond (${beastType}) at level ${characterLevel} >= 10`;
            } else {
              matchReason = `No match - Beast type "${beastType}" at level ${characterLevel}`;
            }

            console.log(`🔍 DEBUG: Should add beast: ${shouldAddBeast} - Reason: ${matchReason}`);

            if (shouldAddBeast) {
              // Beast uses same initiative as character (they act together)
              const beastName = beast.beast_name || beastType;
              const beastSpeed = beast.speed || 30;

              console.log(`✅ DEBUG: Adding beast to combat - Name: "${beastName}", Speed: ${beastSpeed}, Initiative: ${initiative}`);

              // Add beast to combatants with same initiative
              battleCombatState[campaignId].combatants.push({
                characterId: `beast_${characterId}`, // Unique ID for the beast
                playerId: playerId, // Same player controls the beast
                name: `${beastName} (Companion)`,
                initiative: initiative, // Same initiative as the character
                movement_speed: beastSpeed,
                isBeast: true,
                ownerId: characterId // Track which character owns this beast
              });

              // Initialize movement state for the beast
              battleMovementState[campaignId][`beast_${characterId}`] = beastSpeed;

              console.log(`🐾 Beast companion ${beastName} added to combat with ${character.name} (same initiative: ${initiative})`);
              console.log(`🔍 DEBUG: Current combatants count: ${battleCombatState[campaignId].combatants.length}`);
            } else {
              console.log(`❌ DEBUG: Beast NOT added - Level or type requirements not met`);
            }
          } else {
            console.log(`❌ DEBUG: No beast found in database for character ${characterId}`);
          }
        } catch (beastErr) {
          console.error('❌ ERROR: Error adding beast companion to combat:', beastErr);
          console.error('Stack trace:', beastErr.stack);
          // Continue without beast if there's an error - don't block character from joining
        }
      } else {
        console.log(`ℹ️ DEBUG: Character ${character.name} is not Primal Bond class, skipping beast check`);
      }

      // Sort initiative order (highest first)
      const sorted = [...battleCombatState[campaignId].combatants].sort((a, b) => b.initiative - a.initiative);
      battleCombatState[campaignId].initiativeOrder = sorted.map(c => c.characterId);

      // Broadcast updated combatants to all in campaign
      io.to(`campaign_${campaignId}`).emit('combatantsUpdated', {
        combatants: sorted,
        initiativeOrder: battleCombatState[campaignId].initiativeOrder,
        currentTurnIndex: battleCombatState[campaignId].currentTurnIndex,
        timestamp: new Date().toISOString()
      });

      console.log(`🛡️ ${character.name} added to combat in campaign ${campaignId} with initiative ${initiative}`);
    } catch (error) {
      console.error('Error accepting combat invite:', error);
    }
  });

  // Advance to next turn in initiative order (DM action)
  socket.on('nextTurn', (data) => {
    try {
      const { campaignId } = data;
      const state = battleCombatState[campaignId];
      if (!state || !state.initiativeOrder || state.initiativeOrder.length === 0) {
        console.warn('No combat state for campaign', campaignId);
        return;
      }

      // If combat hasn't started yet, start it
      if (state.currentTurnIndex === -1) {
        state.currentTurnIndex = 0;
        console.log(`⚔️ Starting combat in campaign ${campaignId}`);
      } else {
        // Advance to next turn
        state.currentTurnIndex = (state.currentTurnIndex + 1) % state.initiativeOrder.length;
      }
      
      const currentCharacterId = state.initiativeOrder[state.currentTurnIndex];

      // Reset current character's movement
      const combatant = state.combatants.find(c => c.characterId === currentCharacterId);
      if (combatant) {
        if (!battleMovementState[campaignId]) battleMovementState[campaignId] = {};
        battleMovementState[campaignId][currentCharacterId] = combatant.movement_speed;
      }

      // Broadcast turn advance
      io.to(`campaign_${campaignId}`).emit('turnAdvanced', {
        currentCharacterId,
        initiativeOrder: state.initiativeOrder,
        currentTurnIndex: state.currentTurnIndex,
        resetMovementFor: currentCharacterId,
        movementSpeed: combatant ? combatant.movement_speed : 30,
        timestamp: new Date().toISOString()
      });

      console.log(`➡️ Advanced turn in campaign ${campaignId} to character ${currentCharacterId} (index: ${state.currentTurnIndex})`);
    } catch (error) {
      console.error('Error advancing turn:', error);
    }
  });

  // Reset combat for the campaign (DM action)
  socket.on('resetCombat', async (data) => {
    try {
      const { campaignId } = data;
      
      // Clear combat state
      if (battleCombatState[campaignId]) {
        const combatants = battleCombatState[campaignId].combatants;
        
        // Mark all characters as not in combat in DB (skip monsters and beasts)
        for (const combatant of combatants) {
          if (!combatant.isMonster && !combatant.isBeast) {
            try {
              await pool.query('UPDATE characters SET combat_active = FALSE WHERE id = $1', [combatant.characterId]);
            } catch (dbErr) {
              console.error(`Error clearing combat_active for character ${combatant.characterId}:`, dbErr);
            }
          }
        }
        
        delete battleCombatState[campaignId];
      }
      
      // Clear movement state
      if (battleMovementState[campaignId]) {
        delete battleMovementState[campaignId];
      }

      // Broadcast combat reset
      io.to(`campaign_${campaignId}`).emit('combatReset', {
        timestamp: new Date().toISOString()
      });

      console.log(`🔄 Combat reset for campaign ${campaignId}`);
    } catch (error) {
      console.error('Error resetting combat:', error);
    }
  });
};
