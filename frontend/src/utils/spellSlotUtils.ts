// Spell slot progression tables for spellcasting classes

// Full caster spell slots by level (index 0 = level 1, index 19 = level 20)
// Columns: [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th]
const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // level 1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // level 2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // level 3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // level 4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // level 5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // level 6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // level 7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // level 8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // level 9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // level 10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // level 11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // level 12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // level 13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // level 14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // level 15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // level 16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // level 17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // level 18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // level 19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // level 20
];

// Half caster spell slots by level (Paladin, Ranger)
const HALF_CASTER_SLOTS: number[][] = [
  [0, 0, 0, 0, 0], // level 1 — no spells yet
  [2, 0, 0, 0, 0], // level 2
  [3, 0, 0, 0, 0], // level 3
  [3, 0, 0, 0, 0], // level 4
  [4, 2, 0, 0, 0], // level 5
  [4, 2, 0, 0, 0], // level 6
  [4, 3, 0, 0, 0], // level 7
  [4, 3, 0, 0, 0], // level 8
  [4, 3, 2, 0, 0], // level 9
  [4, 3, 2, 0, 0], // level 10
  [4, 3, 3, 0, 0], // level 11
  [4, 3, 3, 0, 0], // level 12
  [4, 3, 3, 1, 0], // level 13
  [4, 3, 3, 1, 0], // level 14
  [4, 3, 3, 2, 0], // level 15
  [4, 3, 3, 2, 0], // level 16
  [4, 3, 3, 3, 1], // level 17
  [4, 3, 3, 3, 1], // level 18
  [4, 3, 3, 3, 2], // level 19
  [4, 3, 3, 3, 2], // level 20
];

// Warlock pact magic: [slots, slotLevel]
const WARLOCK_PACT: [number, number][] = [
  [1, 1], // level 1
  [2, 1], // level 2
  [2, 2], // level 3
  [2, 2], // level 4
  [3, 3], // level 5
  [3, 3], // level 6
  [4, 4], // level 7
  [4, 4], // level 8
  [5, 5], // level 9
  [5, 5], // level 10
  [3, 5], // level 11
  [3, 5], // level 12
  [3, 5], // level 13
  [3, 5], // level 14
  [3, 5], // level 15
  [3, 5], // level 16
  [4, 5], // level 17
  [4, 5], // level 18
  [4, 5], // level 19
  [4, 5], // level 20
];

export type SpellSlotInfo =
  | { type: 'full' | 'half'; slots: number[] }   // slots[i] = count for spell level i+1
  | { type: 'pact'; slots: number; slotLevel: number }
  | null;

const FULL_CASTERS = new Set(['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard']);
const HALF_CASTERS = new Set(['Paladin', 'Ranger']);

export function isSpellcaster(className: string): boolean {
  return FULL_CASTERS.has(className) || HALF_CASTERS.has(className) || className === 'Warlock';
}

export function getSpellSlots(className: string, level: number): SpellSlotInfo {
  const idx = Math.max(0, Math.min(19, level - 1));

  if (FULL_CASTERS.has(className)) {
    return { type: 'full', slots: FULL_CASTER_SLOTS[idx] };
  }
  if (HALF_CASTERS.has(className)) {
    return { type: 'half', slots: HALF_CASTER_SLOTS[idx] };
  }
  if (className === 'Warlock') {
    const [slots, slotLevel] = WARLOCK_PACT[idx];
    return { type: 'pact', slots, slotLevel };
  }
  return null;
}

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX'];

/** Returns the Roman numeral for a spell slot level (1–9) */
export function toRoman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** Returns a human-readable ordinal suffix for a spell slot level */
export function ordinalSuffix(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** Returns what changed in spell slots between two levels as a descriptive string array */
export function getSpellSlotChanges(className: string, oldLevel: number, newLevel: number): string[] {
  const prev = getSpellSlots(className, oldLevel);
  const next = getSpellSlots(className, newLevel);
  if (!next) return [];

  const changes: string[] = [];

  if (next.type === 'pact') {
    if (!prev || prev.type !== 'pact') {
      changes.push(`Gained Pact Magic: ${next.slots} slot(s) (${ordinalSuffix(next.slotLevel)} level)`);
    } else {
      if (next.slots !== prev.slots) {
        changes.push(`Pact Magic slots: ${prev.slots} → ${next.slots}`);
      }
      if (next.slotLevel !== prev.slotLevel) {
        changes.push(`Pact slot level: ${ordinalSuffix(prev.slotLevel)} → ${ordinalSuffix(next.slotLevel)}`);
      }
    }
    return changes;
  }

  // full / half
  const prevSlots = (prev && prev.type !== 'pact') ? prev.slots : new Array(next.slots.length).fill(0);
  next.slots.forEach((count, i) => {
    const old = prevSlots[i] ?? 0;
    if (count > old) {
      changes.push(`${ordinalSuffix(i + 1)}-level slots: ${old} → ${count}`);
    }
  });
  return changes;
}
