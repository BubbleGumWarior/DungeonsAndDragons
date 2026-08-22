const { pool } = require('./database');

// Hunger is 0–100 ("how fed" — 100 = full). A long rest / day-skip drains 40.
const HUNGER_LOSS_PER_REST = 40;
const HUNGER_PER_RATION = 10;
const AUTO_FEED_EFFICIENCY = 0.25;
const SELF_FEED_EFFICIENCY = 1;

class FoodStockpile {
  static async getCampaignPrices(campaignId, dbClient = pool) {
    const result = await dbClient.query(
      `SELECT COALESCE(pet_food_meat_price, 5) AS meat_price,
              COALESCE(pet_food_veg_price, 3) AS veg_price
         FROM campaigns WHERE id = $1`,
      [campaignId]
    );
    return result.rows[0] || { meat_price: 85, veg_price: 42 };
  }

  static async setCampaignPrices(campaignId, { meatPrice, vegPrice }) {
    const result = await pool.query(
      `UPDATE campaigns
          SET pet_food_meat_price = COALESCE($1, pet_food_meat_price),
              pet_food_veg_price   = COALESCE($2, pet_food_veg_price)
        WHERE id = $3
       RETURNING pet_food_meat_price AS meat_price, pet_food_veg_price AS veg_price`,
      [meatPrice, vegPrice, campaignId]
    );
    return result.rows[0] || null;
  }

  static async getOrCreate(campaignId, characterId, dbClient = pool) {
    let result = await dbClient.query(
      `SELECT * FROM character_food_stockpiles WHERE campaign_id = $1 AND character_id = $2`,
      [campaignId, characterId]
    );
    if (result.rows.length > 0) return result.rows[0];

    result = await dbClient.query(
      `INSERT INTO character_food_stockpiles (campaign_id, character_id, meat_rations, veg_rations)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET updated_at = character_food_stockpiles.updated_at
       RETURNING *`,
      [campaignId, characterId]
    );
    return result.rows[0];
  }

  static async getForCampaign(campaignId) {
    const prices = await FoodStockpile.getCampaignPrices(campaignId);
    // One row per character in the campaign — create-on-read for any character without a stockpile yet.
    const characters = (await pool.query(
      `SELECT id, name FROM characters WHERE campaign_id = $1 ORDER BY name ASC`, [campaignId]
    )).rows;
    const stockpiles = [];
    for (const ch of characters) {
      const row = await FoodStockpile.getOrCreate(campaignId, ch.id);
      stockpiles.push({ ...row, character_name: ch.name });
    }
    return { stockpiles, prices };
  }

  static async getForCharacter(campaignId, characterId) {
    const prices = await FoodStockpile.getCampaignPrices(campaignId);
    const row = await FoodStockpile.getOrCreate(campaignId, characterId);
    return { stockpile: row, prices };
  }

