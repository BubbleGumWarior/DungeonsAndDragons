/**
 * Tier 10 Wonders (see KINGDOM_TIER_ROADMAP.md).
 *
 * Wonders have NO automated effect. The game only records who holds which one; the DM decides
 * what it does and writes that in the notes. Rules enforced here and in routes/wonders.js:
 *   1. Each Wonder exists at most once per campaign (built or under construction).
 *   2. A fief (or NPC holder) can hold at most one Wonder.
 *   3. The DM can place a Wonder directly, including on an NPC kingdom.
 *   4. A held Wonder must be destroyed (by the DM) before anyone else can build it.
 */

const WONDER_MIN_TIER = 10;

const WONDER_CATALOG = [
  { key: 'pantheon_of_the_gods', name: 'Pantheon of the Gods', flavor: 'A great shrine to every faith in the realm.' },
  { key: 'grand_academy_of_sciences', name: 'Grand Academy of Sciences', flavor: 'A city-sized center of learning and invention.' },
  { key: 'titan_forge', name: 'Titan Forge', flavor: 'A forge on a scale no mortal smith should need.' },
  { key: 'colossus_of_the_realm', name: 'Colossus of the Realm', flavor: 'A monumental statue and a symbol of rule.' },
  { key: 'eternal_library', name: 'Eternal Library', flavor: 'A vault of all written knowledge.' },
  { key: 'spire_of_the_archmage', name: 'Spire of the Archmage', flavor: 'A tower anchored in the ley lines.' },
  { key: 'hanging_gardens', name: 'Hanging Gardens', flavor: 'A terraced paradise of impossible harvests.' },
  { key: 'imperial_mausoleum', name: 'Imperial Mausoleum', flavor: 'A tomb-city for kings and heroes.' },
];

// Same scale as the tier 10 upgrade, so the end of the tree is a second large investment.
const WONDER_BUILD = {
  days: 180,
  cost: {
    wood: 5000000, stone: 5000000, minerals: 5000000, gold: 2500000,
    planks: 2500000, dressed_stone: 2500000, steel: 2500000, mana: 100000,
  },
};

const ACTIVE_STATUSES = ['under_construction', 'built'];

const getWonderDef = (key) => WONDER_CATALOG.find((w) => w.key === key) || null;

/** Finish construction projects whose time is up. Called from Campaign.advanceDays. */
const resolveWondersForCampaign = async (client, campaignId, newDay) => {
  const exists = await client.query(`SELECT to_regclass('public.wonders') AS t`);
  if (!exists.rows[0]?.t) return [];
  const done = await client.query(
    `UPDATE wonders
     SET status = 'built', built_day = $2, updated_at = NOW()
     WHERE campaign_id = $1 AND status = 'under_construction' AND start_day + days_total <= $2
     RETURNING id, wonder_key, fief_id`,
    [campaignId, newDay]
  );
  return done.rows.map((r) => ({ id: Number(r.id), wonderKey: r.wonder_key, fiefId: r.fief_id == null ? null : Number(r.fief_id) }));
};

module.exports = {
  WONDER_MIN_TIER,
  WONDER_CATALOG,
  WONDER_BUILD,
  ACTIVE_STATUSES,
  getWonderDef,
  resolveWondersForCampaign,
};
