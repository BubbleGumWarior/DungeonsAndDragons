// Per-limb AC for player characters. The character's base AC is split across limbs by fixed
// multipliers, then the AC bonus from whatever is equipped on that limb is added on top.
// Used by the character sheet, the combat detail card and the attack/heal modals so all of
// them show the same numbers.

/** Item AC bonuses per slot, as returned by GET /characters/:id/equipped (`limb_ac`). */
export interface EquippedLimbAC {
  head?: number;
  chest?: number;
  main_hand?: number;
  off_hand?: number;
  feet?: number;
}

export interface CharacterLimbAC {
  head: number;
  chest: number;
  main_hand: number;
  off_hand: number;
  feet: number;
}

export const calcCharacterLimbAC = (baseAC: number | undefined | null, equipped?: EquippedLimbAC | null): CharacterLimbAC => {
  const base = baseAC || 10;
  return {
    head:      Math.round(base * 1.50) + (equipped?.head ?? 0),
    chest:     Math.round(base * 1.00) + (equipped?.chest ?? 0),
    main_hand: Math.round(base * 0.25) + (equipped?.main_hand ?? 0),
    off_hand:  Math.round(base * 0.25) + (equipped?.off_hand ?? 0),
    feet:      Math.round(base * 0.50) + (equipped?.feet ?? 0),
  };
};

/**
 * Same numbers keyed by the combat limb names (left_arm/right_arm/...) used by the attack modal.
 * On the sheet the left arm is paired with the main hand and the right arm with the off hand.
 */
export const calcCharacterCombatLimbAC = (baseAC: number | undefined | null, equipped?: EquippedLimbAC | null) => {
  const ac = calcCharacterLimbAC(baseAC, equipped);
  return {
    head: ac.head,
    chest: ac.chest,
    left_arm: ac.main_hand,
    right_arm: ac.off_hand,
    left_leg: ac.feet,
    right_leg: ac.feet,
  };
};
