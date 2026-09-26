-- Seeds a SCRATCH clone of the dev DB with a production-like Kingdom load. Never run against a real DB.
--
-- Result: 4 kingdoms in the first campaign, each with
--   * a big fief   : ~450 built + 1000 queued buildings, pop 2500 (1500-key maturation schedule),
--                    1500 troop-training rows (700 in flight), 1500 animals, 2 queued researches
--   * an outpost   : 100 built buildings, pop 120
-- Ids are looked up, not hard-coded, so it works on any dev DB that has one campaign, a DM,
-- one kingdom with a fief, and at least three other Player users.
DO $$
DECLARE
  camp int; today int; tmpl_id int; tmpl_kingdom int;
  k RECORD; big_id int; small_id int; pid int;
BEGIN
  SELECT id, COALESCE(current_day, 1) INTO camp, today FROM campaigns ORDER BY id LIMIT 1;
  SELECT f.id, f.kingdom_id INTO tmpl_id, tmpl_kingdom
  FROM fiefs f JOIN kingdoms kk ON kk.id = f.kingdom_id WHERE kk.campaign_id = camp ORDER BY f.id LIMIT 1;

  -- Top up to four kingdoms.
  FOR pid IN SELECT id FROM users WHERE role = 'Player'
             AND id NOT IN (SELECT player_id FROM kingdoms WHERE campaign_id = camp) ORDER BY id LIMIT 3 LOOP
    INSERT INTO kingdoms (campaign_id, player_id, name, is_active) VALUES (camp, pid, 'Scratch Kingdom ' || pid, true);
  END LOOP;
  UPDATE kingdoms SET tax_rate_pct = 10, tithe_rate_pct = 5 WHERE campaign_id = camp;

  FOR k IN SELECT id FROM kingdoms WHERE campaign_id = camp ORDER BY id LOOP
    IF k.id = tmpl_kingdom THEN
      big_id := tmpl_id;
    ELSE
      INSERT INTO fiefs (kingdom_id, name, tier, population, is_capital, storage_capacity, food_storage_capacity, bank_capacity,
                         stored_resources, worker_assignments, unlocked_resources, max_workers_per_resource, completed_research,
                         unit_reserves, vegetable_harvest_state)
      SELECT k.id, 'Capital ' || k.id, tier, population, true, storage_capacity, food_storage_capacity, bank_capacity,
             stored_resources, worker_assignments, unlocked_resources, max_workers_per_resource, completed_research,
             unit_reserves, vegetable_harvest_state
      FROM fiefs WHERE id = tmpl_id RETURNING id INTO big_id;
    END IF;

    -- A self-consistent big fief: children (schedule total) < population <= housing, plenty of food/gold/storage.
    UPDATE fiefs SET population = 2500, storage_capacity = 200000, food_storage_capacity = 200000, bank_capacity = 200000,
      population_maturation_schedule = (SELECT jsonb_object_agg((today + g * 3)::text, 1) FROM generate_series(1, 1500) g),
      stored_resources = jsonb_set(jsonb_set(stored_resources, '{food}', '300000'), '{gold}', '300000'),
      worker_assignments = '{"gold": 150, "iron": 30, "meat": 100, "wood": 60, "faith": 20, "stone": 40, "tavern": 0, "building": 150, "research": 30, "vegetables": 120}'::jsonb,
      max_workers_per_resource = '{"gold": 400, "iron": 300, "meat": 500, "wood": 700, "faith": 300, "stone": 300, "building": 400, "research": 300, "vegetables": 900}'::jsonb
    WHERE id = big_id;

    INSERT INTO fiefs (kingdom_id, name, tier, population, is_capital, storage_capacity, food_storage_capacity, bank_capacity,
                       stored_resources, worker_assignments, unlocked_resources, max_workers_per_resource, completed_research,
                       unit_reserves, population_maturation_schedule)
    SELECT k.id, 'Outpost ' || k.id, 3, 120, false, storage_capacity, food_storage_capacity, bank_capacity,
           stored_resources, worker_assignments, unlocked_resources, max_workers_per_resource, completed_research,
           '{}'::jsonb, (SELECT jsonb_object_agg((today + g * 50)::text, 1) FROM generate_series(1, 60) g)
    FROM fiefs WHERE id = tmpl_id RETURNING id INTO small_id;

    -- Built: 400 mixed + 70 royal estates (housing for 2500) on the big fief, 100 on the outpost.
    INSERT INTO fief_buildings (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, resource_output, resource_cost, built_at, production_bonus_pct)
    SELECT f, initcap(replace(t, '_', ' ')), t, 1, 'Tier 1 construction', 6, 0, true, '{}'::jsonb, '{"wood": 10}'::jsonb, NOW(), '{}'::jsonb
    FROM (SELECT big_id AS f, (ARRAY['housing','wood_lodge','storage_shack','hunting_lodge','lumber_mill','quarry','watchtower','stables','irrigated_farm','mine'])[1 + (g % 10)] AS t FROM generate_series(1, 400) g
          UNION ALL SELECT big_id, 'royal_estate' FROM generate_series(1, 70)
          UNION ALL SELECT small_id, (ARRAY['housing','wood_lodge','storage_shack','watchtower'])[1 + (g % 4)] FROM generate_series(1, 100) g) s;

    -- 1000 queued, distinct queue positions, mixed durations.
    INSERT INTO fief_buildings (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, queue_position, resource_output, resource_cost, production_bonus_pct)
    SELECT big_id, initcap(replace(t, '_', ' ')), t, 1, 'Tier 1 construction', d, d, false, g, '{}'::jsonb, '{"wood": 10}'::jsonb, '{}'::jsonb
    FROM (SELECT g, (ARRAY['housing','wood_lodge','storage_shack','hunting_lodge','lumber_mill'])[1 + (g % 5)] AS t, 4 + (g % 9) AS d FROM generate_series(1, 1000) g) s;

    -- Troop training: 700 in flight (finishing over the next 90 days) + 800 already collected.
    INSERT INTO fief_training (fief_id, unit_type, count, training_days_required, days_remaining, status, started_day, complete_day, tier)
    SELECT big_id, 'Militia', 5 + (g % 40), 10, 1 + (g % 90), 'training', today, today + 1 + (g % 90), 1 FROM generate_series(1, 700) g;
    INSERT INTO fief_training (fief_id, unit_type, count, training_days_required, days_remaining, status, started_day, complete_day, tier)
    SELECT big_id, 'Militia', 5 + (g % 40), 10, 0, 'collected', today - 200, today - 190, 1 FROM generate_series(1, 800) g;

    INSERT INTO fief_animals (fief_id, animal_type, sex, quality, born_on_day)
    SELECT big_id, (ARRAY['cow','sheep','pig','chicken','goat','riding_horse'])[1 + (g % 6)],
           CASE WHEN g % 2 = 0 THEN 'male' ELSE 'female' END, 20 + (g % 60),
           CASE WHEN g % 10 = 0 THEN today - (g % 200) ELSE NULL END
    FROM generate_series(1, 1500) g;

    INSERT INTO fief_research_queue (fief_id, research_id, status, queue_position, campaign_day_started)
    VALUES (big_id, 'tier2_quarry', 'active', 1, today), (big_id, 'tier2_mine', 'queued', 2, today);
  END LOOP;
END $$;
ANALYZE;
