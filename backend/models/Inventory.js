const { pool } = require('./database');

class Inventory {
  // Get all items
  static async getAllItems() {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory 
        ORDER BY category, subcategory, item_name
      `);
      
      return result.rows.map(item => ({
        ...item,
        properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
      }));
    } catch (error) {
      throw error;
    }
  }

  // Get items by category
  static async getItemsByCategory(category) {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory 
        WHERE category = $1
        ORDER BY subcategory, item_name
      `, [category]);
      
      return result.rows.map(item => ({
        ...item,
        properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
      }));
    } catch (error) {
      throw error;
    }
  }

  // Get item by name
  static async getItemByName(itemName) {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory 
        WHERE item_name = $1
      `, [itemName]);
      
      if (result.rows.length === 0) return null;
      
      const item = result.rows[0];
      return {
        ...item,
        properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
      };
    } catch (error) {
      throw error;
    }
  }

  // Get items by names (for character equipment lookup)
  static async getItemsByNames(itemNames) {
    try {
      if (!itemNames || itemNames.length === 0) return [];
      
      const placeholders = itemNames.map((_, index) => `$${index + 1}`).join(', ');
      const result = await pool.query(`
        SELECT * FROM inventory 
        WHERE item_name = ANY($1)
        ORDER BY item_name
      `, [itemNames]);
      
      return result.rows.map(item => ({
        ...item,
        properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
      }));
    } catch (error) {
      throw error;
    }
  }

  // Get equipment grouped by category (for character creation)
  static async getEquipmentForCharacterCreation() {
    try {
      const result = await pool.query(`
        SELECT * FROM inventory 
        ORDER BY category, subcategory, item_name
      `);
      
      const equipment = {
        weapons: [],
        armor: [],
        tools: [],
        general: []
      };

      result.rows.forEach(item => {
        const parsedItem = {
          ...item,
          properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
        };

        switch (item.category) {
          case 'Weapon':
            equipment.weapons.push(parsedItem);
            break;
          case 'Armor':
            equipment.armor.push(parsedItem);
            break;
          case 'Tool':
            equipment.tools.push(parsedItem);
            break;
          case 'General':
            equipment.general.push(parsedItem);
            break;
        }
      });

      return equipment;
    } catch (error) {
      throw error;
    }
  }

  // Add new item (for future admin functionality)
  static async addItem(itemData) {
    const {
      item_name,
      category,
      subcategory,
      description,
      damage_dice,
      damage_type,
      range_normal,
      range_long,
      weight,
      cost_cp,
      armor_class,
      strength_requirement,
      stealth_disadvantage,
      properties,
      rarity,
      attunement_required
    } = itemData;

    try {
      const result = await pool.query(`
        INSERT INTO inventory (
          item_name, category, subcategory, description, damage_dice,
          damage_type, range_normal, range_long, weight, cost_cp,
          armor_class, strength_requirement, stealth_disadvantage,
          properties, rarity, attunement_required
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        item_name, category, subcategory, description, damage_dice,
        damage_type, range_normal, range_long, weight, cost_cp,
        armor_class, strength_requirement, stealth_disadvantage,
        JSON.stringify(properties), rarity, attunement_required
      ]);

      const item = result.rows[0];
      return {
        ...item,
        properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
      };
    } catch (error) {
      throw error;
    }
  }

  // Create custom item (alias for addItem with DM context)
  static async createCustomItem(itemData) {
    return this.addItem(itemData);
  }

  // Update item
  static async updateItem(itemName, updateData) {
    const validFields = [
      'category', 'subcategory', 'description', 'damage_dice', 'damage_type',
      'range_normal', 'range_long', 'weight', 'cost_cp', 'armor_class',
      'strength_requirement', 'stealth_disadvantage', 'properties', 'rarity',
      'attunement_required'
    ];

    const updates = [];
    const values = [itemName];
    let paramCount = 2;

    Object.keys(updateData).forEach(key => {
      if (validFields.includes(key)) {
        updates.push(`${key} = $${paramCount}`);
        if (key === 'properties') {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
        paramCount++;
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields provided for update');
    }

    try {
      const result = await pool.query(`
        UPDATE inventory 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE item_name = $1
        RETURNING *
      `, values);

      if (result.rows.length === 0) return null;

      const item = result.rows[0];
      return {
        ...item,
        properties: typeof item.properties === 'string' ? JSON.parse(item.properties) : item.properties
      };
    } catch (error) {
      throw error;
    }
  }

  // Delete item
  static async deleteItem(itemName) {
    try {
      const result = await pool.query(`
        DELETE FROM inventory 
        WHERE item_name = $1
        RETURNING item_name
      `, [itemName]);

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Inventory;