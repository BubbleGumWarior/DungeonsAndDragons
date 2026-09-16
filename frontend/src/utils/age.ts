// A character's age is normally never stored — it's derived from race + how many in-game
// years have passed since day 1, so it advances automatically on every long rest / day skip.
// `ageOverride` (set only for a character created by assigning a family-tree member to a
// player) is that same "age as of day 1" convention as getFamilyMemberAge below, used instead
// of the race-based guess so a young child doesn't jump to a generic adult age the moment
// they become a played character.
export const getCharacterAge = (race: string, day: number, ageOverride?: number | null): number => {
  if (ageOverride !== undefined && ageOverride !== null) {
    return ageOverride + Math.floor((day - 1) / 365);
  }
  const base = race?.toLowerCase().includes('thri-kreen') ? 3 : 13;
  return base + Math.floor((day - 1) / 365);
};

// Same idea for a family-tree member who isn't (yet) played by anyone: baseAge is their
// age "as of day 1" (can be negative for someone not yet born), so it ages the same way.
export const getFamilyMemberAge = (baseAge: number, day: number): number => {
  return baseAge + Math.floor((day - 1) / 365);
};
