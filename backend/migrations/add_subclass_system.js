const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function addSubclassSystem() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Creating subclasses table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS subclasses (
        id SERIAL PRIMARY KEY,
        class VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(class, name)
      )
    `);
    
    console.log('Creating class_features table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_features (
        id SERIAL PRIMARY KEY,
        class VARCHAR(50) NOT NULL,
        subclass_id INTEGER REFERENCES subclasses(id) ON DELETE CASCADE,
        level INTEGER NOT NULL CHECK (level >= 1 AND level <= 20),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        is_choice BOOLEAN DEFAULT FALSE,
        choice_count INTEGER DEFAULT 0,
        choice_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Creating character_subclasses table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS character_subclasses (
        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        subclass_id INTEGER REFERENCES subclasses(id) ON DELETE CASCADE,
        selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (character_id)
      )
    `);
    
    console.log('Creating character_feature_choices table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS character_feature_choices (
        id SERIAL PRIMARY KEY,
        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        feature_id INTEGER REFERENCES class_features(id) ON DELETE CASCADE,
        choice_name VARCHAR(200) NOT NULL,
        choice_description TEXT,
        selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(character_id, feature_id, choice_name)
      )
    `);
    
    console.log('Adding hit_points_max column to characters...');
    await client.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS hit_points_max INTEGER DEFAULT 0
    `);
    
    await client.query('COMMIT');
    console.log('✅ Subclass system tables created successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating subclass system:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addSubclassSystem;

// Auto-execute only if run directly
if (require.main === module) {
  addSubclassSystem();
}
