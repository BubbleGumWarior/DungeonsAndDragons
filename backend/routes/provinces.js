const express = require('express');
const { getAssignablePopulation } = require('../utils/population');
const {
  PROVINCE_MIN_FIEF_TIER,
  MAX_PROVINCES_PER_FIEF,
  PROVINCE_POPULATION_CAP,
  IMPROVEMENT_MAX_LEVEL,
  PROVINCE_FOUNDING_COST,
  IMPROVEMENTS,
  GOVERNOR_BONUSES,
  clampPct,
  getImprovementCost,
  toView,
} = require('../utils/provinces');

/** Tier 9 province routes. Factory form so it can share routes/kingdoms.js helpers. */
module.exports = ({ pool, authenticateToken, getFiefContext, canManageFief, requireDM }) => {
  const router = express.Router();

  const tableReady = async () => Boolean((await pool.query(`SELECT to_regclass('public.provinces') AS t`)).rows[0]?.t);

  const notify = (req, campaignId, fiefId) => {
    if (!req.io) return;
    req.io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId, fiefId });
    req.io.to(`campaign_${campaignId}`).emit('provincesChanged', { campaignId, fiefId });
  };

  /** Adult citizens who have no job: the only ones who can be sent to a province. */
  const getFreeAdults = (fief) => {
    const assignable = getAssignablePopulation(fief.population, fief.population_maturation_schedule, fief.sick_injured_population);
    const assigned = Object.values(fief.worker_assignments || {}).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    return Math.max(0, assignable - assigned);
  };

  const config = () => ({
    minTier: PROVINCE_MIN_FIEF_TIER,
    maxProvinces: MAX_PROVINCES_PER_FIEF,
    populationCap: PROVINCE_POPULATION_CAP,
    improvementMaxLevel: IMPROVEMENT_MAX_LEVEL,
    foundingCost: PROVINCE_FOUNDING_COST,
    improvements: Object.fromEntries(Object.entries(IMPROVEMENTS).map(([k, v]) => [k, { label: v.label, blurb: v.blurb, base: v.base }])),
    governorBonuses: GOVERNOR_BONUSES,
  });

  const loadProvince = async (id, client = pool, lock = false) => {
    const r = await client.query(
      `SELECT p.*, f.unrest AS fief_unrest FROM provinces p JOIN fiefs f ON f.id = p.fief_id WHERE p.id = $1${lock ? ' FOR UPDATE OF p' : ''}`,
      [id]
    );
    return r.rows[0] || null;
  };

  router.get('/fiefs/:id/provinces', authenticateToken, async (req, res) => {
    try {
      const fiefId = Number(req.params.id);
      const fief = await getFiefContext(fiefId);
      if (!fief) return res.status(404).json({ error: 'Fief not found' });
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (!(await tableReady())) return res.json({ provinces: [], config: config(), free_adults: getFreeAdults(fief) });
      const rows = await pool.query(
        `SELECT p.*, f.unrest AS fief_unrest FROM provinces p JOIN fiefs f ON f.id = p.fief_id
         WHERE p.fief_id = $1 ORDER BY (p.status = 'active') DESC, p.id`,
        [fiefId]
      );
      res.json({ provinces: rows.rows.map(toView), config: config(), free_adults: getFreeAdults(fief) });
    } catch (error) {
      console.error('Error loading provinces:', error);
      res.status(500).json({ error: 'Failed to load provinces' });
    }
  });

  // Found a province: pay the cost and send citizens to it.
  router.post('/fiefs/:id/provinces', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const fiefId = Number(req.params.id);
      const fief = await getFiefContext(fiefId);
      if (!fief) return res.status(404).json({ error: 'Fief not found' });
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (Number(fief.tier || 1) < PROVINCE_MIN_FIEF_TIER) return res.status(400).json({ error: `Provinces require a Tier ${PROVINCE_MIN_FIEF_TIER} fief` });
      if (!(await tableReady())) return res.status(400).json({ error: 'Provinces are not available yet' });

      const name = String(req.body?.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'Give the province a name' });
      const sent = Math.floor(Number(req.body?.population) || 0);
      if (sent < 1) return res.status(400).json({ error: 'Send at least one citizen to settle it' });
      if (sent > PROVINCE_POPULATION_CAP) return res.status(400).json({ error: `A province holds at most ${PROVINCE_POPULATION_CAP} people` });

      await client.query('BEGIN');
      const lock = await client.query(`SELECT * FROM fiefs WHERE id = $1 FOR UPDATE`, [fiefId]);
      const locked = lock.rows[0];
      const active = await client.query(`SELECT COUNT(*)::int AS c FROM provinces WHERE fief_id = $1 AND status = 'active'`, [fiefId]);
      if (active.rows[0].c >= MAX_PROVINCES_PER_FIEF) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `A fief can have at most ${MAX_PROVINCES_PER_FIEF} provinces` });
      }
      const free = getFreeAdults(locked);
      if (sent > free) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Only ${free} adults are free to leave. Unassign workers first.` });
      }

      const stored = { ...(locked.stored_resources || {}) };
      for (const [key, required] of Object.entries(PROVINCE_FOUNDING_COST)) {
        const have = Number(stored[key] || 0);
        if (have < required) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Not enough ${key.replace('_', ' ')}. Required: ${required}, Available: ${Math.floor(have)}` });
        }
        stored[key] = have - required;
      }

      await client.query(
        `UPDATE fiefs SET stored_resources = $2::jsonb, population = GREATEST(0, population - $3) WHERE id = $1`,
        [fiefId, JSON.stringify(stored), sent]
      );
      await client.query(
        `INSERT INTO provinces (fief_id, name, population) VALUES ($1, $2, $3)`,
        [fiefId, name, sent]
      );
      await client.query('COMMIT');
      notify(req, fief.campaign_id, fiefId);
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error founding province:', error);
      res.status(500).json({ error: 'Failed to found province' });
    } finally {
      client.release();
    }
  });

  // Set tribute, appoint or dismiss the governor.
  router.patch('/provinces/:provinceId', authenticateToken, async (req, res) => {
    try {
      const province = await loadProvince(Number(req.params.provinceId));
      if (!province) return res.status(404).json({ error: 'Province not found' });
      const fief = await getFiefContext(Number(province.fief_id));
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (province.status !== 'active') return res.status(400).json({ error: 'That province has broken away' });

      const sets = [];
      const values = [province.id];
      if (req.body?.tributePct !== undefined) {
        sets.push(`tribute_pct = $${values.push(clampPct(req.body.tributePct))}`);
      }
      if (req.body?.governorName !== undefined) {
        const governorName = String(req.body.governorName || '').trim().slice(0, 80);
        sets.push(`governor_name = $${values.push(governorName)}`);
        if (!governorName) sets.push(`governor_bonus = ''`);
      }
      if (req.body?.governorBonus !== undefined) {
        const bonus = String(req.body.governorBonus || '');
        if (bonus && !GOVERNOR_BONUSES[bonus]) return res.status(400).json({ error: 'Unknown governor type' });
        sets.push(`governor_bonus = $${values.push(bonus)}`);
      }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });

      await pool.query(`UPDATE provinces SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
      notify(req, fief.campaign_id, Number(province.fief_id));
      res.json({ province: toView(await loadProvince(province.id)) });
    } catch (error) {
      console.error('Error updating province:', error);
      res.status(500).json({ error: 'Failed to update province' });
    }
  });

  // Buy the next level of an improvement with gold.
  router.post('/provinces/:provinceId/improve', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const kind = String(req.body?.kind || '');
      if (!IMPROVEMENTS[kind]) return res.status(400).json({ error: 'Unknown improvement' });
      const province = await loadProvince(Number(req.params.provinceId));
      if (!province) return res.status(404).json({ error: 'Province not found' });
      const fief = await getFiefContext(Number(province.fief_id));
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (province.status !== 'active') return res.status(400).json({ error: 'That province has broken away' });

      await client.query('BEGIN');
      const locked = await loadProvince(province.id, client, true);
      const level = Number(locked.improvements?.[kind] || 0);
      if (level >= IMPROVEMENT_MAX_LEVEL) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already at the highest level' }); }
      const cost = getImprovementCost(kind, level);
      const fiefLock = await client.query(`SELECT stored_resources FROM fiefs WHERE id = $1 FOR UPDATE`, [locked.fief_id]);
      const stored = { ...(fiefLock.rows[0]?.stored_resources || {}) };
      const gold = Number(stored.gold || 0);
      if (gold < cost) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Not enough gold. Required: ${cost}, Available: ${Math.floor(gold)}` }); }
      stored.gold = gold - cost;
      const improvements = { ...(locked.improvements || {}), [kind]: level + 1 };
      await client.query(`UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`, [locked.fief_id, JSON.stringify(stored)]);
      await client.query(`UPDATE provinces SET improvements = $2::jsonb, updated_at = NOW() WHERE id = $1`, [locked.id, JSON.stringify(improvements)]);
      await client.query('COMMIT');
      notify(req, fief.campaign_id, Number(locked.fief_id));
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error improving province:', error);
      res.status(500).json({ error: 'Failed to improve province' });
    } finally {
      client.release();
    }
  });

  // Move citizens between the fief and a province. Positive = to the province, negative = back home.
  router.post('/provinces/:provinceId/transfer', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      const delta = Math.trunc(Number(req.body?.delta) || 0);
      if (!delta) return res.status(400).json({ error: 'Choose how many to move' });
      const province = await loadProvince(Number(req.params.provinceId));
      if (!province) return res.status(404).json({ error: 'Province not found' });
      const fief = await getFiefContext(Number(province.fief_id));
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized' });
      if (province.status !== 'active') return res.status(400).json({ error: 'That province has broken away' });

      await client.query('BEGIN');
      const locked = await loadProvince(province.id, client, true);
      const fiefLock = await client.query(`SELECT * FROM fiefs WHERE id = $1 FOR UPDATE`, [locked.fief_id]);
      const lockedFief = fiefLock.rows[0];
      const current = Number(locked.population);
      if (delta > 0) {
        const free = getFreeAdults(lockedFief);
        if (delta > free) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Only ${free} adults are free to leave` }); }
        if (current + delta > PROVINCE_POPULATION_CAP) { await client.query('ROLLBACK'); return res.status(400).json({ error: `A province holds at most ${PROVINCE_POPULATION_CAP} people` }); }
      } else if (-delta > current) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Only ${current} people live there` });
      }
      await client.query(`UPDATE provinces SET population = population + $2, updated_at = NOW() WHERE id = $1`, [locked.id, delta]);
      await client.query(`UPDATE fiefs SET population = GREATEST(0, population - $2) WHERE id = $1`, [locked.fief_id, delta]);
      await client.query('COMMIT');
      notify(req, fief.campaign_id, Number(locked.fief_id));
      res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error transferring population:', error);
      res.status(500).json({ error: 'Failed to move people' });
    } finally {
      client.release();
    }
  });

  // DM: set loyalty directly, or declare the province lost / restored.
  router.patch('/provinces/:provinceId/dm', authenticateToken, async (req, res) => {
    try {
      if (!requireDM(req, res)) return;
      const province = await loadProvince(Number(req.params.provinceId));
      if (!province) return res.status(404).json({ error: 'Province not found' });
      const fief = await getFiefContext(Number(province.fief_id));
      if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not your campaign' });

      const sets = [];
      const values = [province.id];
      if (req.body?.loyalty !== undefined) sets.push(`loyalty = $${values.push(clampPct(req.body.loyalty))}`);
      if (req.body?.status !== undefined) {
        const status = String(req.body.status);
        if (!['active', 'seceded'].includes(status)) return res.status(400).json({ error: 'Status must be active or seceded' });
        sets.push(`status = $${values.push(status)}`);
      }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
      await pool.query(`UPDATE provinces SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
      notify(req, fief.campaign_id, Number(province.fief_id));
      res.json({ province: toView(await loadProvince(province.id)) });
    } catch (error) {
      console.error('Error with DM province edit:', error);
      res.status(500).json({ error: 'Failed to update province' });
    }
  });

  return router;
};
