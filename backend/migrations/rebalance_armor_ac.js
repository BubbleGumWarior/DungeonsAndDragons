const { pool } = require('../models/database');

/**
 * Migration: rebalance_armor_ac
 *
 * Converts built-in armor items from full replacement AC values to small
 * additive bonuses so that equipped armor adds to a character's base AC
 * rather than overriding it entirely.
 *
 * Approved bonus mapping:
 *   Leather Armor  → +1  (chest)
 *   Chain Mail     → +3  (chest)
 *   Scale Mail     → +4  (chest)
 *   Plate Armor    → +8  (chest)
 *   Shield         → +2  (hands)
 *   Steel Helmet   → +1  (head)
 *   Leather Boots  → +1  (feet)
 *   Steel Boots    → +2  (feet)
 *
 * The migration is idempotent: it checks whether the value is already the
 * target bonus before updating, so running it multiple times is safe.
 */

const ARMOR_REBALANCE = [
  { item_name: 'Leather Armor', armor_class: 1,  limb_armor_class: { chest: 1 } },
  { item_name: 'Chain Mail',    armor_class: 3,  limb_armor_class: { chest: 3 } },
  { item_name: 'Scale Mail',    armor_class: 4,  limb_armor_class: { chest: 4 } },
  { item_name: 'Plate Armor',   armor_class: 8,  limb_armor_class: { chest: 8 } },
  { item_name: 'Shield',        armor_class: 6,  limb_armor_class: { hands: 6 } },
  { item_name: 'Steel Helmet',  armor_class: 1,  limb_armor_class: { head: 1  } },
  { item_name: 'Leather Boots', armor_class: 1,  limb_armor_class: { feet: 1  } },
  { item_name: 'Steel Boots',   armor_class: 2,  limb_armor_class: { feet: 2  } },
];

async function rebalanceArmorAc() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const entry of ARMOR_REBALANCE) {
      // Only update rows that still hold old (pre-rebalance) values so the
      // migration is safe to run more than once.
      const result = await client.query(
        `UPDATE inventory
            SET armor_class      = $1,
                limb_armor_class = $2,
                updated_at       = CURRENT_TIMESTAMP
          WHERE item_name  = $3
            AND armor_class <> $1`,
        [entry.armor_class, JSON.stringify(entry.limb_armor_class), entry.item_name]
      );
      if (result.rowCount > 0) {
        console.log(`  ✅  Rebalanced "${entry.item_name}" → AC +${entry.armor_class}`);
      } else {
        console.log(`  ⏭  "${entry.item_name}" already at target value, skipped`);
      }
    }

    await client.query('COMMIT');
    console.log('Migration rebalance_armor_ac completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration rebalance_armor_ac failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = rebalanceArmorAc;
