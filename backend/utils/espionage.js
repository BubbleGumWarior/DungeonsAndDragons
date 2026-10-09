/**
 * Tier 7 espionage helpers (see KINGDOM_TIER_ROADMAP.md).
 *
 * Players only ever see a progress bar. The DM's days and success rate, plus the hidden
 * roll (`outcome`, `fail_fraction`), never leave the server for non-DM users.
 */

// Every rank of the spy line may be sent. Add unit types here to widen who counts as a spy.
const SPY_UNIT_TYPES = ['Spy', 'Master Spy'];
const ESPIONAGE_MIN_TIER = 7;
const RECALL_DAYS = 30;

const isSpyUnitType = (unitType) => SPY_UNIT_TYPES.includes(String(unitType || ''));

/** Spies a mission carries, as a clean { unitType: count } map. */
const normalizeSpies = (raw) => {
  const out = {};
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  for (const [unitType, value] of Object.entries(source)) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    if (count > 0 && isSpyUnitType(unitType)) out[unitType] = count;
  }
  return out;
};

const totalSpies = (spies) => Object.values(spies || {}).reduce((sum, n) => sum + Number(n || 0), 0);

/** Roll a mission's hidden result. The bar stops somewhere in the middle if it fails. */
const rollOutcome = (successRatePct, random = Math.random) => {
  const rate = Math.max(0, Math.min(100, Number(successRatePct) || 0));
  const success = random() * 100 < rate;
  return {
    outcome: success ? 'success' : 'failure',
    failFraction: success ? null : Math.round((0.2 + random() * 0.7) * 1000) / 1000,
  };
};

/** Progress 0..1 for a mission at `currentDay`; failed missions freeze where they were caught. */
const getProgress = (mission, currentDay) => {
  const status = mission.status;
  if (status === 'stationed' || status === 'returning' || status === 'returned') return 1;
  if (status === 'failed') return Number(mission.fail_fraction) || 0;
  if (status !== 'in_progress') return 0;
  const total = Math.max(1, Number(mission.days_total) || 1);
  const elapsed = Math.max(0, Number(currentDay) - Number(mission.start_day || currentDay));
  // Never show a full bar while still in progress: only the tick can move it to "stationed".
  return Math.min(0.99, elapsed / total);
};

/** What a player is allowed to see. */
const toPlayerView = (mission, currentDay) => {
  const view = {
    id: Number(mission.id),
    fief_id: Number(mission.fief_id),
    target: mission.target,
    spies: normalizeSpies(mission.spies),
    status: mission.status,
    progress: getProgress(mission, currentDay),
  };
  if (mission.status === 'returning') {
    const elapsed = Math.max(0, Number(currentDay) - Number(mission.recall_day || currentDay));
    view.return_days_remaining = Math.max(0, RECALL_DAYS - elapsed);
  }
  return view;
};

/** Everything, for the DM. */
const toDmView = (mission, currentDay) => ({
  ...toPlayerView(mission, currentDay),
  campaign_id: Number(mission.campaign_id),
  kingdom_id: Number(mission.kingdom_id),
  requested_by: mission.requested_by == null ? null : Number(mission.requested_by),
  days_total: mission.days_total == null ? null : Number(mission.days_total),
  success_rate: mission.success_rate == null ? null : Number(mission.success_rate),
  outcome: mission.outcome,
  start_day: mission.start_day == null ? null : Number(mission.start_day),
  created_at: mission.created_at,
});

/** Put spies back into a fief's reserve. Caller owns the transaction. */
const returnSpiesToReserve = async (client, fiefId, spies) => {
  const lock = await client.query(`SELECT unit_reserves FROM fiefs WHERE id = $1 FOR UPDATE`, [fiefId]);
  if (!lock.rows.length) return;
  const reserves = { ...(lock.rows[0].unit_reserves || {}) };
  for (const [unitType, count] of Object.entries(normalizeSpies(spies))) {
    reserves[unitType] = Math.max(0, Math.floor(Number(reserves[unitType]) || 0)) + count;
  }
  await client.query(`UPDATE fiefs SET unit_reserves = $2::jsonb WHERE id = $1`, [fiefId, JSON.stringify(reserves)]);
};

/**
 * Advance missions to `newDay`. Called from Campaign.advanceDays inside its transaction, after
 * the fief rows have been persisted so the spy return isn't overwritten.
 * Returns the missions that changed state so the caller can notify clients.
 */
const resolveEspionageForCampaign = async (client, campaignId, newDay) => {
  const exists = await client.query(`SELECT to_regclass('public.espionage_missions') AS t`);
  if (!exists.rows[0]?.t) return [];

  const changes = [];
  const result = await client.query(
    `SELECT * FROM espionage_missions
     WHERE campaign_id = $1 AND status IN ('in_progress', 'returning')
     FOR UPDATE`,
    [campaignId]
  );

  for (const mission of result.rows) {
    if (mission.status === 'in_progress') {
      const total = Math.max(1, Number(mission.days_total) || 1);
      const elapsed = Number(newDay) - Number(mission.start_day);
      if (mission.outcome === 'failure') {
        const caughtAt = Math.max(1, Math.ceil(total * (Number(mission.fail_fraction) || 0.5)));
        if (elapsed >= caughtAt) {
          await client.query(
            `UPDATE espionage_missions SET status = 'failed', resolved_day = $2, updated_at = NOW() WHERE id = $1`,
            [mission.id, newDay]
          );
          changes.push({ id: Number(mission.id), fiefId: Number(mission.fief_id), status: 'failed' });
        }
      } else if (elapsed >= total) {
        await client.query(
          `UPDATE espionage_missions SET status = 'stationed', resolved_day = $2, updated_at = NOW() WHERE id = $1`,
          [mission.id, newDay]
        );
        changes.push({ id: Number(mission.id), fiefId: Number(mission.fief_id), status: 'stationed' });
      }
    } else if (mission.status === 'returning') {
      if (Number(newDay) - Number(mission.recall_day) >= RECALL_DAYS) {
        await returnSpiesToReserve(client, Number(mission.fief_id), mission.spies);
        await client.query(
          `UPDATE espionage_missions SET status = 'returned', resolved_day = $2, updated_at = NOW() WHERE id = $1`,
          [mission.id, newDay]
        );
        changes.push({ id: Number(mission.id), fiefId: Number(mission.fief_id), status: 'returned' });
      }
    }
  }
  return changes;
};

module.exports = {
  SPY_UNIT_TYPES,
  ESPIONAGE_MIN_TIER,
  RECALL_DAYS,
  isSpyUnitType,
  normalizeSpies,
  totalSpies,
  rollOutcome,
  getProgress,
  toPlayerView,
  toDmView,
  returnSpiesToReserve,
  resolveEspionageForCampaign,
};
