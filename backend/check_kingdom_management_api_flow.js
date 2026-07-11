const { pool } = require('./models/database');
const jwt = require('jsonwebtoken');

const DEFAULT_BASE_URL = process.env.KINGDOM_API_BASE_URL || 'http://localhost:5000/api';

const hasFlag = (flag) => process.argv.includes(flag);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function resolveToken(baseUrl) {
  const directToken = String(process.env.KINGDOM_TEST_TOKEN || '').trim();
  if (directToken) return directToken;

  const userIdFromEnv = Number(process.env.KINGDOM_TEST_USER_ID || 0);
  if (Number.isFinite(userIdFromEnv) && userIdFromEnv > 0) {
    const userResult = await pool.query(
      `SELECT id, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userIdFromEnv]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new Error(`KINGDOM_TEST_USER_ID (${userIdFromEnv}) does not exist.`);
    }
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is required when using KINGDOM_TEST_USER_ID.');
    }

    return jwt.sign(
      { userId: Number(user.id), role: String(user.role || 'Player') },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  const email = String(process.env.KINGDOM_TEST_EMAIL || '').trim();
  const password = String(process.env.KINGDOM_TEST_PASSWORD || '').trim();
  if (!email || !password) {
    throw new Error(
      'Missing auth credentials. Set KINGDOM_TEST_TOKEN, or KINGDOM_TEST_USER_ID (+ JWT_SECRET), or KINGDOM_TEST_EMAIL + KINGDOM_TEST_PASSWORD.'
    );
  }

  const login = await requestJson(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!login.ok || !login.body?.token) {
    throw new Error(`Login failed (${login.status}): ${JSON.stringify(login.body || {})}`);
  }

  return String(login.body.token);
}

async function getManagedKingdom(user) {
  const explicit = Number(process.env.KINGDOM_TEST_KINGDOM_ID || 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    const kingdomRow = await pool.query(
      `SELECT k.id, k.player_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE k.id = $1
       LIMIT 1`,
      [explicit]
    );
    return kingdomRow.rows[0] || null;
  }

  if (String(user.role || '') === 'Dungeon Master') {
    const result = await pool.query(
      `SELECT k.id, k.player_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE c.dungeon_master_id = $1
       ORDER BY k.id ASC
       LIMIT 1`,
      [user.id]
    );
    return result.rows[0] || null;
  }

  let withCoOwners = null;
  try {
    withCoOwners = await pool.query(
      `SELECT k.id, k.player_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       LEFT JOIN kingdom_co_owners co ON co.kingdom_id = k.id
       WHERE k.player_id = $1 OR co.player_id = $1
       ORDER BY k.id ASC
       LIMIT 1`,
      [user.id]
    );
  } catch (_) {
    withCoOwners = await pool.query(
      `SELECT k.id, k.player_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE k.player_id = $1
       ORDER BY k.id ASC
       LIMIT 1`,
      [user.id]
    );
  }

  return withCoOwners.rows[0] || null;
}

async function getKingdomFiefs(kingdomId) {
  const result = await pool.query(
    `SELECT id, name, is_capital, tier
     FROM fiefs
     WHERE kingdom_id = $1
     ORDER BY is_capital DESC, id ASC`,
    [kingdomId]
  );
  return result.rows || [];
}

async function run() {
  const baseUrl = DEFAULT_BASE_URL.replace(/\/$/, '');
  const writeMode = hasFlag('--write');

  console.log('🧪 Kingdom Management API Flow Check');
  console.log('='.repeat(60));
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Mode: ${writeMode ? 'write (reversible checks)' : 'read-only'}`);

  const failures = [];
  const warnings = [];

  try {
    const token = await resolveToken(baseUrl);
    const profile = await requestJson(`${baseUrl}/auth/profile`, {
      headers: authHeaders(token),
    });

    if (!profile.ok || !profile.body?.user) {
      throw new Error(`Unable to fetch profile (${profile.status}): ${JSON.stringify(profile.body || {})}`);
    }

    const user = profile.body.user;
    console.log(`Authenticated as ${user.username} (id=${user.id}, role=${user.role})`);

    const kingdom = await getManagedKingdom(user);
    if (!kingdom) {
      throw new Error('No manageable kingdom found for this user. Set KINGDOM_TEST_KINGDOM_ID explicitly.');
    }

    const kingdomId = Number(kingdom.id);
    console.log(`Using kingdom ${kingdomId}`);

    const fiefs = await getKingdomFiefs(kingdomId);
    if (fiefs.length === 0) {
      throw new Error(`Kingdom ${kingdomId} has no fiefs.`);
    }
    const primaryFiefId = Number(fiefs[0].id);

    const legendary = await requestJson(`${baseUrl}/kingdoms/${kingdomId}/legendary-characters`, {
      headers: authHeaders(token),
    });
    if (!legendary.ok) {
      failures.push(`legendary-characters failed (${legendary.status})`);
    } else {
      console.log(`✅ legendary-characters ok (${(legendary.body?.characters || []).length} characters)`);
    }

    const prayers = await requestJson(`${baseUrl}/kingdoms/${kingdomId}/prayers`, {
      headers: authHeaders(token),
    });
    if (!prayers.ok) {
      failures.push(`prayers failed (${prayers.status})`);
    } else {
      console.log(`✅ prayers ok (${(prayers.body?.prayers || []).length} prayers, pooledFaith=${Number(prayers.body?.pooledFaith || 0).toFixed(2)})`);
    }

    const tradeDepot = await requestJson(`${baseUrl}/kingdoms/${kingdomId}/trade-depot`, {
      headers: authHeaders(token),
    });
    if (!tradeDepot.ok) {
      failures.push(`trade-depot failed (${tradeDepot.status})`);
    } else {
      console.log(`✅ trade-depot ok (capacity ${Number(tradeDepot.body?.depot?.capacity_used || 0).toFixed(1)} / ${Number(tradeDepot.body?.depot?.capacity_max || 0).toFixed(1)})`);
    }

    if (writeMode) {
      console.log('\n🔁 Running reversible write checks...');

      const originalDesiredText = String(tradeDepot.body?.depot?.desired_resource_text || '');
      const probeDesiredText = `[api-flow-check ${Date.now()}]`;

      const desiredUpdate = await requestJson(`${baseUrl}/kingdoms/${kingdomId}/trade-depot/desired`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ desiredText: probeDesiredText }),
      });

      if (!desiredUpdate.ok) {
        failures.push(`trade desired update failed (${desiredUpdate.status})`);
      } else {
        console.log('✅ trade desired text update ok');
      }

      const desiredRevert = await requestJson(`${baseUrl}/kingdoms/${kingdomId}/trade-depot/desired`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ desiredText: originalDesiredText }),
      });

      if (!desiredRevert.ok) {
        warnings.push(`Could not revert desired text (${desiredRevert.status})`);
      } else {
        console.log('✅ trade desired text reverted');
      }

      const characters = Array.isArray(legendary.body?.characters) ? legendary.body.characters : [];
      if (characters.length === 0) {
        warnings.push('No legendary characters exist; skipping assignment round-trip check.');
      } else {
        const selected = characters[0];
        const originalFiefId = Number(selected.assigned_fief_id || 0);
        const alternate = fiefs.find((f) => Number(f.id) !== originalFiefId) || fiefs[0];
        const targetFiefId = Number(alternate.id || primaryFiefId);

        const assign = await requestJson(`${baseUrl}/kingdoms/fiefs/${targetFiefId}/legendary-assignments`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ legendaryId: Number(selected.id) }),
        });

        if (!assign.ok) {
          warnings.push(`Legendary assignment probe failed (${assign.status})`);
        } else {
          console.log('✅ legendary assignment probe ok');

          if (originalFiefId > 0) {
            const restore = await requestJson(`${baseUrl}/kingdoms/fiefs/${originalFiefId}/legendary-assignments`, {
              method: 'POST',
              headers: authHeaders(token),
              body: JSON.stringify({ legendaryId: Number(selected.id) }),
            });
            if (!restore.ok) {
              warnings.push(`Could not restore legendary to original fief (${restore.status})`);
            } else {
              console.log('✅ legendary assignment restored to original fief');
            }
          } else {
            const unassign = await requestJson(`${baseUrl}/kingdoms/fiefs/${targetFiefId}/legendary-assignments/${Number(selected.id)}`, {
              method: 'DELETE',
              headers: authHeaders(token),
            });
            if (!unassign.ok) {
              warnings.push(`Could not unassign probe legendary (${unassign.status})`);
            } else {
              console.log('✅ probe legendary unassigned');
            }
          }
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    if (failures.length === 0) {
      console.log('✅ API flow check passed.');
    } else {
      console.log('❌ API flow check failed:');
      for (const item of failures) console.log(`   - ${item}`);
      process.exitCode = 1;
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const item of warnings) console.log(`   - ${item}`);
      if (process.exitCode !== 1) process.exitCode = 0;
    }
  } catch (error) {
    console.error(`❌ API flow check error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
