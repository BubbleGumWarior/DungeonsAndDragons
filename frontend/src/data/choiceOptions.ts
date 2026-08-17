// Dropdown option lists for level-up "choice" class features (class_features.choice_type).
// The level-up wizard must never let the player free-type a choice — every choice_type
// either has a curated list here, or falls back to parseOptionsFromDescription() below,
// which extracts an enumerated list from the feature's own description text.

export const CHOICE_TYPE_OPTIONS: Record<string, string[]> = {
  // Warlock
  pact_boon: ['Pact of the Chain', 'Pact of the Blade', 'Pact of the Tome'],
  invocation: [
    'Agonizing Blast', 'Armor of Shadows', "Devil's Sight", 'Mask of Many Faces',
    'Misty Visions', 'Repelling Blast', 'Thirsting Blade', 'Eldritch Sight',
    'Book of Ancient Secrets', 'Voice of the Chain Master', 'Lifedrinker'
  ],

  // Fighter
  fighting_style: ['Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Protection', 'Two-Weapon Fighting'],
  maneuvers: [
    "Commander's Strike", 'Disarming Attack', 'Distracting Strike', 'Evasive Footwork',
    'Feinting Attack', 'Goading Attack', 'Lunging Attack', 'Maneuvering Attack',
    'Menacing Attack', 'Parry', 'Precision Attack', 'Pushing Attack', 'Rally',
    'Riposte', 'Sweeping Attack', 'Trip Attack'
  ],

  // Rogue
  expertise: [
    'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History',
    'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
    'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'
  ],

  // Barbarian (Path of the Totem Warrior)
  totem_spirit: ['Bear', 'Eagle', 'Wolf'],
  aspect_beast: ['Bear', 'Eagle', 'Wolf'],
  totemic_attunement: ['Bear', 'Eagle', 'Wolf'],

  // Ranger (Hunter)
  hunters_prey: ['Colossus Slayer', 'Giant Killer', 'Horde Breaker'],

  // Monk (Way of the Four Elements)
  elemental_discipline: [
    'Fangs of the Fire Snake', 'Fist of Four Thunders', 'Fist of Unbroken Air',
    'Gong of the Summit', 'Mist Stance', 'Ride the Wind', 'River of Hungry Flame',
    'Rush of the Gale Spirits', 'Shape the Flowing River', 'Sweeping Cinder Strike',
    'Water Whip', 'Wave of Rolling Earth'
  ]
};

/**
 * Fallback for any choice_type not in CHOICE_TYPE_OPTIONS: pulls an enumerated option
 * list straight out of the feature's description, e.g. "Choose one: Bear (...), Eagle
 * (...), or Wolf (...)" → ['Bear', 'Eagle', 'Wolf']. Keeps the wizard dropdown-only even
 * for choice types nobody has curated yet.
 */
export function parseOptionsFromDescription(description: string): string[] {
  const colonIdx = description.indexOf(':');
  if (colonIdx === -1) return [];

  const after = description.slice(colonIdx + 1);
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of after) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else if (ch === '.' && depth === 0 && current.trim().length > 0 && parts.length === 0) {
      // Stop at the end of the first sentence if there was no comma-separated list at all
      break;
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts
    .map(p => p.replace(/^\s*(or|and)\s+/i, '').trim())
    .map(p => {
      const paren = p.indexOf('(');
      const label = paren > 0 ? p.slice(0, paren).trim() : p;
      return label.replace(/\.$/, '').trim();
    })
    .filter(Boolean);
}

/** Resolves the dropdown options for a choice feature: curated list first, parsed fallback second. */
export function getChoiceOptions(choiceType: string, description: string): string[] {
  const curated = CHOICE_TYPE_OPTIONS[choiceType];
  if (curated && curated.length > 0) return curated;
  return parseOptionsFromDescription(description || '');
}
