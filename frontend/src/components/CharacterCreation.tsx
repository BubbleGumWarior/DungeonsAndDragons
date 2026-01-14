import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { characterAPI, D5eReferenceData, Skill, skillAPI } from '../services/api';

interface CharacterData {
  name: string;
  race: string;
  class: string;
  background: string;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  skills: string[];
  equipment: string[];
  spells: string[];
  backstory: string;
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  usedRandomClass: boolean;
}

const CharacterCreation: React.FC = () => {
  const { campaignName } = useParams<{ campaignName: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentCampaign, loadCampaign, createCharacter } = useCampaign();

  const [referenceData, setReferenceData] = useState<D5eReferenceData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Random class selection state
  const [randomClasses, setRandomClasses] = useState<string[]>([]);
  
  // Point buy system state
  const basePoints = 27; // Standard D&D 5e point buy
  const [bonusPoints, setBonusPoints] = useState(0); // +4 for random class selection

  // Class info modal state
  const [showClassInfo, setShowClassInfo] = useState<string | null>(null);

  // Skill tooltip state
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const [skillData, setSkillData] = useState<Record<string, Skill>>({});
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [characterData, setCharacterData] = useState<CharacterData>({
    name: '',
    race: '',
    class: '',
    background: '',
    abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    skills: [],
    equipment: [],
    spells: [],
    backstory: '',
    personality_traits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    usedRandomClass: false
  });

  const totalSteps = 6;

  // Point buy cost calculation (D&D 5e rules)
  const getPointCost = (score: number): number => {
    if (score <= 13) return score - 8;
    if (score === 14) return 7;
    if (score === 15) return 9;
    return 0;
  };

  // Calculate total points spent
  const calculatePointsSpent = (): number => {
    return Object.values(characterData.abilities).reduce((total, score) => total + getPointCost(score), 0);
  };

  // Get available points (base + bonus for random class)
  const getAvailablePoints = (): number => {
    return basePoints + bonusPoints;
  };

  // Handle random class selection
  const selectRandomClass = (className: string): void => {
    setCharacterData(prev => ({ ...prev, class: className, usedRandomClass: true }));
    setBonusPoints(4); // Award bonus points for random selection
  };

  // Handle manual class selection
  const selectManualClass = (className: string): void => {
    setCharacterData(prev => ({ ...prev, class: className, usedRandomClass: false }));
    setBonusPoints(0); // No bonus points for manual selection
  };

  // Subclass type definition
  interface Subclass {
    name: string;
    color: string;
    description: string;
  }

  // Class information with descriptions, subclasses, and level progression
  const classInfo: Record<string, { 
    description: string; 
    features: string[]; 
    subclasses: Subclass[];
    levelProgression: { level: number; features: string }[] 
  }> = {
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
        { name: 'Trickery Domain', color: '#8E44AD', description: 'Agent of deception and misdirection' }
      ],
      levelProgression: [
        { level: 1, features: 'Spellcasting, Divine Domain, Bonus Proficiency (Life), Disciple of Life (Life) / Bonus Proficiencies (War), War Priest (War) / Blessing of the Trickster (Trickery)' },
        { level: 2, features: 'Channel Divinity (1/rest), Preserve Life (Life) / Channel Divinity: Guided Strike (War) / Channel Divinity: Invoke Duplicity (Trickery)' },
        { level: 3, features: '2nd Level Spells' },
        { level: 4, features: 'Ability Score Improvement' },
        { level: 5, features: 'Destroy Undead (CR 1/2), 3rd Level Spells' },
        { level: 6, features: 'Channel Divinity (2/rest), Blessed Healer (Life) / Channel Divinity: War God\'s Blessing (War) / Channel Divinity: Cloak of Shadows (Trickery)' },
        { level: 7, features: '4th Level Spells' },
        { level: 8, features: 'Ability Score Improvement, Destroy Undead (CR 1), Divine Strike (Life) / Divine Strike (War) / Divine Strike (Trickery)' },
        { level: 9, features: '5th Level Spells' },
        { level: 10, features: 'Divine Intervention' },
        { level: 11, features: 'Destroy Undead (CR 2), 6th Level Spells' },
        { level: 12, features: 'Ability Score Improvement' },
        { level: 13, features: '7th Level Spells' },
        { level: 14, features: 'Destroy Undead (CR 3)' },
        { level: 15, features: '8th Level Spells' },
        { level: 16, features: 'Ability Score Improvement' },
        { level: 17, features: 'Destroy Undead (CR 4), 9th Level Spells, Supreme Healing (Life) / Avatar of Battle (War) / Improved Duplicity (Trickery)' },
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
        { level: 2, features: 'Wild Shape, Druid Circle, Bonus Cantrip (Land), Natural Recovery (Land), Circle Spells (Land) / Combat Wild Shape (Moon), Circle Forms (Moon) / Balm of the Summer Court (Dreams)' },
        { level: 3, features: '2nd Level Spells' },
        { level: 4, features: 'Wild Shape Improvement, Ability Score Improvement' },
        { level: 5, features: '3rd Level Spells' },
        { level: 6, features: 'Land\'s Stride (Land) / Primal Strike (Moon) / Hearth of Moonlight and Shadow (Dreams)' },
        { level: 7, features: '4th Level Spells' },
        { level: 8, features: 'Wild Shape Improvement, Ability Score Improvement' },
        { level: 9, features: '5th Level Spells' },
        { level: 10, features: 'Nature\'s Ward (Land) / Elemental Wild Shape (Moon) / Hidden Paths (Dreams)' },
        { level: 11, features: '6th Level Spells' },
        { level: 12, features: 'Ability Score Improvement' },
        { level: 13, features: '7th Level Spells' },
        { level: 14, features: 'Nature\'s Sanctuary (Land) / Thousand Forms (Moon) / Walker in Dreams (Dreams)' },
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
        { name: 'Oath of the Vanguard', color: '#DC143C', description: 'Two-handed offensive juggernaut' }
      ],
      levelProgression: [
        { level: 1, features: 'Oathbound Vitality, Martial Training' },
        { level: 2, features: 'Guarding Stance' },
        { level: 3, features: 'Ascended Oath, Unyielding Guard (Aegis) / Crusader Might (Vanguard)' },
        { level: 4, features: 'Ability Score Improvement' },
        { level: 5, features: 'Retributive Strike' },
        { level: 6, features: 'Shield Mastery (Aegis) / Momentum Guard (Vanguard)' },
        { level: 7, features: 'Iron Will' },
        { level: 8, features: 'Ability Score Improvement' },
        { level: 9, features: 'Bulwark Aura' },
        { level: 10, features: 'Living Fortress (Aegis) / Wrath Unending (Vanguard)' },
        { level: 11, features: 'Juggernaut Fortitude' },
        { level: 12, features: 'Ability Score Improvement' },
        { level: 13, features: 'Stoneheart' },
        { level: 14, features: 'Reflective Aegis (Aegis) / Blood Warlord (Vanguard)' },
        { level: 15, features: 'Adamant Resolve' },
        { level: 16, features: 'Ability Score Improvement' },
        { level: 17, features: 'Indestructible (Aegis) / Titan Ascension (Vanguard)' },
        { level: 18, features: 'Immortal Guard' },
        { level: 19, features: 'Ability Score Improvement' },
        { level: 20, features: 'Avatar of the Oath, Avatar - Aegis (Aegis) / Avatar - Vanguard (Vanguard)' }
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
        { level: 3, features: 'Divine Health, Sacred Oath, Sacred Weapon (Devotion), Turn the Unholy (Devotion) / Nature\'s Wrath (Ancients), Turn the Faithless (Ancients) / Abjure Enemy (Vengeance), Vow of Enmity (Vengeance)' },
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
        { level: 3, features: 'Ranger Archetype, Primeval Awareness, Hunter\'s Prey (Hunter), Colossus Slayer/Giant Killer/Horde Breaker (Hunter) / Dread Ambusher (Gloom Stalker), Umbral Sight (Gloom Stalker)' },
        { level: 4, features: 'Ability Score Improvement' },
        { level: 5, features: 'Extra Attack' },
        { level: 6, features: 'Favored Enemy and Natural Explorer Improvements' },
        { level: 7, features: 'Defensive Tactics (Hunter), Escape the Horde/Multiattack Defense/Steel Will (Hunter) / Iron Mind (Gloom Stalker)' },
        { level: 8, features: 'Ability Score Improvement, Land\'s Stride' },
        { level: 9, features: '3rd Level Spells' },
        { level: 10, features: 'Natural Explorer Improvement, Hide in Plain Sight' },
        { level: 11, features: 'Multiattack (Hunter), Volley/Whirlwind Attack (Hunter) / Stalker\'s Flurry (Gloom Stalker)' },
        { level: 12, features: 'Ability Score Improvement' },
        { level: 13, features: '4th Level Spells' },
        { level: 14, features: 'Favored Enemy Improvement, Vanish' },
        { level: 15, features: 'Superior Hunter\'s Defense (Hunter), Evasion/Stand Against the Tide/Uncanny Dodge (Hunter) / Shadowy Dodge (Gloom Stalker)' },
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
        { level: 3, features: 'Reaver Path, Relentless Motion (Whirlwind), Dagger Step (Phantom), Guardian\'s Mark (Sentinel)' },
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
        { level: 1, features: 'Expertise, Sneak Attack (1d6), Thieves\' Cant' },
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
        { level: 17, features: 'Sneak Attack (9d6), Thief\'s Reflexes (Thief) / Death Strike (Assassin) / Spell Thief (Arcane Trickster)' },
        { level: 18, features: 'Elusive' },
        { level: 19, features: 'Sneak Attack (10d6), Ability Score Improvement' },
        { level: 20, features: 'Stroke of Luck' }
      ]
    },
    'Shadow Sovereign': {
      description: 'An assassin who kills, claims, and commands. Those you slay do not rest — they kneel. A battlefield controller that converts kills into permanent pressure, replacing slain enemies with shadowy echoes.',
      features: ['Shadow Step', 'Shadow Reap', 'Assassin\'s Mark', 'Shadow Legion'],
      subclasses: [], // No subclasses - single path progression
      levelProgression: [
        { level: 1, features: 'Shadow Step (Invisibility + teleport, +2d6 necrotic)' },
        { level: 2, features: 'Assassin\'s Mark (+1d8 damage, auto-crit when hidden)' },
        { level: 3, features: 'Cloak of Dusk (Resistance to all damage when hiding)' },
        { level: 4, features: 'Ability Score Improvement, Death from Darkness (+3d6 necrotic, frighten on Con save)' },
        { level: 5, features: 'Phantom Assault (Teleport + stealth attack)' },
        { level: 6, features: 'Shadow Reap (1/long rest - raise slain as Shadow Echo), Shadow Realm (Con mod active shadows, Con×4 stored)' },
        { level: 7, features: 'Improved Shadow Step (60ft range, bring ally/shadow, free attack)' },
        { level: 8, features: 'Ability Score Improvement, Sovereign of Shades (Shadows use prof bonus, Aura of Dread)' },
        { level: 9, features: 'Executioner\'s Presence (10ft aura: disadvantage vs fear/necrotic, no advantage, max damage vs <25% HP)' },
        { level: 10, features: 'Life for a Life (1/long rest - survive death by sacrificing shadow)' },
        { level: 11, features: 'Shadow Mastery (+2 Shadow Step uses, ignore terrain while invisible)' },
        { level: 12, features: 'Ability Score Improvement, Twin Reap (Shadow Reap 2/long rest)' },
        { level: 13, features: 'Living Darkness (+1 AC per active shadow)' },
        { level: 14, features: 'Shadow Legion (Shadows act without action/bonus action)' },
        { level: 15, features: 'Death Refuses You (Life for a Life 2/long rest, use stored if no active)' },
        { level: 16, features: 'Ability Score Improvement, Absolute Silence (Frightened = silenced, no verbal spells)' },
        { level: 17, features: 'Shadow Cataclysm (1/long rest - all shadows attack, kills auto-Reap)' },
        { level: 18, features: 'Sovereign\'s Domain (30ft dim light aura, suppress <5th level magical light)' },
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
        { level: 1, features: 'Otherworldly Patron, Pact Magic, Dark One\'s Blessing (Fiend) / Fey Presence (Archfey) / Awakened Mind (Great Old One)' },
        { level: 2, features: 'Eldritch Invocations (2)' },
        { level: 3, features: 'Pact Boon' },
        { level: 4, features: 'Ability Score Improvement' },
        { level: 5, features: 'Eldritch Invocations (3)' },
        { level: 6, features: 'Dark One\'s Own Luck (Fiend) / Misty Escape (Archfey) / Entropic Ward (Great Old One)' },
        { level: 7, features: 'Eldritch Invocations (4)' },
        { level: 8, features: 'Ability Score Improvement' },
        { level: 9, features: 'Eldritch Invocations (5)' },
        { level: 10, features: 'Fiendish Resilience (Fiend) / Beguiling Defenses (Archfey) / Thought Shield (Great Old One)' },
        { level: 11, features: 'Mystic Arcanum (6th level)' },
        { level: 12, features: 'Ability Score Improvement, Eldritch Invocations (6)' },
        { level: 13, features: 'Mystic Arcanum (7th level)' },
        { level: 14, features: 'Hurl Through Hell (Fiend) / Dark Delirium (Archfey) / Create Thrall (Great Old One)' },
        { level: 15, features: 'Mystic Arcanum (8th level), Eldritch Invocations (7)' },
        { level: 16, features: 'Ability Score Improvement' },
        { level: 17, features: 'Mystic Arcanum (9th level)' },
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
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        if (campaignName) {
          await loadCampaign(campaignName);
        }
        const refData = await characterAPI.getReferenceData();
        setReferenceData(refData);
        
        // Load skills
        const skillsResponse = await skillAPI.getAll();
        const skillsMap: Record<string, Skill> = {};
        skillsResponse.forEach(skill => {
          skillsMap[skill.name] = skill;
        });
        setSkillData(skillsMap);
        
        // Check for saved random classes in localStorage first
        const savedRandomClasses = localStorage.getItem('dnd-random-classes');
        if (savedRandomClasses) {
          try {
            const parsedClasses = JSON.parse(savedRandomClasses);
            if (Array.isArray(parsedClasses) && parsedClasses.length === 3) {
              setRandomClasses(parsedClasses);
              return; // Don't generate new ones if we have saved ones
            }
          } catch (e) {
            // If parsing fails, generate new ones
            console.warn('Failed to parse saved random classes, generating new ones');
          }
        }
        
        // Generate new random classes if none saved or parsing failed
        if (refData?.classes) {
          const shuffled = [...refData.classes].sort(() => Math.random() - 0.5);
          const selected = shuffled.slice(0, 3).map(c => c.name);
          setRandomClasses(selected);
          
          // Save to localStorage
          localStorage.setItem('dnd-random-classes', JSON.stringify(selected));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load character creation data');
      }
    };
    loadData();
  }, [campaignName, loadCampaign]);

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAbilityChange = (ability: keyof CharacterData['abilities'], value: number) => {
    // Check if the new point allocation is valid
    const newAbilities = { ...characterData.abilities, [ability]: value };
    const newTotal = Object.values(newAbilities).reduce((total, score) => total + getPointCost(score), 0);
    
    if (newTotal <= getAvailablePoints()) {
      setCharacterData(prev => ({
        ...prev,
        abilities: newAbilities
      }));
    }
  };

  const handleSkillToggle = (skill: string) => {
    setCharacterData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const calculateHitPoints = () => {
    if (!characterData.class || !referenceData) return 8;
    const classData = referenceData.classes.find(c => c.name === characterData.class);
    const conModifier = Math.floor((characterData.abilities.con - 10) / 2);
    return (classData?.hitDie || 8) + conModifier;
  };

  const calculateArmorClass = () => {
    const dexModifier = Math.floor((characterData.abilities.dex - 10) / 2);
    // Base AC (10) + Dex modifier, more complex armor calculations could be added
    return 10 + dexModifier;
  };

  const handleSubmit = async () => {
    if (!currentCampaign) {
      setError('Campaign not found');
      return;
    }

    try {
      setIsLoading(true);
      await createCharacter({
        campaign_id: currentCampaign.campaign.id,
        name: characterData.name,
        race: characterData.race,
        class: characterData.class,
        background: characterData.background,
        level: 1,
        hit_points: calculateHitPoints(),
        armor_class: calculateArmorClass(),
        abilities: characterData.abilities,
        skills: characterData.skills,
        equipment: [], // Start with no equipment - can be added later
        spells: characterData.spells,
        backstory: characterData.backstory,
        personality_traits: characterData.personality_traits,
        ideals: characterData.ideals,
        bonds: characterData.bonds,
        flaws: characterData.flaws,
        movement_speed: 30 // Default movement speed
      });

      // Clear saved random classes so next character gets new random options
      localStorage.removeItem('dnd-random-classes');

      navigate(`/campaign/${campaignName}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create character');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return characterData.class.trim().length > 0; // Class selection
      case 2: return characterData.name.trim().length > 0 && characterData.race && characterData.background; // Name, race, background
      case 3: return true; // Point buy - always allow proceeding even with default stats
      case 4: return true; // Skills - optional
      case 5: return true; // Backstory - optional
      case 6: return true; // Final review
      default: return false;
    }
  };

  // Render text with skill name detection and hover tooltips, plus subclass color coding
  const renderTextWithSkillTooltips = (text: string, className?: string) => {
    const elements: React.ReactElement[] = [];
    let remainingText = text;
    let index = 0;

    // Get subclass colors for the current class
    const subclassColors: Record<string, string> = {};
    if (showClassInfo && classInfo[showClassInfo]) {
      classInfo[showClassInfo].subclasses.forEach(subclass => {
        subclassColors[subclass.name] = subclass.color;
      });
    }

    // Sort skill names by length (longest first) to match multi-word skills first
    const sortedSkillNames = Object.keys(skillData).sort((a, b) => b.length - a.length);

    while (remainingText.length > 0) {
      let matched = false;

      // First check for subclass choice features (Path, College, Domain, etc.)
      const subclassChoices = [
        'Primal Path', 'Bard College', 'Divine Domain', 'Druid Circle',
        'Martial Archetype', 'Monastic Tradition', 'Sacred Oath', 'Ranger Archetype',
        'Roguish Archetype', 'Sorcerous Origin', 'Otherworldly Patron', 'Arcane Tradition',
        'Reaver Path', 'Ascended Oath'
      ];

      for (const choice of subclassChoices) {
        const choiceRegex = new RegExp(`^${choice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|\\(|,|$)`);
        if (choiceRegex.test(remainingText)) {
          // This is a subclass choice - make it rainbow/multi-color
          elements.push(
            <span
              key={`subclass-choice-${index}`}
              style={{
                background: 'linear-gradient(90deg, #FF6B6B, #4ECDC4, #45B7D1, #96CEB4, #FFEAA7, #DFE6E9)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 'bold',
                cursor: 'help'
              }}
              title="Choose your subclass path"
            >
              {choice}
            </span>
          );
          remainingText = remainingText.slice(choice.length);
          matched = true;
          index++;
          break;
        }
      }

      if (matched) continue;

      // Check for subclass-specific features with parentheses like "Feature Name (Subclass)"
      // Match pattern: word characters, spaces, parentheses containing subclass name
      const subclassFeatureMatch = remainingText.match(/^([^,()]+)\s*\(([^)]+)\)(?=\s|,|$)/);
      if (subclassFeatureMatch) {
        const featureName = subclassFeatureMatch[1].trim();
        const subclassName = subclassFeatureMatch[2].trim();
        const fullFeature = subclassFeatureMatch[0];
        
        // Check if this is a known subclass name
        let subclassColor = null;
        for (const [scName, scColor] of Object.entries(subclassColors)) {
          // Match partial names like "Whirlwind" matching "Whirlwind Path"
          if (scName.includes(subclassName) || subclassName.includes(scName.replace(' Path', '').replace(' College', '').replace(' Domain', '').replace(' Circle', '').replace(' Archetype', '').replace(' Tradition', '').replace(' Origin', '').replace(' Patron', '').replace(' Oath', ''))) {
            subclassColor = scColor;
            break;
          }
        }

        if (subclassColor) {
          // This is a subclass-specific feature - color it with the subclass color
          // Clean the feature name by removing leading slashes and trimming
          const cleanFeatureName = featureName.replace(/^\/\s*/, '').trim();
          const fullSkillName = `${cleanFeatureName} (${subclassName})`;
          // Try exact match first, then try with different spacing
          let skillInfo = skillData[fullSkillName];
          let matchedSkillName = fullSkillName;
          
          if (!skillInfo) {
            // Try to find with normalized spacing
            const normalizedName = `${cleanFeatureName.trim()} (${subclassName.trim()})`;
            skillInfo = skillData[normalizedName];
            if (skillInfo) {
              matchedSkillName = normalizedName;
            }
          }
          
          // If still not found, try searching all skills for a partial match
          if (!skillInfo) {
            for (const skillName of Object.keys(skillData)) {
              if (skillName.toLowerCase().includes(cleanFeatureName.toLowerCase()) && 
                  skillName.toLowerCase().includes(subclassName.toLowerCase())) {
                skillInfo = skillData[skillName];
                matchedSkillName = skillName;
                break;
              }
            }
          }
          
          elements.push(
            <span
              key={`subclass-feature-${index}`}
              onMouseEnter={() => {
                if (skillInfo) {
                  setHoveredSkill(matchedSkillName);
                }
              }}
              onMouseLeave={() => {
                setHoveredSkill(null);
              }}
              style={{
                color: subclassColor,
                cursor: skillInfo ? 'help' : 'default',
                borderBottom: skillInfo ? `1px dotted ${subclassColor}` : 'none',
                fontWeight: 'bold'
              }}
            >
              {fullFeature}
            </span>
          );
          remainingText = remainingText.slice(fullFeature.length);
          matched = true;
          index++;
          continue;
        }
      }

      // Try to match skills at the current position
      for (const skillName of sortedSkillNames) {
        // Check for exact match OR skill name followed by space, parenthesis, or comma
        const skillNameRegex = new RegExp(`^${skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|\\(|,|$)`);
        
        if (skillNameRegex.test(remainingText)) {
          // Found a match!
          elements.push(
            <span
              key={`skill-${index}`}
              onMouseEnter={(e) => {
                setHoveredSkill(skillName);
              }}
              onMouseLeave={() => {
                setHoveredSkill(null);
              }}
              style={{
                color: 'var(--primary-gold)',
                cursor: 'help',
                borderBottom: '1px dotted var(--primary-gold)',
                position: 'relative'
              }}
            >
              {skillName}
            </span>
          );
          remainingText = remainingText.slice(skillName.length);
          matched = true;
          index++;
          break;
        }
      }

      if (!matched) {
        // No skill matched, add the next character as regular text
        const char = remainingText[0];
        elements.push(<span key={`text-${index}`}>{char}</span>);
        remainingText = remainingText.slice(1);
        index++;
      }
    }

    return elements;
  };

  if (!referenceData || !currentCampaign) {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Creating Character...</h1>
          </div>
          <div className="glass-panel info">
            <p className="text-center">Loading character creation tools...</p>
          </div>
        </div>
      </div>
    );
  }

  if (user?.role !== 'Player') {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Access Denied</h1>
          </div>
          <div className="alert alert-error">
            <p>Only players can create characters.</p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      <div className="dashboard-container">
        <div className="app-header">
          <h1 className="app-title">Create Character</h1>
          <p className="app-subtitle">
            For {currentCampaign.campaign.name} - Step {currentStep} of {totalSteps}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="btn btn-secondary">
              Dismiss
            </button>
          </div>
        )}

        {/* Progress Bar */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
              <div
                key={step}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: step <= currentStep ? 'var(--primary-gold)' : 'rgba(255, 255, 255, 0.2)',
                  color: step <= currentStep ? 'var(--primary-black)' : 'var(--text-secondary)',
                  fontWeight: 'bold'
                }}
              >
                {step}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Class Selection */}
        {currentStep === 1 && (
          <div className="glass-panel primary">
            <h3>⚔️ Choose Your Class</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', minHeight: '500px' }}>
              {/* Left side: All classes */}
              <div>
                <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>All Classes</h4>
                <div style={{ maxHeight: '450px', overflowY: 'auto', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                  {referenceData?.classes.map(charClass => (
                    <div
                      key={charClass.name}
                      style={{
                        padding: '1rem',
                        marginBottom: '0.5rem',
                        backgroundColor: characterData.class === charClass.name && !characterData.usedRandomClass 
                          ? 'rgba(212, 193, 156, 0.2)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        border: characterData.class === charClass.name && !characterData.usedRandomClass 
                          ? '2px solid var(--primary-gold)' 
                          : '1px solid rgba(212, 193, 156, 0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => {
                        if (characterData.class !== charClass.name || characterData.usedRandomClass) {
                          e.currentTarget.style.backgroundColor = 'rgba(212, 193, 156, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (characterData.class !== charClass.name || characterData.usedRandomClass) {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        }
                      }}
                    >
                      <div onClick={() => selectManualClass(charClass.name)} style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.5rem' }}>
                          {charClass.name}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                          Hit Die: d{charClass.hitDie} | Primary: {charClass.primaryAbility.join(', ').toUpperCase()}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Choose any class you want to play
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowClassInfo(charClass.name);
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'rgba(212, 193, 156, 0.2)',
                          border: '1px solid rgba(212, 193, 156, 0.4)',
                          borderRadius: '6px',
                          color: 'var(--text-gold)',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          whiteSpace: 'nowrap',
                          marginLeft: '1rem'
                        }}
                      >
                        ℹ️ Info
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right side: Random selection */}
              <div>
                <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>
                  Random Selection <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>(+4 Points in Point Buy!)</span>
                </h4>
                <div style={{ padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                  <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Take a chance! Pick one of these three randomly selected classes and earn +4 bonus points for your ability scores.
                  </p>
                  
                  <div style={{ 
                    marginBottom: '1rem', 
                    padding: '0.75rem', 
                    backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                    borderRadius: '6px',
                    border: '1px solid rgba(212, 193, 156, 0.2)'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-gold)', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      ℹ️ Your Random Classes
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      These three classes are saved for this character creation session. You'll get new random options when you create your next character.
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {randomClasses.map(className => {
                      const classData = referenceData?.classes.find(c => c.name === className);
                      return (
                        <div
                          key={className}
                          style={{
                            padding: '1rem',
                            backgroundColor: characterData.class === className && characterData.usedRandomClass 
                              ? 'rgba(212, 193, 156, 0.2)' 
                              : 'rgba(255, 255, 255, 0.03)',
                            border: characterData.class === className && characterData.usedRandomClass 
                              ? '2px solid var(--primary-gold)' 
                              : '1px solid rgba(212, 193, 156, 0.1)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onMouseEnter={(e) => {
                            if (characterData.class !== className || !characterData.usedRandomClass) {
                              e.currentTarget.style.backgroundColor = 'rgba(212, 193, 156, 0.1)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (characterData.class !== className || !characterData.usedRandomClass) {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                            }
                          }}
                        >
                          <div onClick={() => selectRandomClass(className)} style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.5rem' }}>
                              {className}
                            </div>
                            {classData && (
                              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                Hit Die: d{classData.hitDie} | Primary: {classData.primaryAbility.join(', ').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowClassInfo(className);
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(212, 193, 156, 0.2)',
                              border: '1px solid rgba(212, 193, 156, 0.4)',
                              borderRadius: '6px',
                              color: 'var(--text-gold)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              whiteSpace: 'nowrap',
                              marginLeft: '1rem'
                            }}
                          >
                            ℹ️ Info
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {characterData.usedRandomClass && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '1rem', 
                    backgroundColor: 'rgba(0, 255, 0, 0.1)', 
                    border: '1px solid rgba(0, 255, 0, 0.3)', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ fontWeight: 'bold', color: '#4ade80', marginBottom: '0.25rem' }}>
                      🎉 Bonus Unlocked!
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      You'll get +4 extra points in the Point Buy system for choosing randomly!
                    </div>
                  </div>
                )}
              </div>
            </div>

            {characterData.class && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(212, 193, 156, 0.1)', borderRadius: '8px' }}>
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>Selected Class: {characterData.class}</h5>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {characterData.usedRandomClass 
                    ? `You chose ${characterData.class} from the random selection and will receive +4 bonus points for abilities!`
                    : `You manually selected ${characterData.class}.`
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Character Name, Race, Background */}
        {currentStep === 2 && (
          <div className="glass-panel primary">
            <h3>🧙‍♂️ Character Details</h3>
            <div style={{ display: 'grid', gap: '2rem' }}>
              <div>
                <label className="form-label">Character Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={characterData.name}
                  onChange={(e) => setCharacterData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter your character's name..."
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                  <label className="form-label">Race</label>
                  <select
                    className="form-input"
                    value={characterData.race}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, race: e.target.value }))}
                    required
                  >
                    <option value="">Select a race...</option>
                    {referenceData?.races.map(race => (
                      <option key={race.name} value={race.name}>{race.name}</option>
                    ))}
                  </select>
                  {characterData.race && (
                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                      <h6>Racial Traits:</h6>
                      {referenceData?.races.find(r => r.name === characterData.race)?.traits.map(trait => (
                        <p key={trait} className="text-muted" style={{ fontSize: '0.9rem', margin: '0.25rem 0' }}>• {trait}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label">Background</label>
                  <select
                    className="form-input"
                    value={characterData.background}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, background: e.target.value }))}
                    required
                  >
                    <option value="">Select a background...</option>
                    {referenceData?.backgrounds.map(background => (
                      <option key={background} value={background}>{background}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                    <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                      Your background represents what your character did before becoming an adventurer. 
                      It provides skill proficiencies, languages, and equipment.
                    </p>
                  </div>
                </div>
              </div>

              {characterData.class && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(212, 193, 156, 0.1)', borderRadius: '8px' }}>
                  <h6 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>Selected Class: {characterData.class}</h6>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {characterData.usedRandomClass && "🎲 Random selection - you'll get +4 bonus points for abilities!"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Point Buy System */}
        {currentStep === 3 && (
          <div className="glass-panel primary">
            <h3>💪 Point Buy System</h3>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-gold)' }}>
                    Points Used: {calculatePointsSpent()} / {getAvailablePoints()}
                  </span>
                  {characterData.usedRandomClass && (
                    <span style={{ marginLeft: '1rem', fontSize: '0.9rem', color: '#4ade80' }}>
                      (+4 bonus from random class!)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Remaining: {getAvailablePoints() - calculatePointsSpent()}
                </div>
              </div>
              <div style={{ 
                width: '100%', 
                height: '8px', 
                backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${(calculatePointsSpent() / getAvailablePoints()) * 100}%`, 
                  height: '100%', 
                  backgroundColor: calculatePointsSpent() > getAvailablePoints() ? '#ef4444' : 'var(--primary-gold)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>

            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              Standard D&D 5e Point Buy rules. All abilities start at 8. Costs: 8-13 = 1 point each, 14 = 7 points total, 15 = 9 points total.
              {characterData.usedRandomClass && " You have 4 bonus points for choosing a random class!"}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              {Object.entries(characterData.abilities).map(([ability, value]) => {
                const cost = getPointCost(value);
                const newCost = getPointCost(value + 1);
                const canIncrease = value < 15 && (calculatePointsSpent() - cost + newCost) <= getAvailablePoints();
                const canDecrease = value > 8;

                return (
                  <div key={ability} className="glass-panel" style={{ textAlign: 'center' }}>
                    <label className="form-label" style={{ marginBottom: '1rem' }}>
                      {ability.toUpperCase()}
                    </label>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <button
                        onClick={() => handleAbilityChange(ability as keyof CharacterData['abilities'], value - 1)}
                        disabled={!canDecrease}
                        className="btn btn-secondary"
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          padding: 0,
                          opacity: canDecrease ? 1 : 0.3
                        }}
                      >
                        −
                      </button>
                      
                      <div style={{ minWidth: '60px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-gold)' }}>
                          {value}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleAbilityChange(ability as keyof CharacterData['abilities'], value + 1)}
                        disabled={!canIncrease}
                        className="btn btn-secondary"
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          padding: 0,
                          opacity: canIncrease ? 1 : 0.3
                        }}
                      >
                        +
                      </button>
                    </div>
                    
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Cost: {cost} point{cost !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {calculatePointsSpent() > getAvailablePoints() && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '1rem', 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.3)', 
                borderRadius: '8px' 
              }}>
                <div style={{ fontWeight: 'bold', color: '#ef4444' }}>
                  ⚠️ Too many points spent!
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  You've spent {calculatePointsSpent() - getAvailablePoints()} too many points. Please reduce some ability scores.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Skills and Proficiencies */}
        {currentStep === 4 && (
          <div className="glass-panel primary">
            <h3>🎯 Skills and Proficiencies</h3>
            <div style={{ marginBottom: '1.5rem' }}>
              <h5>Skills (Select up to 4)</h5>
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                Choose skills that complement your class and background. Some skills may be restricted based on your class choice.
              </p>
              <div style={{ 
                maxHeight: '400px', 
                overflowY: 'auto', 
                padding: '1rem', 
                backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.5rem'
              }}>
                {referenceData?.skills.map(skill => (
                  <label key={skill} style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    padding: '0.5rem',
                    backgroundColor: characterData.skills.includes(skill) ? 'rgba(212, 193, 156, 0.1)' : 'transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}>
                    <input
                      type="checkbox"
                      checked={characterData.skills.includes(skill)}
                      onChange={() => handleSkillToggle(skill)}
                      disabled={!characterData.skills.includes(skill) && characterData.skills.length >= 4}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{skill}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Selected: {characterData.skills.length}/4 skills
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Backstory, Personality, etc. */}
        {currentStep === 5 && (
          <div className="glass-panel primary">
            <h3>📖 Character Personality & Backstory</h3>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div>
                <label className="form-label">Backstory</label>
                <textarea
                  className="form-input"
                  value={characterData.backstory}
                  onChange={(e) => setCharacterData(prev => ({ ...prev, backstory: e.target.value }))}
                  placeholder="Describe your character's history, origins, and how they became an adventurer..."
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Personality Traits</label>
                  <textarea
                    className="form-input"
                    value={characterData.personality_traits}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, personality_traits: e.target.value }))}
                    placeholder="How does your character act? What are their quirks?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Ideals</label>
                  <textarea
                    className="form-input"
                    value={characterData.ideals}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, ideals: e.target.value }))}
                    placeholder="What drives your character? What do they believe in?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Bonds</label>
                  <textarea
                    className="form-input"
                    value={characterData.bonds}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, bonds: e.target.value }))}
                    placeholder="What connects your character to the world? People, places, things?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Flaws</label>
                  <textarea
                    className="form-input"
                    value={characterData.flaws}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, flaws: e.target.value }))}
                    placeholder="What are your character's weaknesses or vices?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Character Summary */}
        {currentStep === 6 && (
          <div className="glass-panel primary">
            <h3>📋 Character Summary</h3>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              Review all your character's details before creating them. Make sure everything looks correct! 
              <span style={{ fontSize: '0.85rem', display: 'block', marginTop: '0.5rem', fontStyle: 'italic' }}>
                ✨ Note: Your backstory and personality details will preserve line breaks exactly as you typed them.
              </span>
            </p>
            
            <div style={{ display: 'grid', gap: '2rem' }}>
              {/* Basic Info */}
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Basic Information</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Name:</strong> {characterData.name || 'Not set'}
                  </div>
                  <div>
                    <strong>Race:</strong> {characterData.race || 'Not set'}
                  </div>
                  <div>
                    <strong>Class:</strong> {characterData.class || 'Not set'}
                    {characterData.usedRandomClass && <span style={{ color: '#4ade80', marginLeft: '0.5rem' }}>🎲</span>}
                  </div>
                  <div>
                    <strong>Background:</strong> {characterData.background || 'Not set'}
                  </div>
                </div>
              </div>

              {/* Ability Scores */}
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>
                  Ability Scores 
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '1rem' }}>
                    ({calculatePointsSpent()}/{getAvailablePoints()} points used)
                  </span>
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                  {Object.entries(characterData.abilities).map(([ability, value]) => (
                    <div key={ability} style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{ability}</div>
                      <div style={{ fontSize: '1.2rem', color: 'var(--text-gold)' }}>{value}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Combat Stats */}
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Combat Statistics</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Hit Points:</strong> {calculateHitPoints()}
                  </div>
                  <div>
                    <strong>Armor Class:</strong> {calculateArmorClass()}
                  </div>
                  <div>
                    <strong>Level:</strong> 1
                  </div>
                </div>
              </div>

              {/* Skills */}
              {characterData.skills.length > 0 && (
                <div className="glass-panel">
                  <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Skills ({characterData.skills.length})</h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {characterData.skills.map(skill => (
                      <span key={skill} style={{ 
                        padding: '0.25rem 0.5rem', 
                        backgroundColor: 'rgba(212, 193, 156, 0.2)', 
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Personality */}
              {(characterData.backstory || characterData.personality_traits || characterData.ideals || characterData.bonds || characterData.flaws) && (
                <div className="glass-panel">
                  <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Personality & Background</h5>
                  <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {characterData.backstory && (
                      <div>
                        <strong>Backstory:</strong>
                        <div style={{ 
                          marginTop: '0.5rem', 
                          padding: '1rem', 
                          backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.6'
                        }}>
                          {characterData.backstory}
                        </div>
                      </div>
                    )}
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      {characterData.personality_traits && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Personality Traits:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.personality_traits}
                          </div>
                        </div>
                      )}
                      {characterData.ideals && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Ideals:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.ideals}
                          </div>
                        </div>
                      )}
                      {characterData.bonds && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Bonds:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.bonds}
                          </div>
                        </div>
                      )}
                      {characterData.flaws && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Flaws:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(220, 53, 69, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(220, 53, 69, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.flaws}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handlePrevious}
            className="btn btn-secondary"
            disabled={currentStep === 1}
            style={{ 
              whiteSpace: 'nowrap',
              minWidth: '140px'
            }}
          >
            ← Previous
          </button>

          <span className="text-muted">
            Step {currentStep} of {totalSteps}
          </span>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              className="btn btn-primary"
              disabled={!canProceed()}
              style={{ 
                whiteSpace: 'nowrap',
                minWidth: '140px'
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="btn btn-primary"
              disabled={!canProceed() || isLoading}
              style={{ 
                whiteSpace: 'nowrap',
                minWidth: '140px'
              }}
            >
              {isLoading ? 'Creating...' : 'Create Character'}
            </button>
          )}
        </div>

        <div className="text-center mt-lg">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-secondary"
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              fontSize: '0.9rem'
            }}
          >
            ← Cancel & Return to Campaign Select
          </button>
        </div>
      </div>

      {/* Class Info Modal */}
      {showClassInfo && classInfo[showClassInfo] && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowClassInfo(null)}
        >
          <div 
            className="glass-panel"
            style={{
              maxWidth: '700px',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '2rem',
              margin: '2rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="text-gold" style={{ margin: 0 }}>{showClassInfo}</h2>
              <button
                onClick={() => setShowClassInfo(null)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem' }}
              >
                ✕
              </button>
            </div>

            <div className="text-secondary" style={{ marginBottom: '2rem', lineHeight: '1.8' }}>
              <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Description</h4>
              <p>{classInfo[showClassInfo].description}</p>
            </div>

            <div className="text-secondary" style={{ marginBottom: '2rem' }}>
              <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Key Features</h4>
              <ul style={{ paddingLeft: '1.5rem' }}>
                {classInfo[showClassInfo].features.map((feature, index) => (
                  <li key={index} style={{ marginBottom: '0.5rem' }}>{feature}</li>
                ))}
              </ul>
            </div>

            <div className="text-secondary" style={{ marginBottom: '2rem' }}>
              <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Subclasses</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {classInfo[showClassInfo].subclasses.map((subclass, index) => (
                  <div 
                    key={index}
                    style={{
                      padding: '1rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      border: `2px solid ${subclass.color}`,
                      position: 'relative'
                    }}
                  >
                    <div style={{ 
                      color: subclass.color, 
                      fontWeight: 'bold', 
                      fontSize: '1.1rem',
                      marginBottom: '0.5rem'
                    }}>
                      {subclass.name}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      {subclass.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-secondary">
              <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Level Progression (1-20)</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', fontStyle: 'italic' }}>
                Subclass choice features and their progression are shown in gradient colors. Hover over skill names to see details.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {classInfo[showClassInfo].levelProgression.map((level) => (
                  <div 
                    key={level.level}
                    style={{
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '6px',
                      border: '1px solid rgba(212, 193, 156, 0.2)',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
                      <span style={{ color: 'var(--text-gold)', fontWeight: 'bold', minWidth: '80px' }}>
                        Level {level.level}:
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {renderTextWithSkillTooltips(level.features)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill Tooltip */}
      {hoveredSkill && skillData[hoveredSkill] && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            pointerEvents: 'none'
          }}
        >
          <div
            className="glass-panel"
            style={{
              padding: '1rem',
              maxWidth: '350px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              border: '2px solid var(--primary-gold)'
            }}
          >
            <h4 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem', fontSize: '1rem' }}>
              {skillData[hoveredSkill].name}
            </h4>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              {skillData[hoveredSkill].description}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
              {skillData[hoveredSkill].damage_dice && (
                <div>
                  <strong style={{ color: 'var(--text-gold)' }}>Damage:</strong> {skillData[hoveredSkill].damage_dice}
                </div>
              )}
              {skillData[hoveredSkill].damage_type && (
                <div>
                  <strong style={{ color: 'var(--text-gold)' }}>Type:</strong> {skillData[hoveredSkill].damage_type}
                </div>
              )}
              <div>
                <strong style={{ color: 'var(--text-gold)' }}>Range:</strong> {skillData[hoveredSkill].range_size}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong style={{ color: 'var(--text-gold)' }}>Usage:</strong> {skillData[hoveredSkill].usage_frequency}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong style={{ color: 'var(--text-gold)' }}>Level:</strong> {skillData[hoveredSkill].level_requirement}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterCreation;