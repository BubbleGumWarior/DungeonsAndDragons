// D&D 5e Experience Points Required to REACH Each Level (cumulative totals)
// Level 0 is starting point, Level 1 requires 300 total EXP, Level 2 requires 900 total EXP, etc.
export const EXP_TABLE: Record<number, number> = {
  0: 0,      // Starting level
  1: 300,    // 300 EXP to reach level 1
  2: 900,    // 900 EXP to reach level 2
  3: 2700,
  4: 6500,
  5: 14000,
  6: 23000,
  7: 34000,
  8: 48000,
  9: 64000,
  10: 85000,
  11: 100000,
  12: 120000,
  13: 140000,
  14: 165000,
  15: 195000,
  16: 225000,
  17: 265000,
  18: 305000,
  19: 355000,
  20: 999999999 // Max level
};

// Get required EXP for next level (cumulative total needed)
export const getRequiredExpForNextLevel = (currentLevel: number): number => {
  if (currentLevel >= 20) return 999999999;
  return EXP_TABLE[currentLevel + 1] || 0;
};

// Check if character can level up (based on cumulative EXP)
export const canLevelUp = (currentLevel: number, currentExp: number): boolean => {
  if (currentLevel >= 20) return false;
  const requiredExp = getRequiredExpForNextLevel(currentLevel);
  return currentExp >= requiredExp;
};

// Get progress to next level as percentage
// For characters at level X with Y EXP, calculate progress from 0 to the next level requirement
export const getLevelProgress = (currentLevel: number, currentExp: number): number => {
  if (currentLevel >= 20) return 100;
  
  // For level progression, we measure from 0 EXP to the next level's requirement
  // Example: Level 1 with 450 EXP → progress is 450/900 = 50% to level 2
  const nextLevelExp = getRequiredExpForNextLevel(currentLevel);
  const progress = (currentExp / nextLevelExp) * 100;
  return Math.min(100, Math.max(0, progress));
};
