const { pool } = require('./models/database');

async function tableExists(tableName) {
  const result = await pool.query(
    `SELECT to_regclass($1) AS name`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.name);
}

async function checkSchema() {
  const requiredTables = [
    'kingdom_legendary_characters',
    'kingdom_legendary_assignments',
    'kingdom_prayer_casts',
    'kingdom_trade_depots',
    'kingdom_trade_depot_events',
  ];

  const missing = [];
  for (const tableName of requiredTables) {
    const exists = await tableExists(tableName);
    if (!exists) missing.push(tableName);
  }

  if (missing.length > 0) {
    console.log('❌ Missing kingdom-management tables:');
    for (const tableName of missing) {
      console.log(`   - ${tableName}`);
    }
    return false;
  }

  console.log('✅ All required kingdom-management tables exist.');
  return true;
}

async function checkLegendaryInvariants() {
  console.log('\n🧪 Checking legendary assignment invariants...');

  const crossKingdom = await pool.query(
    `SELECT la.id, la.legendary_id, la.fief_id
     FROM kingdom_legendary_assignments la
     JOIN kingdom_legendary_characters lc ON lc.id = la.legendary_id
     JOIN fiefs f ON f.id = la.fief_id
     WHERE lc.kingdom_id <> f.kingdom_id
     LIMIT 20`
  );

  if (crossKingdom.rows.length > 0) {
    console.log('❌ Found cross-kingdom legendary assignments (invalid):');
    for (const row of crossKingdom.rows) {
      console.log(`   - assignment ${row.id}, legendary ${row.legendary_id}, fief ${row.fief_id}`);
    }
    return false;
  }

  const overCap = await pool.query(
    `WITH kingdom_tiers AS (
       SELECT k.id AS kingdom_id, COALESCE(MAX(f.tier), 0) AS highest_tier
       FROM kingdoms k
       LEFT JOIN fiefs f ON f.kingdom_id = k.id
       GROUP BY k.id
     ),
     fief_caps AS (
       SELECT f.id AS fief_id,
              f.kingdom_id,
              GREATEST(0, FLOOR(kt.highest_tier) - 2) AS slot_cap
       FROM fiefs f
       JOIN kingdom_tiers kt ON kt.kingdom_id = f.kingdom_id
     ),
     assigned AS (
       SELECT la.fief_id, COUNT(*) AS assigned_count
       FROM kingdom_legendary_assignments la
       GROUP BY la.fief_id
     )
     SELECT fc.fief_id, fc.slot_cap, COALESCE(a.assigned_count, 0) AS assigned_count
     FROM fief_caps fc
     LEFT JOIN assigned a ON a.fief_id = fc.fief_id
     WHERE COALESCE(a.assigned_count, 0) > fc.slot_cap
     LIMIT 20`
  );

  if (overCap.rows.length > 0) {
    console.log('❌ Found fiefs over legendary slot cap:');
    for (const row of overCap.rows) {
      console.log(`   - fief ${row.fief_id}: ${row.assigned_count}/${row.slot_cap}`);
    }
    return false;
  }

  console.log('✅ Legendary assignment invariants look good.');
  return true;
}

async function checkTradeDepotInvariants() {
  console.log('\n🧪 Checking trade depot invariants...');

  const negativeValues = await pool.query(
    `SELECT kingdom_id
     FROM kingdom_trade_depots
     WHERE COALESCE(population, 0) < 0
        OR COALESCE(slaves, 0) < 0
     LIMIT 20`
  );

  if (negativeValues.rows.length > 0) {
    console.log('❌ Found depots with negative population/slaves:');
    for (const row of negativeValues.rows) {
      console.log(`   - kingdom ${row.kingdom_id}`);
    }
    return false;
  }

  const TRADE_BUILDINGS = [
    'trade_post',
    'market_hall',
    'merchant_exchange',
    'grand_bazaar',
    'great_market',
    'trade_consortium',
    'royal_exchange',
    'imperial_trade_forum',
  ];

  const capacityRows = await pool.query(
    `WITH depot_usage AS (
       SELECT d.kingdom_id,
              COALESCE((
                SELECT SUM(CASE
                  WHEN jsonb_typeof(value) = 'number' THEN GREATEST((value::text)::numeric, 0)
                  ELSE 0
                END)
                FROM jsonb_each(COALESCE(d.resources, '{}'::jsonb))
              ), 0) + GREATEST(COALESCE(d.population, 0), 0) + GREATEST(COALESCE(d.slaves, 0), 0) AS used
       FROM kingdom_trade_depots d
     ),
     trade_caps AS (
       SELECT k.id AS kingdom_id,
              (COALESCE(COUNT(fb.id), 0) * 100) AS cap
       FROM kingdoms k
       LEFT JOIN fiefs f ON f.kingdom_id = k.id
       LEFT JOIN fief_buildings fb
         ON fb.fief_id = f.id
        AND fb.is_complete = true
        AND fb.building_type = ANY($1::text[])
       GROUP BY k.id
     )
     SELECT du.kingdom_id, du.used, COALESCE(tc.cap, 0) AS cap
     FROM depot_usage du
     LEFT JOIN trade_caps tc ON tc.kingdom_id = du.kingdom_id
     WHERE du.used > COALESCE(tc.cap, 0)
     ORDER BY (du.used - COALESCE(tc.cap, 0)) DESC
     LIMIT 20`,
    [TRADE_BUILDINGS]
  );

  if (capacityRows.rows.length > 0) {
    console.log('⚠️  Found depots over computed capacity (may indicate legacy data or balancing issue):');
    for (const row of capacityRows.rows) {
      console.log(`   - kingdom ${row.kingdom_id}: used=${Number(row.used).toFixed(2)} cap=${row.cap}`);
    }
    return false;
  }

  console.log('✅ Trade depot invariants look good.');
  return true;
}

async function checkPrayerHistory() {
  console.log('\n🧪 Checking prayer cast data consistency...');

  const orphanTargets = await pool.query(
    `SELECT pc.id
     FROM kingdom_prayer_casts pc
     LEFT JOIN fiefs f ON f.id = pc.target_fief_id
     WHERE pc.target_fief_id IS NOT NULL AND f.id IS NULL
     LIMIT 20`
  );

  if (orphanTargets.rows.length > 0) {
    console.log('⚠️  Found prayer casts targeting deleted/missing fiefs:');
    for (const row of orphanTargets.rows) {
      console.log(`   - prayer_cast ${row.id}`);
    }
    return false;
  }

  console.log('✅ Prayer cast data consistency looks good.');
  return true;
}

async function run() {
  try {
    console.log('🛡️  Kingdom Management Systems Check');
    console.log('='.repeat(60));

    const schemaOk = await checkSchema();
    if (!schemaOk) {
      process.exitCode = 1;
      return;
    }

    const checks = await Promise.all([
      checkLegendaryInvariants(),
      checkTradeDepotInvariants(),
      checkPrayerHistory(),
    ]);

    const allPassed = checks.every(Boolean);
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ Kingdom management checks passed.');
    } else {
      console.log('⚠️  Kingdom management checks completed with warnings/failures.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Kingdom management check failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
