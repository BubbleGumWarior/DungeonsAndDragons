const express = require('express');
const {
  ESPIONAGE_MIN_TIER,
  RECALL_DAYS,
  normalizeSpies,
  totalSpies,
  rollOutcome,
  toPlayerView,
  toDmView,
  returnSpiesToReserve,
} = require('../utils/espionage');

/**
 * Tier 7 espionage routes. Built as a factory so it can reuse the helpers that live in
 * routes/kingdoms.js without a circular require.
 */
module.exports = ({ pool, authenticateToken, getFiefContext, canManageFief, requireDM }) => {
  const router = express.Router();

  const getCurrentDay = async (campaignId) => {
    const r = await pool.query(`SELECT COALESCE(current_day, 1) AS d FROM campaigns WHERE id = $1`, [campaignId]);
    return Math.max(1, Math.floor(Number(r.rows[0]?.d || 1)));
  };

  const notify = (req, campaignId, fiefId, extra = {}) => {
    if (!req.io) return;
    req.io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId, fiefId });
    req.io.to(`campaign_${campaignId}`).emit('espionageChanged', { campaignId, fiefId, ...extra });
  };

  const tableReady = async () => {
    const r = await pool.query(`SELECT to_regclass('public.espionage_missions') AS t`);
    return Boolean(r.rows[0]?.t);
  };

  const isDm = (user) => user?.role === 'Dungeon Master';

  // Player (or DM) lists a fief's missions. Players get progress only.
  router.get('/fiefs/:id/espionage', authenticateToken, async (req, res) => {
    try {
      const fiefId = Number(req.params.id);
      if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });
      const fief = await getFiefContext(fiefId);
      if (!fief) return res.status(404).json({ error: 'Fief not found' });
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (!(await tableReady())) return res.json({ missions: [] });

      const currentDay = await getCurrentDay(fief.campaign_id);
      const rows = await pool.query(
        `SELECT * FROM espionage_missions
         WHERE fief_id = $1 AND status <> 'cancelled'
         ORDER BY created_at DESC LIMIT 50`,
        [fiefId]
      );
      const view = isDm(req.user) ? toDmView : toPlayerView;
      res.json({ missions: rows.rows.map((m) => view(m, currentDay)) });
    } catch (error) {
      console.error('Error listing espionage missions:', error);
      res.status(500).json({ error: 'Failed to load espionage missions' });
    }
  });

  // Player requests a mission. Spies leave the reserve immediately.
  router.post('/fiefs/:id/espionage', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const fiefId = Number(req.params.id);
      if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });
      const fief = await getFiefContext(fiefId);
      if (!fief) return res.status(404).json({ error: 'Fief not found' });
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (Number(fief.tier || 1) < ESPIONAGE_MIN_TIER) {
        return res.status(400).json({ error: `Espionage requires a Tier ${ESPIONAGE_MIN_TIER} fief` });
      }
      if (!(await tableReady())) return res.status(400).json({ error: 'Espionage is not available yet' });

      const target = String(req.body?.target || '').trim().slice(0, 200);
      if (!target) return res.status(400).json({ error: 'Enter a target' });
      const spies = normalizeSpies(req.body?.spies);
      if (totalSpies(spies) <= 0) return res.status(400).json({ error: 'Choose at least one spy to send' });

      await client.query('BEGIN');
      const lock = await client.query(`SELECT unit_reserves FROM fiefs WHERE id = $1 FOR UPDATE`, [fiefId]);
      const reserves = { ...(lock.rows[0]?.unit_reserves || {}) };
      for (const [unitType, count] of Object.entries(spies)) {
        const available = Math.max(0, Math.floor(Number(reserves[unitType]) || 0));
        if (count > available) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Only ${available} ${unitType} in reserve` });
        }
        reserves[unitType] = available - count;
      }
      await client.query(`UPDATE fiefs SET unit_reserves = $2::jsonb WHERE id = $1`, [fiefId, JSON.stringify(reserves)]);
      const inserted = await client.query(
        `INSERT INTO espionage_missions (campaign_id, fief_id, kingdom_id, requested_by, target, spies, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending')
         RETURNING *`,
        [fief.campaign_id, fiefId, fief.kingdom_id, req.user.id, target, JSON.stringify(spies)]
      );
      await client.query('COMMIT');

      const mission = inserted.rows[0];
      notify(req, fief.campaign_id, fiefId, { missionId: Number(mission.id), event: 'requested' });
      const currentDay = await getCurrentDay(fief.campaign_id);
      res.json({ mission: toPlayerView(mission, currentDay) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error requesting espionage:', error);
      res.status(500).json({ error: 'Failed to request espionage' });
    } finally {
      client.release();
    }
  });

  // Player recalls stationed spies: they come home after RECALL_DAYS.
  router.post('/fiefs/:id/espionage/:missionId/recall', authenticateToken, async (req, res) => {
    try {
      const fiefId = Number(req.params.id);
      const missionId = Number(req.params.missionId);
      const fief = await getFiefContext(fiefId);
      if (!fief) return res.status(404).json({ error: 'Fief not found' });
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });

      const currentDay = await getCurrentDay(fief.campaign_id);
      const updated = await pool.query(
        `UPDATE espionage_missions
         SET status = 'returning', recall_day = $3, updated_at = NOW()
         WHERE id = $1 AND fief_id = $2 AND status = 'stationed'
         RETURNING *`,
        [missionId, fiefId, currentDay]
      );
      if (!updated.rows.length) return res.status(400).json({ error: 'Those spies are not in place to be recalled' });

      notify(req, fief.campaign_id, fiefId, { missionId, event: 'recalled' });
      res.json({ mission: toPlayerView(updated.rows[0], currentDay), returnDays: RECALL_DAYS });
    } catch (error) {
      console.error('Error recalling spies:', error);
      res.status(500).json({ error: 'Failed to recall spies' });
    }
  });

  // DM: everything awaiting a decision, plus active missions, for the whole campaign.
  router.get('/campaigns/:campaignId/espionage', authenticateToken, async (req, res) => {
    try {
      if (!requireDM(req, res)) return;
      const campaignId = Number(req.params.campaignId);
      if (!Number.isFinite(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });
      if (!(await tableReady())) return res.json({ missions: [] });

      const owner = await pool.query(`SELECT dungeon_master_id FROM campaigns WHERE id = $1`, [campaignId]);
      if (!owner.rows.length) return res.status(404).json({ error: 'Campaign not found' });
      if (Number(owner.rows[0].dungeon_master_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Not your campaign' });
      }

      const currentDay = await getCurrentDay(campaignId);
      const rows = await pool.query(
        `SELECT m.*, f.name AS fief_name, k.name AS kingdom_name
         FROM espionage_missions m
         JOIN fiefs f ON f.id = m.fief_id
         JOIN kingdoms k ON k.id = m.kingdom_id
         WHERE m.campaign_id = $1 AND m.status IN ('pending', 'in_progress', 'stationed', 'returning')
         ORDER BY (m.status = 'pending') DESC, m.created_at DESC`,
        [campaignId]
      );
      res.json({
        missions: rows.rows.map((m) => ({ ...toDmView(m, currentDay), fief_name: m.fief_name, kingdom_name: m.kingdom_name })),
      });
    } catch (error) {
      console.error('Error loading campaign espionage:', error);
      res.status(500).json({ error: 'Failed to load espionage missions' });
    }
  });

  // DM approves a request: sets how long it takes and how likely it is to work. The roll is hidden.
  router.post('/espionage/:missionId/approve', authenticateToken, async (req, res) => {
    try {
      if (!requireDM(req, res)) return;
      const missionId = Number(req.params.missionId);
      const days = Math.floor(Number(req.body?.days));
      const successRate = Number(req.body?.successRate);
      if (!Number.isFinite(days) || days < 1 || days > 3650) return res.status(400).json({ error: 'Days must be between 1 and 3650' });
      if (!Number.isFinite(successRate) || successRate < 0 || successRate > 100) {
        return res.status(400).json({ error: 'Success rate must be between 0 and 100' });
      }

      const found = await pool.query(
        `SELECT m.*, c.dungeon_master_id FROM espionage_missions m JOIN campaigns c ON c.id = m.campaign_id WHERE m.id = $1`,
        [missionId]
      );
      const mission = found.rows[0];
      if (!mission) return res.status(404).json({ error: 'Mission not found' });
      if (Number(mission.dungeon_master_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Not your campaign' });
      if (mission.status !== 'pending') return res.status(400).json({ error: 'Mission is no longer pending' });

      const currentDay = await getCurrentDay(mission.campaign_id);
      const { outcome, failFraction } = rollOutcome(successRate);
      const updated = await pool.query(
        `UPDATE espionage_missions
         SET status = 'in_progress', days_total = $2, success_rate = $3, outcome = $4, fail_fraction = $5,
             start_day = $6, updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [missionId, days, successRate, outcome, failFraction, currentDay]
      );
      if (!updated.rows.length) return res.status(400).json({ error: 'Mission is no longer pending' });

      notify(req, mission.campaign_id, Number(mission.fief_id), { missionId, event: 'approved' });
      res.json({ mission: toDmView(updated.rows[0], currentDay) });
    } catch (error) {
      console.error('Error approving espionage:', error);
      res.status(500).json({ error: 'Failed to approve mission' });
    }
  });

  // DM declines a pending request (or aborts a running one): spies go back to the reserve.
  router.post('/espionage/:missionId/cancel', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!requireDM(req, res)) return;
      const missionId = Number(req.params.missionId);
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT m.*, c.dungeon_master_id FROM espionage_missions m JOIN campaigns c ON c.id = m.campaign_id
         WHERE m.id = $1 FOR UPDATE OF m`,
        [missionId]
      );
      const mission = found.rows[0];
      if (!mission) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Mission not found' }); }
      if (Number(mission.dungeon_master_id) !== Number(req.user.id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Not your campaign' });
      }
      if (!['pending', 'in_progress', 'stationed'].includes(mission.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Mission can no longer be cancelled' });
      }
      await returnSpiesToReserve(client, Number(mission.fief_id), mission.spies);
      await client.query(`UPDATE espionage_missions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [missionId]);
      await client.query('COMMIT');

      notify(req, mission.campaign_id, Number(mission.fief_id), { missionId, event: 'cancelled' });
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error cancelling espionage:', error);
      res.status(500).json({ error: 'Failed to cancel mission' });
    } finally {
      client.release();
    }
  });

  return router;
};
