const { pool } = require('../models/database');

const FEAT_SEEDS = [
  // PHB (2014)
  { name: 'Actor', description: '[PHB] You excel at mimicry, roleplay, and social impersonation.' },
  { name: 'Alert', description: '[PHB] You stay vigilant and react faster to danger and ambushes.' },
  { name: 'Athlete', description: '[PHB] You are physically trained for climbing, jumping, and bursts of movement.' },
  { name: 'Charger', description: '[PHB] You can turn a dash into a forceful melee strike or shove.' },
  { name: 'Crossbow Expert', description: '[PHB] You ignore common crossbow limitations and fight better in close range.' },
  { name: 'Defensive Duelist', description: '[PHB] You can parry incoming melee attacks when wielding a finesse weapon.' },
  { name: 'Dual Wielder', description: '[PHB] You are highly effective with two-weapon combat and wider weapon options.' },
  { name: 'Dungeon Delver', description: '[PHB] You are skilled at spotting, resisting, and surviving dungeon hazards.' },
  { name: 'Durable', description: '[PHB] You are unusually hardy and recover more reliably during short rests.' },
  { name: 'Elemental Adept', description: '[PHB] Your chosen element pierces resistance and deals steadier spell damage.' },
  { name: 'Grappler', description: '[PHB] You specialize in grappling foes and controlling them at close range.' },
  { name: 'Great Weapon Master', description: '[PHB] You trade accuracy for heavy damage and capitalize on critical strikes.' },
  { name: 'Healer', description: '[PHB] You can provide efficient battlefield treatment with healer kits.' },
  { name: 'Heavy Armor Master', description: '[PHB] You gain heavy armor training and reduce nonmagical physical damage.' },
  { name: 'Inspiring Leader', description: '[PHB] You can rally allies with speeches that grant temporary resilience.' },
  { name: 'Keen Mind', description: '[PHB] You possess strong memory, directional sense, and temporal awareness.' },
  { name: 'Lightly Armored', description: '[PHB] You gain light armor training and improved agility for defense.' },
  { name: 'Linguist', description: '[PHB] You master extra languages and coded communication techniques.' },
  { name: 'Lucky', description: '[PHB] Fortune bends in your favor, letting you reroll pivotal moments.' },
  { name: 'Mage Slayer', description: '[PHB] You pressure nearby spellcasters and punish their spellcasting openings.' },
  { name: 'Magic Initiate', description: '[PHB] You learn basic magical tricks and a limited spell from a class list.' },
  { name: 'Martial Adept', description: '[PHB] You learn combat maneuvers and tactical superiority on the battlefield.' },
  { name: 'Medium Armor Master', description: '[PHB] You move more effectively in medium armor while improving AC.' },
  { name: 'Mobile', description: '[PHB] You are fast, evasive, and harder to pin down in melee.' },
  { name: 'Moderately Armored', description: '[PHB] You gain medium armor and shield proficiency for sturdier defense.' },
  { name: 'Mounted Combatant', description: '[PHB] You dominate mounted fights and better protect your mount.' },
  { name: 'Observant', description: '[PHB] Your passive awareness and lip-reading insight are exceptionally sharp.' },
  { name: 'Polearm Master', description: '[PHB] You control space with polearms and gain extra opportunistic strikes.' },
  { name: 'Resilient', description: '[PHB] You toughen one ability score and gain proficiency in its saves.' },
  { name: 'Ritual Caster', description: '[PHB] You gain a ritual spellbook and can cast selected rituals.' },
  { name: 'Savage Attacker', description: '[PHB] You can reroll weapon damage once each turn for stronger hits.' },
  { name: 'Sentinel', description: '[PHB] You lock down enemies by stopping movement and punishing disengagement.' },
  { name: 'Sharpshooter', description: '[PHB] You excel at long-range precision and high-risk, high-reward shots.' },
  { name: 'Shield Master', description: '[PHB] You use shields aggressively for defense, shoves, and dexterity protection.' },
  { name: 'Skilled', description: '[PHB] You gain broad training in additional skills or tools.' },
  { name: 'Skulker', description: '[PHB] You thrive in dim light, concealment, and stealth-based attacks.' },
  { name: 'Spell Sniper', description: '[PHB] Your attack spells reach farther and ignore partial cover better.' },
  { name: 'Tavern Brawler', description: '[PHB] You weaponize improvised fighting and can grapple after striking.' },
  { name: 'Tough', description: '[PHB] You gain a substantial increase to your overall hit point pool.' },
  { name: 'War Caster', description: '[PHB] You maintain concentration better and cast amid close combat pressure.' },
  { name: 'Weapon Master', description: '[PHB] You expand your weapon proficiency options and martial versatility.' },

  // Xanathar and other official expansions
  { name: 'Bountiful Luck', description: '[XGE] You can help nearby allies recover from critical misfortune.' },
  { name: 'Dragon Fear', description: '[XGE] You unleash a draconic aura that frightens nearby creatures.' },
  { name: 'Dragon Hide', description: '[XGE] Your draconic heritage improves toughness, claws, and natural armor.' },
  { name: 'Drow High Magic', description: '[XGE] You unlock potent drow-themed innate spellcasting options.' },
  { name: 'Dwarven Fortitude', description: '[XGE] Your dwarven resilience lets you recover while fighting defensively.' },
  { name: 'Elven Accuracy', description: '[XGE] Your precision with advantage is exceptionally refined and reliable.' },
  { name: 'Fade Away', description: '[XGE] You can briefly vanish after being injured, improving survivability.' },
  { name: 'Fey Teleportation', description: '[XGE] You gain fey-flavored magic and short-range teleport utility.' },
  { name: 'Flames of Phlegethos', description: '[XGE] Your infernal fire magic intensifies and can retaliate nearby foes.' },
  { name: 'Infernal Constitution', description: '[XGE] Infernal blood grants improved endurance and elemental resistance.' },
  { name: 'Orcish Fury', description: '[XGE] You unleash explosive orcish ferocity when striking in combat.' },
  { name: 'Prodigy', description: '[XGE] You develop broad expertise with an extra skill, tool, and language.' },
  { name: 'Second Chance', description: '[XGE] You can force an attacker to reroll a successful hit against you.' },
  { name: 'Squat Nimbleness', description: '[XGE] You gain compact agility, speed, and grappling escape prowess.' },
  { name: 'Wood Elf Magic', description: '[XGE] You gain woodland magic aligned with wood elf traditions.' },
  { name: 'Aberrant Dragonmark', description: '[Eberron] You carry unstable dragonmark magic with risky arcane potential.' },
  { name: 'Revenant Blade', description: '[Eberron] You master the double-bladed scimitar with agile offense.' },
  { name: 'Gift of the Chromatic Dragon', description: '[Fizban] You channel chromatic draconic power for protection and offense.' },
  { name: 'Gift of the Gem Dragon', description: '[Fizban] You manifest gem dragon psionics and kinetic retaliation.' },
  { name: 'Gift of the Metallic Dragon', description: '[Fizban] You gain metallic draconic protection and restorative support magic.' },
  { name: 'Divinely Favored', description: '[Dragonlance] You gain a deity-blessed spell and thematic magical aid.' },
  { name: 'Initiate of High Sorcery', description: '[Dragonlance] You begin formal arcane training in the Orders of High Sorcery.' },
  { name: 'Adept of the Black Robes', description: '[Dragonlance] You advance black robe magic with darker tactical options.' },
  { name: 'Adept of the Red Robes', description: '[Dragonlance] You advance red robe magic with adaptive spellcasting flexibility.' },
  { name: 'Adept of the White Robes', description: '[Dragonlance] You advance white robe magic with protective arcane focus.' },
  { name: 'Squire of Solamnia', description: '[Dragonlance] You train in Solamnic techniques and disciplined martial forms.' },
  { name: 'Knight of the Crown', description: '[Dragonlance] You uphold command discipline and battlefield leadership tactics.' },
  { name: 'Knight of the Sword', description: '[Dragonlance] You embody valorous offense with oathbound knightly resolve.' },
  { name: 'Knight of the Rose', description: '[Dragonlance] You exemplify elite Solamnic mastery and protective excellence.' },
  { name: 'Strike of the Giants', description: '[Bigby] You infuse attacks with giant-themed power and elemental force.' },
  { name: 'Ember of the Fire Giant', description: '[Bigby] Fire giant might grants burning force and fiery retaliation options.' },
  { name: 'Fury of the Frost Giant', description: '[Bigby] Frost giant wrath empowers chilling pressure and brutal follow-through.' },
  { name: 'Guile of the Cloud Giant', description: '[Bigby] Cloud giant guile grants deceptive mobility and tactical repositioning.' },
  { name: 'Keenness of the Stone Giant', description: '[Bigby] Stone giant perception sharpens awareness and grounded combat control.' },
  { name: 'Soul of the Storm Giant', description: '[Bigby] Storm giant essence grants tempestuous resilience and lightning prowess.' },
  { name: 'Vigor of the Hill Giant', description: '[Bigby] Hill giant vitality bolsters endurance and relentless physical pressure.' },
  { name: 'Strixhaven Initiate', description: '[Strixhaven] You gain a college-themed magical curriculum and cantrips.' },
  { name: 'Strixhaven Mascot', description: '[Strixhaven] You bond with a magical mascot companion for utility support.' },
  { name: 'Scion of the Outer Planes', description: '[Planescape] Planar heritage grants extraplanar influence and themed utility.' },

  // Tasha's Cauldron of Everything
  { name: 'Artificer Initiate', description: '[TCE] You learn basic artificer magic and tool-oriented spellcraft techniques.' },
  { name: 'Chef', description: '[TCE] You improve recovery and morale through practical culinary mastery.' },
  { name: 'Crusher', description: '[TCE] Bludgeoning attacks reposition foes and amplify critical battlefield pressure.' },
  { name: 'Eldritch Adept', description: '[TCE] You learn an eldritch invocation style from warlock traditions.' },
  { name: 'Fey Touched', description: '[TCE] Fey influence grants teleport magic and an additional enchantment/divination spell.' },
  { name: 'Fighting Initiate', description: '[TCE] You adopt a formal fighting style to refine martial performance.' },
  { name: 'Gunner', description: '[TCE] You master firearms handling, close-range shooting, and improved aim.' },
  { name: 'Metamagic Adept', description: '[TCE] You gain sorcerous metamagic techniques and limited sorcery points.' },
  { name: 'Piercer', description: '[TCE] Piercing attacks become deadlier through rerolls and stronger criticals.' },
  { name: 'Poisoner', description: '[TCE] You craft potent toxins quickly and apply poison efficiently in combat.' },
  { name: 'Shadow Touched', description: '[TCE] Shadow influence grants invisibility magic and an extra illusion/necromancy spell.' },
  { name: 'Skill Expert', description: '[TCE] You broaden skills and deepen mastery with chosen expertise.' },
  { name: 'Slasher', description: '[TCE] Slashing attacks hinder enemy mobility and increase critical pressure.' },
  { name: 'Telekinetic', description: '[TCE] You manifest subtle telekinetic force and gain a psionic shove option.' },
  { name: 'Telepathic', description: '[TCE] You gain mental communication and limited mind-affecting magic.' },

  // Unearthed Arcana / Playtest
  { name: 'Arcanist', description: '[UA] Playtest skill feat focused on arcane lore and spellcraft utility.' },
  { name: 'Brawny', description: '[UA] Playtest skill feat centered on strength, carrying, and athletic dominance.' },
  { name: 'Diplomat', description: '[UA] Playtest skill feat for social influence and negotiation leverage.' },
  { name: 'Empath', description: '[UA] Playtest skill feat for emotional insight and interpersonal reading.' },
  { name: 'Historian', description: '[UA] Playtest skill feat for historical mastery and tactical recollection.' },
  { name: 'Investigator', description: '[UA] Playtest skill feat focused on clues, logic, and deduction.' },
  { name: 'Medic', description: '[UA] Playtest skill feat improving emergency treatment and stabilization.' },
  { name: 'Menacing', description: '[UA] Playtest skill feat emphasizing intimidation and fear tactics.' },
  { name: 'Naturalist', description: '[UA] Playtest skill feat for survival knowledge and environmental adaptation.' },
  { name: 'Perceptive', description: '[UA] Playtest skill feat for sharper senses and situational awareness.' },
  { name: 'Stealthy', description: '[UA] Playtest skill feat for superior covert movement and concealment.' },
  { name: 'Survivalist', description: '[UA] Playtest skill feat for wilderness endurance and fieldcraft.' },
  { name: 'Theologian', description: '[UA] Playtest skill feat for divine scholarship and religious insight.' },
  { name: 'Blade Mastery', description: '[UA] Playtest combat feat for refined swordplay control and accuracy.' },
  { name: 'Flail Mastery', description: '[UA] Playtest combat feat that improves flail pressure and defense bypass.' },
  { name: 'Spear Mastery', description: '[UA] Playtest combat feat for extended spear control and flexibility.' },
  { name: 'Fell Handed', description: '[UA] Playtest combat feat for heavy axe and hammer disruption tactics.' },
  { name: 'Gourmand', description: '[UA] Playtest utility feat focused on cooking-based recovery benefits.' },
  { name: 'Master of Disguise', description: '[UA] Playtest infiltration feat for advanced disguise and persona crafting.' },
  { name: 'Barbed Hide', description: '[UA] Playtest tiefling feat granting tougher skin and retaliatory spikes.' },
  { name: 'Grudge-Bearer', description: '[UA] Playtest dwarven feat for focused vengeance against chosen enemies.' },
  { name: 'Human Determination', description: '[UA] Playtest human feat reflecting grit and clutch resilience.' },
  { name: 'Orc Superstition', description: '[UA] Playtest orc feat with anti-magic instincts and protective resolve.' },
  { name: 'Wonder Maker', description: '[UA] Playtest gnome feat for inventive utility and experimental gadgets.' }
];

