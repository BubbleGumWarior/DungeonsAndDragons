const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function populateRemainingClassesSubclass() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding subclass features for remaining classes...');
    
    // LEVEL 1 SUBCLASS SELECTION - Cleric, Sorcerer, Warlock
    
    // Cleric - Level 1
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Cleric', NULL, 1, 'Divine Domain', 'Choose a divine domain related to your deity: Life, War, or Trickery. Your choice grants you domain spells and other features at 1st level and again at 2nd, 6th, 8th, and 17th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Sorcerer - Level 1
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Sorcerer', NULL, 1, 'Sorcerous Origin', 'Choose a sorcerous origin, which describes the source of your innate magical power: Draconic Bloodline, Wild Magic, or Divine Soul. Your choice grants you features at 1st level and again at 6th, 14th, and 18th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Warlock - Level 1
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Warlock', NULL, 1, 'Otherworldly Patron', 'Choose the otherworldly patron you have struck a bargain with: The Fiend, The Archfey, or The Great Old One. Your choice grants you features at 1st level and again at 6th, 10th, and 14th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // LEVEL 2 SUBCLASS SELECTION - Druid, Wizard
    
    // Druid - Level 2
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Druid', NULL, 2, 'Druid Circle', 'Choose a circle of druids to join: Circle of the Land, Circle of the Moon, or Circle of Dreams. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Wizard - Level 2
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Wizard', NULL, 2, 'Arcane Tradition', 'Choose one arcane tradition that shapes your practice of magic: School of Evocation, School of Abjuration, or School of Divination. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // LEVEL 3 SUBCLASS SELECTION - Bard, Monk, Paladin, Ranger
    
    // Bard - Level 3
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Bard', NULL, 3, 'Bard College', 'Choose a bard college to study at: College of Lore, College of Valor, or College of Glamour. Your choice grants you features at 3rd level and again at 6th and 14th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Monk - Level 3
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Monk', NULL, 3, 'Monastic Tradition', 'Choose a monastic tradition to follow: Way of the Open Hand, Way of Shadow, or Way of the Four Elements. Your choice grants you features at 3rd level and again at 6th, 11th, and 17th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Paladin - Level 3
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Paladin', NULL, 3, 'Sacred Oath', 'Choose a sacred oath to uphold: Oath of Devotion, Oath of the Ancients, or Oath of Vengeance. Your choice grants you features at 3rd level and again at 7th, 15th, and 20th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Ranger - Level 3
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Ranger', NULL, 3, 'Ranger Archetype', 'Choose a ranger archetype to emulate: Hunter, Beast Master, or Gloom Stalker. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    await client.query('COMMIT');
    console.log('✅ Remaining class subclass features added successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding class subclass features:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

populateRemainingClassesSubclass();
