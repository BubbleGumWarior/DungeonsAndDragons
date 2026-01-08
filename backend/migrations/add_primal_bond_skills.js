const { pool } = require('../models/database');

async function addPrimalBondSkills() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const primalBondSkills = [
      // Core Skills
      { name: 'Bonded Instinct', description: 'You and your bonded beast share initiative and can communicate intent, emotions, and danger instinctively. When either you or your beast hits a creature, the other gains a minor reactive benefit.', damage_dice: null, damage_type: null, range_size: 'Beast', usage_frequency: 'Passive', level_requirement: 1, class_restriction: 'Primal Bond' },
      { name: 'Shared Initiative', description: 'You and your beast always act on the same initiative count. You choose the order each round.', damage_dice: null, damage_type: null, range_size: 'Beast', usage_frequency: 'Passive', level_requirement: 1, class_restriction: 'Primal Bond' },
      { name: 'Predatory Focus', description: 'Once per turn, when you or your beast hits a creature: Add +1d4 damage. Damage type matches the attack.', damage_dice: '+1d4', damage_type: 'Weapon', range_size: 'Attack', usage_frequency: 'Once per turn', level_requirement: 2, class_restriction: 'Primal Bond' },
      { name: 'Coordinated Strike', description: 'When you hit a creature, your beast may move up to half its speed as a reaction without provoking opportunity attacks.', damage_dice: null, damage_type: null, range_size: 'Half speed', usage_frequency: 'Per hit', level_requirement: 2, class_restriction: 'Primal Bond' },
      
      // Cheetah Aspect
      { name: 'Sprinting Volley (Cheetah)', description: 'When you move at least 20 ft before making a ranged weapon attack: Gain +1d6 damage and ignore disadvantage from long range.', damage_dice: '+1d6', damage_type: 'Weapon', range_size: 'Ranged', usage_frequency: 'Per attack', level_requirement: 3, class_restriction: 'Primal Bond' },
      { name: 'Marked Quarry (Cheetah)', description: 'When you hit a creature with a ranged weapon: Mark it until end of your next turn. Your beast has advantage on attacks against it. Once per round, marked target takes +1d6 damage.', damage_dice: '+1d6', damage_type: 'Weapon', range_size: 'Ranged', usage_frequency: 'Per hit', level_requirement: 6, class_restriction: 'Primal Bond' },
      { name: 'Blurred Stride (Cheetah)', description: 'After making a ranged attack: You may move half your speed. You are unaffected by difficult terrain during this movement.', damage_dice: null, damage_type: null, range_size: 'Half speed', usage_frequency: 'Per attack', level_requirement: 10, class_restriction: 'Primal Bond' },
      { name: 'Arrowstorm Chase (Cheetah)', description: 'Once per short rest: For one turn, you may make one additional ranged attack, command your beast to attack twice, and all attacks gain +10 ft movement before or after.', damage_dice: 'Extra attack', damage_type: 'Weapon', range_size: 'Ranged', usage_frequency: '1/short rest', level_requirement: 14, class_restriction: 'Primal Bond' },
      
      // Leopard Aspect
      { name: 'Silent Pounce (Leopard)', description: 'If you or your beast move at least 10 ft toward a creature before attacking: Gain advantage on the attack and deal +1d6 damage.', damage_dice: '+1d6', damage_type: 'Weapon', range_size: 'Melee', usage_frequency: 'Per attack', level_requirement: 3, class_restriction: 'Primal Bond' },
      { name: 'Rending Claws (Leopard)', description: 'Once per turn on a hit: Target begins bleeding and takes 1d4 damage at the start of its turns. Ends with a successful Constitution save.', damage_dice: '1d4', damage_type: 'Slashing', range_size: 'Hit', usage_frequency: 'Once per turn', level_requirement: 6, class_restriction: 'Primal Bond' },
      { name: 'Shadow Slip (Leopard)', description: 'When you hit a creature while unseen: You may immediately Hide as a reaction. You remain lightly obscured until the start of your next turn.', damage_dice: null, damage_type: null, range_size: 'Self', usage_frequency: 'Reaction', level_requirement: 10, class_restriction: 'Primal Bond' },
      { name: 'Apex Ambush (Leopard)', description: 'Once per long rest: You and your beast become invisible for 1 round. Your first hits deal maximum weapon damage.', damage_dice: 'Max damage', damage_type: 'Weapon', range_size: 'Self', usage_frequency: '1/long rest', level_requirement: 14, class_restriction: 'Primal Bond' },
      
      // Alpha Wolf Aspect
      { name: 'Inspiring Presence (Alpha Wolf)', description: 'Your aura also grants +1 to saving throws. Allies may move 5 ft when they hit a creature.', damage_dice: null, damage_type: null, range_size: '10ft aura', usage_frequency: 'Passive', level_requirement: 3, class_restriction: 'Primal Bond' },
      { name: 'Lead the Charge (Alpha Wolf)', description: 'When you or your beast hit a creature: One ally in aura may make a weapon attack as a reaction or move half their speed.', damage_dice: 'Ally attack', damage_type: 'Weapon', range_size: 'Aura', usage_frequency: 'Per hit', level_requirement: 6, class_restriction: 'Primal Bond' },
      { name: 'Rally the Pack (Alpha Wolf)', description: 'Once per short rest: Regain 1d10 + Wisdom mod HP. All allies in aura regain the same amount.', damage_dice: '1d10+WIS', damage_type: 'Healing', range_size: 'Aura', usage_frequency: '1/short rest', level_requirement: 10, class_restriction: 'Primal Bond' },
      { name: 'Alpha Command (Alpha Wolf)', description: 'Once per long rest: Allies in aura may take one additional action. Can only be used to Attack or Dash.', damage_dice: null, damage_type: null, range_size: 'Aura', usage_frequency: '1/long rest', level_requirement: 14, class_restriction: 'Primal Bond' },
      
      // Omega Wolf Aspect
      { name: 'Survivor\'s Instinct (Omega Wolf)', description: 'When you are not adjacent to an ally: Gain +2 damage and +1 AC.', damage_dice: '+2', damage_type: 'Weapon', range_size: 'Self', usage_frequency: 'Passive', level_requirement: 3, class_restriction: 'Primal Bond' },
      { name: 'Blood Momentum (Omega Wolf)', description: 'Each time you reduce a creature to 0 HP: Gain temporary HP equal to your proficiency bonus. Bonus stacks.', damage_dice: 'Temp HP', damage_type: null, range_size: 'Self', usage_frequency: 'Per kill', level_requirement: 6, class_restriction: 'Primal Bond' },
      { name: 'Relentless Hunter (Omega Wolf)', description: 'If you start your turn below half HP: Gain advantage on attacks and resistance to weapon damage.', damage_dice: null, damage_type: null, range_size: 'Self', usage_frequency: 'Passive', level_requirement: 10, class_restriction: 'Primal Bond' },
      { name: 'One-Man War (Omega Wolf)', description: 'Once per long rest: For 1 minute: You regain 10 HP at the start of each turn and each hit deals +1d8 damage.', damage_dice: '+1d8', damage_type: 'Weapon', range_size: 'Self', usage_frequency: '1/long rest', level_requirement: 14, class_restriction: 'Primal Bond' },
      
      // Elephant Aspect
      { name: 'Living Bulwark (Elephant)', description: 'Allies behind you gain +2 AC and half cover.', damage_dice: null, damage_type: null, range_size: 'Behind', usage_frequency: 'Passive', level_requirement: 3, class_restriction: 'Primal Bond' },
      { name: 'Crushing Advance (Elephant)', description: 'As an action: Move up to your speed. Creatures in your path take 2d10 bludgeoning damage and are knocked prone.', damage_dice: '2d10', damage_type: 'Bludgeoning', range_size: 'Path', usage_frequency: 'Action', level_requirement: 10, class_restriction: 'Primal Bond' },
      { name: 'Fortress Unmoving (Elephant)', description: 'Once per long rest: For 1 minute: You gain resistance to all damage and allies within 10 ft take half damage.', damage_dice: null, damage_type: 'Resistance', range_size: '10ft', usage_frequency: '1/long rest', level_requirement: 14, class_restriction: 'Primal Bond' },
      
      // Owlbear Aspect
      { name: 'Brutal Frame (Owlbear)', description: 'Gain temporary HP equal to your Constitution modifier at the start of each combat.', damage_dice: 'Temp HP', damage_type: null, range_size: 'Self', usage_frequency: 'Per combat', level_requirement: 3, class_restriction: 'Primal Bond' },
      { name: 'Rampaging Charge (Owlbear)', description: 'When you move at least 15 ft toward a creature: Deal +2d8 damage. Target must save or be knocked prone.', damage_dice: '+2d8', damage_type: 'Weapon', range_size: 'Melee', usage_frequency: 'Per charge', level_requirement: 10, class_restriction: 'Primal Bond' },
      { name: 'Unstoppable Horror (Owlbear)', description: 'Once per long rest: For 1 minute: Each hit grants temporary HP and enemies within 10 ft must save or become frightened.', damage_dice: 'Temp HP', damage_type: null, range_size: '10ft', usage_frequency: '1/long rest', level_requirement: 14, class_restriction: 'Primal Bond' },
      
      // General Class Features
      { name: 'Extra Attack', description: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.', damage_dice: null, damage_type: null, range_size: 'Self', usage_frequency: 'Passive', level_requirement: 5, class_restriction: 'Primal Bond' },
      { name: 'Shared Reflex', description: 'Once per long rest: You or your beast may impose disadvantage on one attack roll.', damage_dice: null, damage_type: null, range_size: 'Special', usage_frequency: 'PB/long rest', level_requirement: 7, class_restriction: 'Primal Bond' },
      { name: 'Instinctive Evasion', description: 'When you or your beast is hit by an attack: You may use your reaction to reduce damage by 1d10 + proficiency bonus.', damage_dice: '-1d10+PB', damage_type: 'Reduction', range_size: 'Self/Beast', usage_frequency: 'Reaction', level_requirement: 9, class_restriction: 'Primal Bond' },
      { name: 'Twin Assault', description: 'Your beast can attack without requiring your bonus action. It acts on your initiative automatically.', damage_dice: null, damage_type: null, range_size: 'Beast', usage_frequency: 'Passive', level_requirement: 11, class_restriction: 'Primal Bond' },
      { name: 'Dominant Presence', description: 'Creatures within 10 ft have disadvantage on opportunity attacks against you and your beast. Increases to 15 ft at level 17.', damage_dice: null, damage_type: null, range_size: '10-15ft', usage_frequency: 'Passive', level_requirement: 13, class_restriction: 'Primal Bond' },
      { name: 'Unbreakable Bond', description: 'Once per long rest: When your beast would be reduced to 0 HP, it drops to 1 HP instead. As an action, you may transfer HP to your beast.', damage_dice: 'Transfer HP', damage_type: 'Healing', range_size: 'Beast', usage_frequency: '1/long rest', level_requirement: 15, class_restriction: 'Primal Bond' },
      { name: 'Apex Instinct', description: 'Once per long rest: Enter Apex State for 1 minute. You and your beast gain +2 to hit, advantage on saves, and +10 ft movement.', damage_dice: '+2 to hit', damage_type: null, range_size: 'Self/Beast', usage_frequency: '1/long rest', level_requirement: 17, class_restriction: 'Primal Bond' },
      { name: 'Perfect Coordination', description: 'You and your beast each gain your own reaction. You can both use reactions independently each round.', damage_dice: null, damage_type: null, range_size: 'Self/Beast', usage_frequency: 'Passive', level_requirement: 18, class_restriction: 'Primal Bond' },
      { name: 'Primal Ascension', description: 'You and your beast both gain +2 to all ability scores (max 22). You both gain immunity to being frightened or charmed. Once per long rest: Take two turns in one round.', damage_dice: '+2 stats', damage_type: null, range_size: 'Self/Beast', usage_frequency: '1/long rest', level_requirement: 20, class_restriction: 'Primal Bond' }
    ];
    
    console.log(`Adding ${primalBondSkills.length} Primal Bond skills...`);
    
    for (const skill of primalBondSkills) {
      await client.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          damage_dice = EXCLUDED.damage_dice,
          damage_type = EXCLUDED.damage_type,
          range_size = EXCLUDED.range_size,
          usage_frequency = EXCLUDED.usage_frequency,
          level_requirement = EXCLUDED.level_requirement,
          class_restriction = EXCLUDED.class_restriction
      `, [skill.name, skill.description, skill.damage_dice, skill.damage_type, skill.range_size, skill.usage_frequency, skill.level_requirement, skill.class_restriction]);
    }
    
    await client.query('COMMIT');
    console.log('✅ Primal Bond skills added successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding skills:', error);
  } finally {
    client.release();
  }
}

module.exports = addPrimalBondSkills;

// Auto-execute only if run directly
if (require.main === module) {
  addPrimalBondSkills();
}