async function addCampaignFeatsSystem() {
  const client = await pool.connect();

  try {
    const normalizedNames = new Set();
    for (const feat of FEAT_SEEDS) {
      const name = String(feat.name || '').trim();
      if (!name) {
        throw new Error('FEAT_SEEDS contains an empty feat name');
      }
      const key = name.toLowerCase();
      if (normalizedNames.has(key)) {
        throw new Error(`FEAT_SEEDS contains a duplicate feat name: ${name}`);
      }
      normalizedNames.add(key);
    }

    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS feat_catalog (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        is_custom BOOLEAN NOT NULL DEFAULT FALSE,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_feat_catalog_campaign_lower_name
      ON feat_catalog (campaign_id, LOWER(name))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_feat_catalog_campaign_id
      ON feat_catalog (campaign_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_feat_grants (
        character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
        granted_count INTEGER NOT NULL DEFAULT 0 CHECK (granted_count >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_feat_grants_character_id
      ON campaign_feat_grants (character_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS character_feats (
        id SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        feat_id INTEGER NOT NULL REFERENCES feat_catalog(id) ON DELETE CASCADE,
        picked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (character_id, feat_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_character_feats_character_id
      ON character_feats (character_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_character_feats_feat_id
      ON character_feats (feat_id)
    `);

    await client.query(
      `
      WITH seed AS (
        SELECT name, description
        FROM jsonb_to_recordset($1::jsonb) AS s(name TEXT, description TEXT)
      )
      INSERT INTO feat_catalog (campaign_id, name, description, is_custom)
      SELECT c.id, TRIM(seed.name), TRIM(seed.description), FALSE
      FROM campaigns c
      CROSS JOIN seed
      WHERE NOT EXISTS (
        SELECT 1
        FROM feat_catalog fc
        WHERE fc.campaign_id = c.id
          AND LOWER(fc.name) = LOWER(TRIM(seed.name))
      )
      `,
      [JSON.stringify(FEAT_SEEDS)]
    );

    await client.query('COMMIT');
    console.log('✅ add_campaign_feats_system: feat tables and default catalog ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_campaign_feats_system migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCampaignFeatsSystem;

if (require.main === module) {
  addCampaignFeatsSystem()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
