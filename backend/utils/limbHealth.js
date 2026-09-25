// Per-limb HP maxes for a given base HP + CON score.
// Shared by characters, pets, and mounts — mirrors calcCharacterLimbHealthMax on the frontend.
function calcLimbHealthMax(hp, con) {
  const conMod = Math.floor((con - 10) / 2);
  const conBonus = Math.max(0, conMod * 0.1);
  const baseHp = hp || 1;
  // Each limb HP = floor(baseHP × ratio) — NOT normalized, so limbs can exceed baseHP in sum
  return {
    head:      Math.floor(baseHp * Math.min(1.0, 0.25 + conBonus)),
    chest:     Math.floor(baseHp * Math.min(2.0, 1.0 + conBonus)),
    left_arm:  Math.floor(baseHp * Math.min(1.0, 0.15 + conBonus)),
    right_arm: Math.floor(baseHp * Math.min(1.0, 0.15 + conBonus)),
    left_leg:  Math.floor(baseHp * Math.min(1.0, 0.40 + conBonus)),
    right_leg: Math.floor(baseHp * Math.min(1.0, 0.40 + conBonus)),
  };
}

module.exports = { calcLimbHealthMax };
