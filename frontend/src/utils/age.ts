// A character's age is never stored — it's derived from race + how many in-game years
// have passed since day 1, so it advances automatically on every long rest / day skip.
export const getCharacterAge = (race: string, day: number): number => {
  const base = race?.toLowerCase().includes('thri-kreen') ? 3 : 13;
  return base + Math.floor((day - 1) / 365);
};

// Same idea for a family-tree member who isn't (yet) played by anyone: baseAge is their
// age "as of day 1" (can be negative for someone not yet born), so it ages the same way.
export const getFamilyMemberAge = (baseAge: number, day: number): number => {
  return baseAge + Math.floor((day - 1) / 365);
};
