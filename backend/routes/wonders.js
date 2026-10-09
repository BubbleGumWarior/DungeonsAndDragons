const express = require('express');
const { WONDER_MIN_TIER, WONDER_CATALOG, WONDER_BUILD, ACTIVE_STATUSES, getWonderDef } = require('../utils/wonders');

/** Tier 10 Wonders routes. Factory form so it can share routes/kingdoms.js helpers. */
module.exports = ({ pool, authenticateToken, getFiefContext, canManageFief, requireDM }) => {
  const router = express.Router();

  const getCurrentDay = async (campaignId, db = pool) => {
    const r = await db.query(`SELECT COALESCE(current_day, 1) AS d FROM campaigns WHERE id = $1`, [campaignId]);
    return Math.max(1, Math.floor(Number(r.rows[0]?.d || 1)));
  };

  const tableReady = async () => Boolean((await pool.query(`SELECT to_regclass('public.wonders') AS t`)).rows[0]?.t);

  const notify = (req, campaignId, fiefId) => {
    if (!req.io) return;
    req.io.to(`campaign_${campaignId}`).emit('wondersChanged', { campaignId });
    if (fiefId != null) req.io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId, fiefId });
  };

  // DM of this campaign, or an owner / co-owner of a kingdom in it.
  const canViewCampaign = async (user, campaignId) => {
    const camp = await pool.query(`SELECT dungeon_master_id FROM campaigns WHERE id = $1`, [campaignId]);
    if (!camp.rows.length) return { ok: false, notFound: true };
    if (user.role === 'Dungeon Master') return { ok: Number(camp.rows[0].dungeon_master_id) === Number(user.id), dm: true };
    const own = await pool.query(`SELECT 1 FROM kingdoms WHERE campaign_id = $1 AND player_id = $2 LIMIT 1`, [campaignId, user.id]);
    if (own.rows.length) return { ok: true, dm: false };
    try {
      const co = await pool.query(
        `SELECT 1 FROM kingdom_co_owners co JOIN kingdoms k ON k.id = co.kingdom_id
         WHERE k.campaign_id = $1 AND co.player_id = $2 LIMIT 1`,
        [campaignId, user.id]
      );
      if (co.rows.length) return { ok: true, dm: false };
    } catch (_) { /* no co-owner table */ }
    return { ok: false };
  };

  const loadRows = async (campaignId) => {
    const r = await pool.query(
      `SELECT w.*, f.name AS fief_name, k.name AS kingdom_name
       FROM wonders w
       LEFT JOIN fiefs f ON f.id = w.fief_id
       LEFT JOIN kingdoms k ON k.id = f.kingdom_id
       WHERE w.campaign_id = $1 AND w.status IN ('under_construction', 'built')`,
      [campaignId]
    );
    return r.rows;
  };

  // Catalog with who holds what. Notes are the DM's private record of what the Wonder does.
  router.get('/campaigns/:campaignId/wonders', authenticateToken, async (req, res) => {
    try {
      const campaignId = Number(req.params.campaignId);
      if (!Number.isFinite(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });
      const access = await canViewCampaign(req.user, campaignId);
      if (access.notFound) return res.status(404).json({ error: 'Campaign not found' });
      if (!access.ok) return res.status(403).json({ error: 'Not authorized' });
      if (!(await tableReady())) return res.json({ wonders: [], build: WONDER_BUILD, minTier: WONDER_MIN_TIER });

      const currentDay = await getCurrentDay(campaignId);
      const rows = await loadRows(campaignId);
      const byKey = new Map(rows.map((r) => [r.wonder_key, r]));
      const wonders = WONDER_CATALOG.map((def) => {
        const row = byKey.get(def.key);
        const entry = { key: def.key, name: def.name, flavor: def.flavor, status: 'available' };
        if (row) {
          entry.status = row.status;
          entry.id = Number(row.id);
          entry.fief_id = row.fief_id == null ? null : Number(row.fief_id);
          entry.holder = row.npc_holder_name || (row.fief_name ? `${row.fief_name}${row.kingdom_name ? ` (${row.kingdom_name})` : ''}` : 'Unknown');
          entry.is_npc = Boolean(row.npc_holder_name);
          if (row.status === 'under_construction') {
            entry.days_remaining = Math.max(0, Number(row.start_day) + Number(row.days_total) - currentDay);
          }
          if (access.dm) entry.notes = row.notes || '';
        }
        return entry;
      });
      res.json({ wonders, build: WONDER_BUILD, minTier: WONDER_MIN_TIER });
    } catch (error) {
      console.error('Error loading wonders:', error);
      res.status(500).json({ error: 'Failed to load wonders' });
    }
  });

  // Player starts building a Wonder in a tier 10 fief. Pays the cost up front.
  router.post('/fiefs/:id/wonders', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const fiefId = Number(req.params.id);
      const fief = await getFiefContext(fiefId);
      if (!fief) return res.status(404).json({ error: 'Fief not found' });
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (req.user.role === 'Dungeon Master') return res.status(403).json({ error: 'Use "Set as built" to place a Wonder as DM' });
      if (Number(fief.tier || 1) < WONDER_MIN_TIER) return res.status(400).json({ error: `Wonders require a Tier ${WONDER_MIN_TIER} fief` });
      if (!(await tableReady())) return res.status(400).json({ error: 'Wonders are not available yet' });

      const def = getWonderDef(String(req.body?.wonderKey || ''));
      if (!def) return res.status(400).json({ error: 'Unknown Wonder' });

      await client.query('BEGIN');
      const lock = await client.query(`SELECT stored_resources FROM fiefs WHERE id = $1 FOR UPDATE`, [fiefId]);
      const stored = { ...(lock.rows[0]?.stored_resources || {}) };

      const heldHere = await client.query(`SELECT 1 FROM wonders WHERE fief_id = $1 AND status = ANY($2::text[])`, [fiefId, ACTIVE_STATUSES]);
      if (heldHere.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'This fief already has a Wonder' }); }
      const taken = await client.query(
        `SELECT status FROM wonders WHERE campaign_id = $1 AND wonder_key = $2 AND status = ANY($3::text[])`,
        [fief.campaign_id, def.key, ACTIVE_STATUSES]
      );
      if (taken.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `${def.name} already exists in this campaign. It must be destroyed before it can be built again.` });
      }

      for (const [key, required] of Object.entries(WONDER_BUILD.cost)) {
        const have = Number(stored[key] || 0);
        if (have < required) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Not enough ${key.replace('_', ' ')}. Required: ${required}, Available: ${have}` });
        }
        stored[key] = have - required;
      }
      await client.query(`UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`, [fiefId, JSON.stringify(stored)]);
      const currentDay = await getCurrentDay(fief.campaign_id, client);
      await client.query(
        `INSERT INTO wonders (campaign_id, wonder_key, status, fief_id, start_day, days_total, paid_cost)
         VALUES ($1, $2, 'under_construction', $3, $4, $5, $6::jsonb)`,
        [fief.campaign_id, def.key, fiefId, currentDay, WONDER_BUILD.days, JSON.stringify(WONDER_BUILD.cost)]
      );
      await client.query('COMMIT');
      notify(req, fief.campaign_id, fiefId);
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return res.status(409).json({ error: 'That Wonder or fief is already taken' });
      console.error('Error starting wonder:', error);
      res.status(500).json({ error: 'Failed to start Wonder' });
    } finally {
      client.release();
    }
  });

  // DM: set a Wonder as already built, on a fief or on an NPC kingdom (named holder).
  router.post('/campaigns/:campaignId/wonders', authenticateToken, async (req, res) => {
    try {
      if (!requireDM(req, res)) return;
      const campaignId = Number(req.params.campaignId);
      const access = await canViewCampaign(req.user, campaignId);
      if (!access.ok) return res.status(access.notFound ? 404 : 403).json({ error: 'Not authorized' });
      if (!(await tableReady())) return res.status(400).json({ error: 'Wonders are not available yet' });

      const def = getWonderDef(String(req.body?.wonderKey || ''));
      if (!def) return res.status(400).json({ error: 'Unknown Wonder' });
      const notes = String(req.body?.notes || '').slice(0, 4000);
      const fiefId = req.body?.fiefId == null || req.body.fiefId === '' ? null : Number(req.body.fiefId);
      const npcName = String(req.body?.npcHolderName || '').trim().slice(0, 120);
      if ((fiefId == null) === (!npcName)) return res.status(400).json({ error: 'Choose either a fief or an NPC holder name' });

      if (fiefId != null) {
        const fief = await getFiefContext(fiefId);
        if (!fief || Number(fief.campaign_id) !== campaignId) return res.status(404).json({ error: 'Fief not found in this campaign' });
      }

      const currentDay = await getCurrentDay(campaignId);
      try {
        await pool.query(
          `INSERT INTO wonders (campaign_id, wonder_key, status, fief_id, npc_holder_name, notes, start_day, days_total, built_day)
           VALUES ($1, $2, 'built', $3, $4, $5, $6, 0, $6)`,
          [campaignId, def.key, fiefId, fiefId == null ? npcName : null, notes, currentDay]
        );
      } catch (e) {
        if (e.code === '23505') {
          const taken = await pool.query(
            `SELECT 1 FROM wonders WHERE campaign_id = $1 AND wonder_key = $2 AND status = ANY($3::text[])`,
            [campaignId, def.key, ACTIVE_STATUSES]
          );
          return res.status(409).json({
            error: taken.rows.length
              ? `${def.name} already exists. Destroy it first.`
              : 'That holder already has a Wonder. Each fief can hold only one.',
          });
        }
        throw e;
      }
      notify(req, campaignId, fiefId);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error placing wonder:', error);
      res.status(500).json({ error: 'Failed to place Wonder' });
    }
  });

  const loadOwnedWonder = async (req, res) => {
    if (!requireDM(req, res)) return null;
    const id = Number(req.params.wonderId);
    if (!Number.isInteger(id)) { res.status(400).json({ error: 'Invalid Wonder ID' }); return null; }
    const r = await pool.query(
      `SELECT w.*, c.dungeon_master_id FROM wonders w JOIN campaigns c ON c.id = w.campaign_id WHERE w.id = $1`,
      [id]
    );
    const wonder = r.rows[0];
    if (!wonder) { res.status(404).json({ error: 'Wonder not found' }); return null; }
    if (Number(wonder.dungeon_master_id) !== Number(req.user.id)) { res.status(403).json({ error: 'Not your campaign' }); return null; }
    return wonder;
  };

  router.patch('/wonders/:wonderId/notes', authenticateToken, async (req, res) => {
    try {
      const wonder = await loadOwnedWonder(req, res);
      if (!wonder) return;
      await pool.query(`UPDATE wonders SET notes = $2, updated_at = NOW() WHERE id = $1`, [wonder.id, String(req.body?.notes || '').slice(0, 4000)]);
      notify(req, wonder.campaign_id, null);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error saving wonder notes:', error);
      res.status(500).json({ error: 'Failed to save notes' });
    }
  });

  // DM: the Wonder was torn down in play. Frees the Wonder and the holder.
  router.post('/wonders/:wonderId/destroy', authenticateToken, async (req, res) => {
    try {
      const wonder = await loadOwnedWonder(req, res);
      if (!wonder) return;
      if (!ACTIVE_STATUSES.includes(wonder.status)) return res.status(400).json({ error: 'Wonder is not standing' });
      await pool.query(`UPDATE wonders SET status = 'destroyed', updated_at = NOW() WHERE id = $1`, [wonder.id]);
      notify(req, wonder.campaign_id, wonder.fief_id == null ? null : Number(wonder.fief_id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Error destroying wonder:', error);
      res.status(500).json({ error: 'Failed to destroy Wonder' });
    }
  });

  // DM: drop an under-construction reservation. The paid cost goes back to the fief.
  router.post('/wonders/:wonderId/cancel', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const wonder = await loadOwnedWonder(req, res);
      if (!wonder) return;
      if (wonder.status !== 'under_construction') return res.status(400).json({ error: 'Only a Wonder under construction can be cleared' });
      await client.query('BEGIN');
      if (wonder.fief_id != null) {
        const lock = await client.query(`SELECT stored_resources FROM fiefs WHERE id = $1 FOR UPDATE`, [wonder.fief_id]);
        const stored = { ...(lock.rows[0]?.stored_resources || {}) };
        for (const [key, paid] of Object.entries(wonder.paid_cost || {})) stored[key] = Number(stored[key] || 0) + Number(paid || 0);
        await client.query(`UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`, [wonder.fief_id, JSON.stringify(stored)]);
      }
      await client.query(`UPDATE wonders SET status = 'destroyed', updated_at = NOW() WHERE id = $1`, [wonder.id]);
      await client.query('COMMIT');
      notify(req, wonder.campaign_id, wonder.fief_id == null ? null : Number(wonder.fief_id));
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error clearing wonder:', error);
      res.status(500).json({ error: 'Failed to clear Wonder' });
    } finally {
      client.release();
    }
  });

  return router;
};