  static async setMaxSlots(campaignId, characterId, maxSlots) {
    const row = await FoodStockpile.getOrCreate(campaignId, characterId);
    const result = await pool.query(
      `UPDATE character_food_stockpiles SET max_slots = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [Math.max(0, parseInt(maxSlots, 10) || 0), row.id]
    );
    return result.rows[0];
  }

  // Buys `quantity` rations of `rationType` ('meat'|'veg') for `characterId`, paid for by that same character's gold.
  static async buyRations(campaignId, { characterId, rationType, quantity }) {
    if (!['meat', 'veg'].includes(rationType)) throw Object.assign(new Error('Invalid ration type'), { status: 400 });
    const qty = Math.max(1, parseInt(quantity, 10) || 0);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const prices = await FoodStockpile.getCampaignPrices(campaignId, client);
      const price = rationType === 'meat' ? Number(prices.meat_price) : Number(prices.veg_price);
      const totalCost = price * qty;

      const charResult = await client.query(
        `SELECT id, gold FROM characters WHERE id = $1 FOR UPDATE`,
        [characterId]
      );
      const character = charResult.rows[0];
      if (!character) throw Object.assign(new Error('Character not found'), { status: 404 });
      if (Number(character.gold) < totalCost) {
        throw Object.assign(new Error(`Not enough gold — need ${totalCost}, have ${character.gold}`), { status: 400 });
      }

      const stockRow = await FoodStockpile.getOrCreate(campaignId, characterId, client);
      const stockLocked = (await client.query(
        `SELECT * FROM character_food_stockpiles WHERE id = $1 FOR UPDATE`, [stockRow.id]
      )).rows[0];
      const currentTotal = Number(stockLocked.meat_rations) + Number(stockLocked.veg_rations);
      if (currentTotal + qty > stockLocked.max_slots) {
        throw Object.assign(new Error(`Stockpile full — capacity is ${stockLocked.max_slots}, already holding ${currentTotal}`), { status: 400 });
      }

      await client.query(`UPDATE characters SET gold = gold - $1 WHERE id = $2`, [totalCost, characterId]);
      const column = rationType === 'meat' ? 'meat_rations' : 'veg_rations';
      const updated = await client.query(
        `UPDATE character_food_stockpiles SET ${column} = ${column} + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [qty, stockLocked.id]
      );

      await client.query('COMMIT');
      return { stockpile: updated.rows[0], totalCost, remainingGold: Number(character.gold) - totalCost };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // DM-only: grant (or remove, with a negative quantity) rations directly, bypassing gold entirely.
  // Clamps to [0, max_slots] rather than erroring, since this is a manual DM override tool.
  static async grantRations(campaignId, { characterId, rationType, quantity }) {
    if (!['meat', 'veg'].includes(rationType)) throw Object.assign(new Error('Invalid ration type'), { status: 400 });
    const delta = parseInt(quantity, 10) || 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stockRow = await FoodStockpile.getOrCreate(campaignId, characterId, client);
      const stockLocked = (await client.query(
        `SELECT * FROM character_food_stockpiles WHERE id = $1 FOR UPDATE`, [stockRow.id]
      )).rows[0];

      const column = rationType === 'meat' ? 'meat_rations' : 'veg_rations';
      const otherColumn = rationType === 'meat' ? 'veg_rations' : 'meat_rations';
      const otherAmount = Number(stockLocked[otherColumn]);
      const maxForThis = Math.max(0, stockLocked.max_slots - otherAmount);
      const newAmount = Math.max(0, Math.min(maxForThis, Number(stockLocked[column]) + delta));

      const updated = await client.query(
        `UPDATE character_food_stockpiles SET ${column} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [newAmount, stockLocked.id]
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Draw-order feeding helper shared by manual "Feed" actions and the long-rest tick.
  // `stock` is a plain { meat_rations, veg_rations } object mutated in place.
  // Returns { hunger, rationsConsumed }.
  static consume(stock, diet, rationsWanted, hunger, efficiency) {
    const drawOrder = diet === 'herbivore' ? ['veg'] : diet === 'carnivore' ? ['meat'] : ['meat', 'veg'];
    let remaining = Math.max(0, rationsWanted);
    let rationsConsumed = 0;
    for (const type of drawOrder) {
      if (remaining <= 0) break;
      const key = type === 'meat' ? 'meat_rations' : 'veg_rations';
      const available = Number(stock[key] || 0);
      const take = Math.min(available, remaining);
      if (take > 0) {
        stock[key] = available - take;
        remaining -= take;
        rationsConsumed += take;
      }
    }
    const newHunger = Math.min(100, Math.max(0, hunger) + rationsConsumed * HUNGER_PER_RATION * efficiency);
    return { hunger: Math.round(newHunger), rationsConsumed };
  }

  // Manual "Feed" action — self-feed, full efficiency. Owner/DM initiated, any time.
  static async feedAnimal({ kind, id, campaignId, characterId, diet, hunger, foodConsumption, rations }) {
    const table = kind === 'pet' ? 'character_pets' : 'campaign_mounts';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stockRow = await FoodStockpile.getOrCreate(campaignId, characterId, client);
      const stockLocked = (await client.query(
        `SELECT * FROM character_food_stockpiles WHERE id = $1 FOR UPDATE`, [stockRow.id]
      )).rows[0];

      const wanted = rations !== undefined && rations !== null ? Math.max(1, parseInt(rations, 10) || 0) : Number(foodConsumption || 4);
      const stock = { meat_rations: Number(stockLocked.meat_rations), veg_rations: Number(stockLocked.veg_rations) };
      const { hunger: newHunger, rationsConsumed } = FoodStockpile.consume(stock, diet, wanted, hunger, SELF_FEED_EFFICIENCY);

      if (rationsConsumed > 0) {
        await client.query(
          `UPDATE character_food_stockpiles SET meat_rations = $1, veg_rations = $2, updated_at = NOW() WHERE id = $3`,
          [stock.meat_rations, stock.veg_rations, stockLocked.id]
        );
      }
      const updatedAnimal = await client.query(
        `UPDATE ${table} SET hunger = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [newHunger, id]
      );

      await client.query('COMMIT');
      return {
        animal: updatedAnimal.rows[0],
        rationsConsumed,
        stockpile: { ...stockLocked, ...stock },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Long-rest / day-skip hunger tick. Runs entirely inside the caller's transaction `client`.
  // Mutates and persists hunger for every pet/mount, and every touched character's stockpile.
  // Returns { petFoodUpdates: [{kind,id,hunger}], stockpileUpdates: [{characterId,meat_rations,veg_rations}] }.
  static async runRestTick(client, campaignId, days) {
    const petFoodUpdates = [];
    const stockpileUpdates = [];
    if (!(days > 0)) return { petFoodUpdates, stockpileUpdates };

    const tableCheck = await client.query(`SELECT to_regclass('public.character_food_stockpiles') AS t`);
    if (!tableCheck.rows[0]?.t) return { petFoodUpdates, stockpileUpdates };

    const petsResult = await client.query(
      `SELECT id, diet, food_consumption, hunger, feeding_mode, character_id
         FROM character_pets WHERE campaign_id = $1`,
      [campaignId]
    );
    const mountsTableCheck = await client.query(`SELECT to_regclass('public.campaign_mounts') AS t`);
    const mountsResult = mountsTableCheck.rows[0]?.t ? await client.query(
      `SELECT id, diet, food_consumption, hunger, feeding_mode, assigned_to_character_id AS character_id
         FROM campaign_mounts WHERE campaign_id = $1 AND assigned_to_character_id IS NOT NULL`,
      [campaignId]
    ) : { rows: [] };

    const animals = [
      ...petsResult.rows.map(r => ({ ...r, kind: 'pet' })),
      ...mountsResult.rows.map(r => ({ ...r, kind: 'mount' })),
    ].filter(a => a.character_id);

    if (animals.length === 0) return { petFoodUpdates, stockpileUpdates };

    const characterIds = [...new Set(animals.map(a => a.character_id))];
    const stockpiles = new Map();
    for (const cid of characterIds) {
      const row = await FoodStockpile.getOrCreate(campaignId, cid, client);
      stockpiles.set(cid, { id: row.id, meat_rations: Number(row.meat_rations), veg_rations: Number(row.veg_rations) });
    }

    for (let tick = 0; tick < days; tick++) {
      for (const animal of animals) {
        let hunger = Math.max(0, Number(animal.hunger) - HUNGER_LOSS_PER_REST);
        if (animal.feeding_mode === 'automatic') {
          const stock = stockpiles.get(animal.character_id);
          const { hunger: fedHunger } = FoodStockpile.consume(stock, animal.diet, Number(animal.food_consumption || 0), hunger, AUTO_FEED_EFFICIENCY);
          hunger = fedHunger;
        }
        animal.hunger = hunger;
      }
    }

    for (const animal of animals) {
      const table = animal.kind === 'pet' ? 'character_pets' : 'campaign_mounts';
      await client.query(`UPDATE ${table} SET hunger = $1, updated_at = NOW() WHERE id = $2`, [Math.round(animal.hunger), animal.id]);
      petFoodUpdates.push({ kind: animal.kind, id: animal.id, hunger: Math.round(animal.hunger) });
    }
    for (const [cid, stock] of stockpiles) {
      await client.query(
        `UPDATE character_food_stockpiles SET meat_rations = $1, veg_rations = $2, updated_at = NOW() WHERE id = $3`,
        [stock.meat_rations, stock.veg_rations, stock.id]
      );
      stockpileUpdates.push({ characterId: cid, meat_rations: stock.meat_rations, veg_rations: stock.veg_rations });
    }

    return { petFoodUpdates, stockpileUpdates };
  }
}

module.exports = FoodStockpile;
