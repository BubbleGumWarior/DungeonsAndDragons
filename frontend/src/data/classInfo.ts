export interface ClassSubclass {
  name: string;
  color: string;
  description: string;
}

export interface ClassInfo {
  description: string;
  features: string[];
  subclasses: ClassSubclass[];
  levelProgression: { level: number; features: string }[];
}

export const classInfo: Record<string, ClassInfo> = {
  'Barbarian': {
    description: 'A fierce warrior of primitive background who can enter a battle rage. Barbarians combine raw strength with primal fury to become devastating combatants.',
    features: ['Rage', 'Unarmored Defense (Barbarian)', 'Reckless Attack', 'Danger Sense'],
    subclasses: [
      { name: 'Path of the Berserker', color: '#FF4444', description: 'Channel rage into devastating attacks' },
      { name: 'Path of the Totem Warrior', color: '#44FF44', description: 'Gain animal spirit powers' },
      { name: 'Path of the Ancestral Guardian', color: '#4444FF', description: 'Call upon ancestral spirits' }
    ],
    levelProgression: [
      { level: 1, features: 'Rage, Unarmored Defense (Barbarian)' },
      { level: 2, features: 'Reckless Attack, Danger Sense' },
      { level: 3, features: 'Primal Path, Frenzy (Berserker) / Totem Spirit (Totem) / Ancestral Protectors (Guardian)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Extra Attack, Fast Movement' },
      { level: 6, features: 'Mindless Rage (Berserker) / Aspect of the Beast (Totem) / Spirit Shield (Guardian)' },
      { level: 7, features: 'Feral Instinct' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Brutal Critical (1 die)' },
      { level: 10, features: 'Intimidating Presence (Berserker) / Spirit Walker (Totem) / Consult the Spirits (Guardian)' },
      { level: 11, features: 'Relentless Rage' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Brutal Critical (2 dice)' },
      { level: 14, features: 'Retaliation (Berserker) / Totemic Attunement (Totem) / Vengeful Ancestors (Guardian)' },
      { level: 15, features: 'Persistent Rage' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Brutal Critical (3 dice)' },
      { level: 18, features: 'Indomitable Might' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Primal Champion' }
    ]
  },
  'Bard': {
    description: 'An inspiring magician whose power echoes the music of creation. Bards use music and magic to inspire allies, control minds, and weave spells.',
    features: ['Spellcasting', 'Bardic Inspiration', 'Jack of All Trades', 'Song of Rest'],
    subclasses: [
      { name: 'College of Lore', color: '#9B59B6', description: 'Master of knowledge and cutting words' },
      { name: 'College of Valor', color: '#E74C3C', description: 'Combine combat prowess with inspiration' },
      { name: 'College of Glamour', color: '#F39C12', description: 'Harness the fey magic of beauty' }
    ],
    levelProgression: [
      { level: 1, features: 'Spellcasting, Bardic Inspiration (d6)' },
      { level: 2, features: 'Jack of All Trades, Song of Rest (d6)' },
      { level: 3, features: 'Bard College, Expertise, Bonus Proficiencies (Lore), Cutting Words (Lore) / Bonus Proficiencies (Valor), Combat Inspiration (Valor) / Mantle of Inspiration (Glamour), Enthralling Performance (Glamour)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Bardic Inspiration (d8), Font of Inspiration' },
      { level: 6, features: 'Countercharm, Additional Magical Secrets (Lore) / Extra Attack (Valor) / Mantle of Majesty (Glamour)' },
      { level: 7, features: '4th Level Spells' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Song of Rest (d8), 5th Level Spells' },
      { level: 10, features: 'Bardic Inspiration (d10), Expertise, Magical Secrets' },
      { level: 11, features: '6th Level Spells' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Song of Rest (d10), 7th Level Spells' },
      { level: 14, features: 'Magical Secrets, Peerless Skill (Lore) / Battle Magic (Valor) / Unbreakable Majesty (Glamour)' },
      { level: 15, features: 'Bardic Inspiration (d12), 8th Level Spells' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Song of Rest (d12), 9th Level Spells' },
      { level: 18, features: 'Magical Secrets' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Superior Inspiration' }
    ]
  },
  'Cleric': {
    description: 'A priestly champion who wields divine magic in service of a higher power. Clerics combine healing and support with formidable combat abilities.',
    features: ['Spellcasting', 'Divine Domain', 'Channel Divinity', 'Destroy Undead'],
    subclasses: [
      { name: 'Life Domain', color: '#2ECC71', description: 'Master healer protecting life' },
      { name: 'War Domain', color: '#C0392B', description: 'Divine warrior blessing combat' },
      { name: 'Order Domain', color: '#2C3E50', description: 'Champion of law and civilization who compels obedience and protects the social order.' }
    ],
    levelProgression: [
      { level: 1, features: "Spellcasting, Divine Domain, Bonus Proficiency (Life), Disciple of Life (Life) / Bonus Proficiencies (War), War Priest (War) / Voice of Authority (Order)" },
      { level: 2, features: "Channel Divinity (1/rest), Preserve Life (Life) / Channel Divinity: Guided Strike (War) / Channel Divinity: Order's Demand (Order)" },
      { level: 3, features: '2nd Level Spells' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Destroy Undead (CR 1/2), 3rd Level Spells' },
      { level: 6, features: "Channel Divinity (2/rest), Blessed Healer (Life) / Channel Divinity: War God's Blessing (War) / Embodiment of the Law (Order)" },
      { level: 7, features: '4th Level Spells' },
      { level: 8, features: 'Ability Score Improvement, Destroy Undead (CR 1), Divine Strike (Life) / Divine Strike (War) / Divine Strike (Order)' },
      { level: 9, features: '5th Level Spells' },
      { level: 10, features: 'Divine Intervention' },
      { level: 11, features: 'Destroy Undead (CR 2), 6th Level Spells' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: '7th Level Spells' },
      { level: 14, features: 'Destroy Undead (CR 3)' },
      { level: 15, features: '8th Level Spells' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: "Destroy Undead (CR 4), 9th Level Spells, Supreme Healing (Life) / Avatar of Battle (War) / Order's Wrath (Order)" },
      { level: 18, features: 'Channel Divinity (3/rest)' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Divine Intervention Improvement' }
    ]
  },
  'Druid': {
    description: 'A priest of the Old Faith, wielding the powers of nature and adopting animal forms. Druids protect the natural world and balance.',
    features: ['Druidic', 'Spellcasting', 'Wild Shape', 'Druid Circle'],
    subclasses: [
      { name: 'Circle of the Land', color: '#27AE60', description: 'Draw power from the land itself' },
      { name: 'Circle of the Moon', color: '#95A5A6', description: 'Master of wild shape transformation' },
      { name: 'Circle of Dreams', color: '#9B59B6', description: 'Channel fey magic and dreams' }
    ],
    levelProgression: [
      { level: 1, features: 'Druidic, Spellcasting' },
      { level: 2, features: "Wild Shape, Druid Circle, Bonus Cantrip (Land), Natural Recovery (Land), Circle Spells (Land) / Combat Wild Shape (Moon), Circle Forms (Moon) / Balm of the Summer Court (Dreams)" },
      { level: 3, features: '2nd Level Spells' },
      { level: 4, features: 'Wild Shape Improvement, Ability Score Improvement' },
      { level: 5, features: '3rd Level Spells' },
      { level: 6, features: "Land's Stride (Land) / Primal Strike (Moon) / Hearth of Moonlight and Shadow (Dreams)" },
      { level: 7, features: '4th Level Spells' },
      { level: 8, features: 'Wild Shape Improvement, Ability Score Improvement' },
      { level: 9, features: '5th Level Spells' },
      { level: 10, features: "Nature's Ward (Land) / Elemental Wild Shape (Moon) / Hidden Paths (Dreams)" },
      { level: 11, features: '6th Level Spells' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: '7th Level Spells' },
      { level: 14, features: "Nature's Sanctuary (Land) / Thousand Forms (Moon) / Walker in Dreams (Dreams)" },
      { level: 15, features: '8th Level Spells' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: '9th Level Spells' },
      { level: 18, features: 'Timeless Body (Druid), Beast Spells' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Archdruid' }
    ]
  },
  'Fighter': {
    description: 'A master of martial combat, skilled with a variety of weapons and armor. Fighters excel in physical combat and tactical versatility.',
    features: ['Fighting Style', 'Second Wind', 'Action Surge', 'Extra Attack'],
    subclasses: [
      { name: 'Champion', color: '#F1C40F', description: 'Enhanced critical strikes and athleticism' },
      { name: 'Battle Master', color: '#3498DB', description: 'Tactical combat maneuvers' },
      { name: 'Eldritch Knight', color: '#9B59B6', description: 'Blend magic with martial prowess' }
    ],
    levelProgression: [
      { level: 1, features: 'Fighting Style, Second Wind' },
      { level: 2, features: 'Action Surge (one use)' },
      { level: 3, features: 'Martial Archetype, Improved Critical (Champion) / Combat Superiority (Battle Master), Student of War (Battle Master) / Spellcasting (Eldritch Knight), Weapon Bond (Eldritch Knight)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Extra Attack' },
      { level: 6, features: 'Ability Score Improvement' },
      { level: 7, features: 'Remarkable Athlete (Champion) / Know Your Enemy (Battle Master) / War Magic (Eldritch Knight)' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Indomitable (one use)' },
      { level: 10, features: 'Additional Fighting Style (Champion) / Improved Combat Superiority (Battle Master) / Eldritch Strike (Eldritch Knight)' },
      { level: 11, features: 'Extra Attack (2)' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Indomitable (two uses)' },
      { level: 14, features: 'Ability Score Improvement' },
      { level: 15, features: 'Superior Critical (Champion) / Relentless (Battle Master) / Arcane Charge (Eldritch Knight)' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Action Surge (two uses), Indomitable (three uses)' },
      { level: 18, features: 'Survivor (Champion) / Superior Combat Superiority (Battle Master) / Improved War Magic (Eldritch Knight)' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Extra Attack (3)' }
    ]
  },
  'Monk': {
    description: 'A master of martial arts, harnessing the power of the body in pursuit of physical and spiritual perfection. Monks combine unarmed combat with ki energy.',
    features: ['Unarmored Defense (Monk)', 'Martial Arts', 'Ki', 'Flurry of Blows'],
    subclasses: [
      { name: 'Way of the Open Hand', color: '#E67E22', description: 'Master of unarmed combat techniques' },
      { name: 'Way of Shadow', color: '#34495E', description: 'Ninja-like stealth and shadow magic' },
      { name: 'Way of the Four Elements', color: '#16A085', description: 'Channel elemental forces through ki' }
    ],
    levelProgression: [
      { level: 1, features: 'Unarmored Defense (Monk), Martial Arts' },
      { level: 2, features: 'Ki, Flurry of Blows, Patient Defense, Step of the Wind' },
      { level: 3, features: 'Monastic Tradition, Deflect Missiles, Open Hand Technique (Open Hand) / Shadow Arts (Shadow) / Disciple of the Elements (Four Elements), Elemental Attunement (Four Elements)' },
      { level: 4, features: 'Ability Score Improvement, Slow Fall' },
      { level: 5, features: 'Extra Attack, Stunning Strike' },
      { level: 6, features: 'Ki-Empowered Strikes, Wholeness of Body (Open Hand) / Shadow Step (Shadow)' },
      { level: 7, features: 'Evasion (Monk), Stillness of Mind' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Unarmored Movement Improvement' },
      { level: 10, features: 'Purity of Body' },
      { level: 11, features: 'Tranquility (Open Hand) / Cloak of Shadows (Shadow)' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Tongue of the Sun and Moon' },
      { level: 14, features: 'Diamond Soul' },
      { level: 15, features: 'Timeless Body (Monk)' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Quivering Palm (Open Hand) / Opportunist (Shadow)' },
      { level: 18, features: 'Empty Body' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Perfect Self' }
    ]
  },
  'Oathknight': {
    description: 'The final evolution of the knightly ideal — oath given form. Oathknights are immovable guardians with unmatched durability, wielding Constitution as their core strength.',
    features: ['Oathbound Vitality', 'Guarding Stance', 'Ascended Oath', 'Bulwark Aura'],
    subclasses: [
      { name: 'Oath of the Aegis', color: '#C0C0C0', description: 'Shield-focused ultimate defender' },
      { name: 'Oath of the Vanguard', color: '#DC143C', description: 'Two-handed offensive juggernaut' },
      { name: 'Oath of Mercy', color: '#FFD700', description: 'Battlefield medic who sustains allies through vitality' }
    ],
    levelProgression: [
      { level: 1, features: 'Oathbound Vitality, Martial Training' },
      { level: 2, features: 'Guarding Stance' },
      { level: 3, features: 'Ascended Oath, Unyielding Guard (Aegis) / Crusader Might (Vanguard) / Battlefield Medic (Mercy)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Extra Attack, Retributive Strike' },
      { level: 6, features: 'Shield Mastery (Aegis) / Momentum Guard (Vanguard) / Shared Vitality (Mercy)' },
      { level: 7, features: 'Iron Will' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Bulwark Aura' },
      { level: 10, features: 'Living Fortress (Aegis) / Wrath Unending (Vanguard) / Vow of Redemption (Mercy)' },
      { level: 11, features: 'Juggernaut Fortitude' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Stoneheart' },
      { level: 14, features: 'Reflective Aegis (Aegis) / Blood Warlord (Vanguard) / Blessed Recovery (Mercy)' },
      { level: 15, features: 'Adamant Resolve' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Indestructible (Aegis) / Titan Ascension (Vanguard) / Miracle Worker (Mercy)' },
      { level: 18, features: 'Immortal Guard' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Avatar of the Oath, Avatar - Aegis (Aegis) / Avatar - Vanguard (Vanguard) / Avatar - Mercy Enhancement (Mercy)' }
    ]
  },
  'Paladin': {
    description: 'A holy warrior bound to a sacred oath, wielding divine magic and martial prowess. Paladins are champions of justice and righteousness.',
    features: ['Divine Sense', 'Lay on Hands', 'Fighting Style', 'Spellcasting', 'Divine Smite'],
    subclasses: [
      { name: 'Oath of Devotion', color: '#ECF0F1', description: 'Uphold justice and virtue' },
      { name: 'Oath of the Ancients', color: '#27AE60', description: 'Preserve light and life' },
      { name: 'Oath of Vengeance', color: '#7F8C8D', description: 'Punish wrongdoers with fury' }
    ],
    levelProgression: [
      { level: 1, features: 'Divine Sense, Lay on Hands' },
      { level: 2, features: 'Fighting Style, Spellcasting, Divine Smite' },
      { level: 3, features: "Divine Health, Sacred Oath, Sacred Weapon (Devotion), Turn the Unholy (Devotion) / Nature's Wrath (Ancients), Turn the Faithless (Ancients) / Abjure Enemy (Vengeance), Vow of Enmity (Vengeance)" },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Extra Attack' },
      { level: 6, features: 'Aura of Protection' },
      { level: 7, features: 'Aura of Devotion (Devotion) / Aura of Warding (Ancients) / Relentless Avenger (Vengeance)' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: '3rd Level Spells' },
      { level: 10, features: 'Aura of Courage' },
      { level: 11, features: 'Improved Divine Smite' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: '4th Level Spells' },
      { level: 14, features: 'Cleansing Touch' },
      { level: 15, features: 'Purity of Spirit (Devotion) / Undying Sentinel (Ancients) / Soul of Vengeance (Vengeance)' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: '5th Level Spells' },
      { level: 18, features: 'Aura Improvements' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Holy Nimbus (Devotion) / Elder Champion (Ancients) / Avenging Angel (Vengeance)' }
    ]
  },
  'Primal Bond': {
    description: 'A warrior who forms an unbreakable bond with a beast companion, fighting as one unified force. Through shared instinct and coordinated strikes, you and your bonded beast become an unstoppable team.',
    features: ['Bonded Instinct', 'Shared Initiative', 'Predatory Focus', 'Primal Path & Beast Companion'],
    subclasses: [
      { name: 'Agile Hunter', color: '#F39C12', description: 'Swift predator bonded with Cheetah or Leopard (arrives level 3)' },
      { name: 'Packbound', color: '#7F8C8D', description: 'Pack leader bonded with Alpha or Omega Wolf (arrives level 6)' },
      { name: 'Colossal Bond', color: '#8B4513', description: 'Titan rider bonded with Elephant or Owlbear (arrives level 10)' }
    ],
    levelProgression: [
      { level: 1, features: 'Bonded Instinct, Shared Initiative' },
      { level: 2, features: 'Predatory Focus (+1d4 damage), Coordinated Strike (beast moves half speed as reaction)' },
      { level: 3, features: 'Primal Path Choice, Animal Aspect Choice (Agile Hunter beasts arrive)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Extra Attack' },
      { level: 6, features: 'Path Feature (Packbound beasts arrive)' },
      { level: 7, features: 'Shared Reflex (impose disadvantage PB/long rest)' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Instinctive Evasion' },
      { level: 10, features: 'Path Feature (Colossal Bond beasts arrive)' },
      { level: 11, features: 'Twin Assault (beast attacks without bonus action)' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Dominant Presence (10ft disadvantage on opportunity attacks)' },
      { level: 14, features: 'Path Feature' },
      { level: 15, features: 'Unbreakable Bond (beast survives at 1 HP once/long rest, transfer HP)' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Apex Instinct (enter Apex State), Dominant Presence (15ft)' },
      { level: 18, features: 'Perfect Coordination (independent reactions)' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Primal Ascension (+2 all stats max 22, immunity fear/charm, two turns once/long rest)' }
    ]
  },
  'Ranger': {
    description: 'A warrior who uses martial prowess and nature magic to combat threats on the edges of civilization. Rangers are skilled hunters and trackers.',
    features: ['Favored Enemy', 'Natural Explorer', 'Fighting Style', 'Spellcasting'],
    subclasses: [
      { name: 'Hunter', color: '#A0522D', description: 'Specialized at taking down prey' },
      { name: 'Gloom Stalker', color: '#2C3E50', description: 'Master of the darkness' }
    ],
    levelProgression: [
      { level: 1, features: 'Favored Enemy, Natural Explorer' },
      { level: 2, features: 'Fighting Style, Spellcasting' },
      { level: 3, features: "Ranger Archetype, Primeval Awareness, Hunter's Prey (Hunter), Colossus Slayer/Giant Killer/Horde Breaker (Hunter) / Dread Ambusher (Gloom Stalker), Umbral Sight (Gloom Stalker)" },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Extra Attack' },
      { level: 6, features: 'Favored Enemy and Natural Explorer Improvements' },
      { level: 7, features: "Defensive Tactics (Hunter), Escape the Horde/Multiattack Defense/Steel Will (Hunter) / Iron Mind (Gloom Stalker)" },
      { level: 8, features: "Ability Score Improvement, Land's Stride" },
      { level: 9, features: '3rd Level Spells' },
      { level: 10, features: 'Natural Explorer Improvement, Hide in Plain Sight' },
      { level: 11, features: "Multiattack (Hunter), Volley/Whirlwind Attack (Hunter) / Stalker's Flurry (Gloom Stalker)" },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: '4th Level Spells' },
      { level: 14, features: 'Favored Enemy Improvement, Vanish' },
      { level: 15, features: "Superior Hunter's Defense (Hunter), Evasion/Stand Against the Tide/Uncanny Dodge (Hunter) / Shadowy Dodge (Gloom Stalker)" },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: '5th Level Spells' },
      { level: 18, features: 'Feral Senses' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Foe Slayer' }
    ]
  },
  'Reaver': {
    description: 'Masters of thrown steel, spatial manipulation, and lethal precision. Reavers excel at ranged combat with throwing weapons, combining mobility with deadly accuracy.',
    features: ['Blade Savant', 'Swift Draw', 'Recall Blades', 'Twin Throw'],
    subclasses: [
      { name: 'Whirlwind Path', color: '#00CED1', description: 'Become a storm of blades' },
      { name: 'Phantom Path', color: '#8B008B', description: 'Phase through reality' },
      { name: 'Sentinel Path', color: '#FF8C00', description: 'Protect allies with thrown steel' }
    ],
    levelProgression: [
      { level: 1, features: 'Blade Savant, Swift Draw' },
      { level: 2, features: 'Recall Blades' },
      { level: 3, features: "Reaver Path, Relentless Motion (Whirlwind), Dagger Step (Phantom), Guardian's Mark (Sentinel)" },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Twin Throw, Quickstep' },
      { level: 6, features: 'Whirling Strikes (Whirlwind), Ethereal Blades (Phantom), Intercepting Throw (Sentinel)' },
      { level: 7, features: 'Ricochet Strike' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Blade Storm' },
      { level: 10, features: 'Storm of Blades (Whirlwind), Shadow Walk (Phantom), Pinning Strike (Sentinel)' },
      { level: 11, features: 'Unerring Precision' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Dancing Death' },
      { level: 14, features: 'Cyclone Strike (Whirlwind), Phantom Strike (Phantom), Blade Barrier (Sentinel)' },
      { level: 15, features: 'Flow of Steel' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Eye of the Storm (Whirlwind), Ghost in Steel (Phantom), Steel Sentinel (Sentinel)' },
      { level: 18, features: 'Shadow Recall' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Avatar of the Blade' }
    ]
  },
  'Rogue': {
    description: 'A scoundrel who uses stealth and trickery to overcome obstacles and enemies. Rogues excel at precision attacks and cunning tactics.',
    features: ['Expertise', 'Sneak Attack', 'Cunning Action', 'Uncanny Dodge'],
    subclasses: [
      { name: 'Thief', color: '#7F8C8D', description: 'Fast hands and second-story work' },
      { name: 'Assassin', color: '#C0392B', description: 'Master of disguise and death' },
      { name: 'Arcane Trickster', color: '#9B59B6', description: 'Blend magic with stealth' }
    ],
    levelProgression: [
      { level: 1, features: "Expertise, Sneak Attack (1d6), Thieves' Cant" },
      { level: 2, features: 'Cunning Action' },
      { level: 3, features: 'Sneak Attack (2d6), Roguish Archetype, Fast Hands (Thief), Second-Story Work (Thief) / Bonus Proficiencies (Assassin), Assassinate (Assassin) / Spellcasting (Arcane Trickster), Mage Hand Legerdemain (Arcane Trickster)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Sneak Attack (3d6), Uncanny Dodge' },
      { level: 6, features: 'Expertise' },
      { level: 7, features: 'Sneak Attack (4d6), Evasion (Rogue)' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Sneak Attack (5d6), Supreme Sneak (Thief) / Infiltration Expertise (Assassin) / Magical Ambush (Arcane Trickster)' },
      { level: 10, features: 'Ability Score Improvement' },
      { level: 11, features: 'Sneak Attack (6d6), Reliable Talent' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Sneak Attack (7d6), Use Magic Device (Thief) / Imposter (Assassin) / Versatile Trickster (Arcane Trickster)' },
      { level: 14, features: 'Blindsense' },
      { level: 15, features: 'Sneak Attack (8d6), Slippery Mind' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: "Sneak Attack (9d6), Thief's Reflexes (Thief) / Death Strike (Assassin) / Spell Thief (Arcane Trickster)" },
      { level: 18, features: 'Elusive' },
      { level: 19, features: 'Sneak Attack (10d6), Ability Score Improvement' },
      { level: 20, features: 'Stroke of Luck' }
    ]
  },
  'Shadow Sovereign': {
    description: 'An assassin who kills, claims, and commands. Those you slay do not rest — they kneel. A battlefield controller that converts kills into permanent pressure, replacing slain enemies with shadowy echoes.',
    features: ["Shadow Step", "Shadow Reap", "Assassin's Mark", "Shadow Legion"],
    subclasses: [],
    levelProgression: [
      { level: 1, features: 'Shadow Step (Invisibility + teleport, +2d6 necrotic)' },
      { level: 2, features: "Assassin's Mark (+1d8 damage, auto-crit when hidden)" },
      { level: 3, features: 'Cloak of Dusk (Resistance to all damage when hiding)' },
      { level: 4, features: 'Ability Score Improvement, Death from Darkness (+3d6 necrotic, frighten on Con save)' },
      { level: 5, features: 'Phantom Assault (Teleport + stealth attack)' },
      { level: 6, features: 'Shadow Reap (1/long rest - raise slain as Shadow Echo), Shadow Realm (Con mod active shadows, Con×4 stored)' },
      { level: 7, features: 'Improved Shadow Step (60ft range, bring ally/shadow, free attack)' },
      { level: 8, features: 'Ability Score Improvement, Sovereign of Shades (Shadows use prof bonus, Aura of Dread)' },
      { level: 9, features: "Executioner's Presence (10ft aura: disadvantage vs fear/necrotic, no advantage, max damage vs <25% HP)" },
      { level: 10, features: 'Life for a Life (1/long rest - survive death by sacrificing shadow)' },
      { level: 11, features: 'Shadow Mastery (+2 Shadow Step uses, ignore terrain while invisible)' },
      { level: 12, features: 'Ability Score Improvement, Twin Reap (Shadow Reap 2/long rest)' },
      { level: 13, features: 'Living Darkness (+1 AC per active shadow)' },
      { level: 14, features: 'Shadow Legion (Shadows act without action/bonus action)' },
      { level: 15, features: 'Death Refuses You (Life for a Life 2/long rest, use stored if no active)' },
      { level: 16, features: 'Ability Score Improvement, Absolute Silence (Frightened = silenced, no verbal spells)' },
      { level: 17, features: 'Shadow Cataclysm (1/long rest - all shadows attack, kills auto-Reap)' },
      { level: 18, features: "Sovereign's Domain (30ft dim light aura, suppress <5th level magical light)" },
      { level: 19, features: 'Ability Score Improvement, You Decide Who Dies (1/long rest - declare execution, auto-crit, auto-Reap)' },
      { level: 20, features: 'The Shadow Throne (All stored active, unlimited Shadow Step, Life for a Life uses souls)' }
    ]
  },
  'Sorcerer': {
    description: 'A spellcaster who draws on inherent magic from a gift or bloodline. Sorcerers manipulate raw magical energy with innate power.',
    features: ['Spellcasting', 'Sorcerous Origin', 'Font of Magic', 'Metamagic'],
    subclasses: [
      { name: 'Draconic Bloodline', color: '#E74C3C', description: 'Dragon ancestor empowers magic' },
      { name: 'Wild Magic', color: '#9B59B6', description: 'Chaotic and unpredictable power' },
      { name: 'Divine Soul', color: '#ECF0F1', description: 'Blessed with divine magic' }
    ],
    levelProgression: [
      { level: 1, features: 'Spellcasting, Sorcerous Origin, Dragon Ancestor (Draconic), Draconic Resilience (Draconic) / Wild Magic Surge (Wild Magic), Tides of Chaos (Wild Magic) / Divine Magic (Divine Soul), Favored by the Gods (Divine Soul)' },
      { level: 2, features: 'Font of Magic' },
      { level: 3, features: 'Metamagic (2 options)' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: '3rd Level Spells' },
      { level: 6, features: 'Elemental Affinity (Draconic) / Bend Luck (Wild Magic) / Empowered Healing (Divine Soul)' },
      { level: 7, features: '4th Level Spells' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: '5th Level Spells' },
      { level: 10, features: 'Metamagic (3rd option)' },
      { level: 11, features: '6th Level Spells' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: '7th Level Spells' },
      { level: 14, features: 'Dragon Wings (Draconic) / Controlled Chaos (Wild Magic) / Otherworldly Wings (Divine Soul)' },
      { level: 15, features: '8th Level Spells' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Metamagic (4th option), 9th Level Spells' },
      { level: 18, features: 'Draconic Presence (Draconic) / Spell Bombardment (Wild Magic) / Unearthly Recovery (Divine Soul)' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Sorcerous Restoration' }
    ]
  },
  'Warlock': {
    description: 'A wielder of magic derived from a bargain with an extraplanar entity. Warlocks gain eldritch powers through their otherworldly patron.',
    features: ['Otherworldly Patron', 'Pact Magic', 'Eldritch Invocations', 'Pact Boon'],
    subclasses: [
      { name: 'The Fiend', color: '#C0392B', description: 'Power from lower planes' },
      { name: 'The Archfey', color: '#1ABC9C', description: 'Fey lord grants enchantments' },
      { name: 'The Great Old One', color: '#8E44AD', description: 'Alien mind bending powers' }
    ],
    levelProgression: [
      { level: 1, features: "Otherworldly Patron, Pact Magic, Dark One's Blessing (Fiend) / Fey Presence (Archfey) / Awakened Mind (Great Old One)" },
      { level: 2, features: 'Eldritch Invocations (2)' },
      { level: 3, features: 'Pact Boon' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Eldritch Invocations (3), Eldritch Blast (2 Beams)' },
      { level: 6, features: "Dark One's Own Luck (Fiend) / Misty Escape (Archfey) / Entropic Ward (Great Old One)" },
      { level: 7, features: 'Eldritch Invocations (4)' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Eldritch Invocations (5)' },
      { level: 10, features: 'Fiendish Resilience (Fiend) / Beguiling Defenses (Archfey) / Thought Shield (Great Old One)' },
      { level: 11, features: 'Mystic Arcanum (6th level), Eldritch Blast (3 Beams)' },
      { level: 12, features: 'Ability Score Improvement, Eldritch Invocations (6)' },
      { level: 13, features: 'Mystic Arcanum (7th level)' },
      { level: 14, features: 'Hurl Through Hell (Fiend) / Dark Delirium (Archfey) / Create Thrall (Great Old One)' },
      { level: 15, features: 'Mystic Arcanum (8th level), Eldritch Invocations (7)' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Mystic Arcanum (9th level), Eldritch Blast (4 Beams)' },
      { level: 18, features: 'Eldritch Invocations (8)' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Eldritch Master' }
    ]
  },
  'Wizard': {
    description: 'A scholarly magic-user capable of manipulating the structures of reality. Wizards study arcane lore and master a wide variety of spells.',
    features: ['Spellcasting', 'Arcane Recovery', 'Arcane Tradition', 'Spell Mastery'],
    subclasses: [
      { name: 'School of Evocation', color: '#E74C3C', description: 'Master of destructive magic' },
      { name: 'School of Abjuration', color: '#3498DB', description: 'Protective wards and shields' },
      { name: 'School of Divination', color: '#9B59B6', description: 'See the future and bend fate' }
    ],
    levelProgression: [
      { level: 1, features: 'Spellcasting, Arcane Recovery' },
      { level: 2, features: 'Arcane Tradition, Evocation Savant (Evocation), Sculpt Spells (Evocation) / Abjuration Savant (Abjuration), Arcane Ward (Abjuration) / Divination Savant (Divination), Portent (Divination)' },
      { level: 3, features: '2nd Level Spells' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: '3rd Level Spells' },
      { level: 6, features: 'Potent Cantrip (Evocation) / Projected Ward (Abjuration) / Expert Divination (Divination)' },
      { level: 7, features: '4th Level Spells' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: '5th Level Spells' },
      { level: 10, features: 'Empowered Evocation (Evocation) / Improved Abjuration (Abjuration) / The Third Eye (Divination)' },
      { level: 11, features: '6th Level Spells' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: '7th Level Spells' },
      { level: 14, features: 'Overchannel (Evocation) / Spell Resistance (Abjuration) / Greater Portent (Divination)' },
      { level: 15, features: '8th Level Spells' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: '9th Level Spells' },
      { level: 18, features: 'Spell Mastery' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'Signature Spells' }
    ]
  },
  'Charlatan': {
    description: 'A master of misdirection, sleight of hand, and spectacle. The Charlatan never casts a spell — yet crowds swear they witnessed miracles. Uses Tricks (recharge on short rest) instead of spell slots.',
    features: ['Read the Room', 'Card Throw', 'Misdirection', 'Flash Flourish'],
    subclasses: [
      { name: 'The High Roller', color: '#F59E0B', description: 'Luck manipulator who bends probability and crits' },
      { name: 'The Phantom Joker', color: '#6366F1', description: 'Stealth and decoys — smoke, mirrors, and speed' },
      { name: 'The Pyrotechnician', color: '#EF4444', description: 'Carnival explosives and trick gadget specialist' }
    ],
    levelProgression: [
      { level: 1, features: 'Read the Room (CHA for Insight/Perception), Card Throw (1d6 finesse ranged 30/90 ft), 2 Tricks/short rest' },
      { level: 2, features: 'Misdirection (reaction, 1 Trick: force attacker reroll take lower)' },
      { level: 3, features: 'Stacked Deck (High Roller) / Illusion Double (Phantom Joker) / Explosive Cards (Pyrotechnician), 3 Tricks/short rest' },
      { level: 4, features: 'Ability Score Improvement' },
      { level: 5, features: 'Flash Flourish (spend 1 Trick on Card Throw hit: +2d6 dmg, blind target Con save), Card Throw → 1d8' },
      { level: 6, features: 'Loaded Odds (High Roller) / Smoke Vanish (Phantom Joker) / Smoke Bomb (Pyrotechnician), 4 Tricks/short rest' },
      { level: 7, features: 'Evasion of Blame (succeed Dex save → take no damage instead of half)' },
      { level: 8, features: 'Ability Score Improvement' },
      { level: 9, features: 'Grand Display (action, 2 Tricks: 20 ft Wis save → Frightened or Charmed 1 min), 4 Tricks/short rest' },
      { level: 10, features: 'Cheat Fate (High Roller) / Shadow Step (Phantom Joker) / Shrapnel Burst (Pyrotechnician), 5 Tricks/short rest' },
      { level: 11, features: 'Impossible Escape (reaction, 2 Tricks: auto-escape restrain/grapple + move half speed), Card Throw → 1d10' },
      { level: 12, features: 'Ability Score Improvement' },
      { level: 13, features: 'Master of Falsehood (Expertise: Deception & Sleight of Hand)' },
      { level: 14, features: "House Always Wins (High Roller) / Joker's Last Laugh (Phantom Joker) / Trick Presents (Pyrotechnician), 6 Tricks/short rest" },
      { level: 15, features: 'Dramatic Reversal (1/long rest: survive at 1 HP instead of 0, immediately take a bonus turn)' },
      { level: 16, features: 'Ability Score Improvement' },
      { level: 17, features: 'Supreme Misdirection (2 Tricks: turn a critical hit into a normal hit), Card Throw → 1d12' },
      { level: 18, features: 'Miracle Run (High Roller) / Endless Doubles (Phantom Joker) / Grand Finale (Pyrotechnician), 7 Tricks/short rest' },
      { level: 19, features: 'Ability Score Improvement' },
      { level: 20, features: 'The Greatest Show (start of combat: regain 2 Tricks; once per turn use a Trick without expending it), 8 Tricks/short rest' }
    ]
  }
};
