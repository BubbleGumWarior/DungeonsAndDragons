const { pool } = require('../models/database');

async function addFamilyTree() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS family_members (
        id              SERIAL PRIMARY KEY,
        campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id    INTEGER REFERENCES characters(id) ON DELETE SET NULL,
        name            VARCHAR(255) NOT NULL,
        race            VARCHAR(50) NOT NULL DEFAULT 'Human',
        image_data      BYTEA,
        image_mime_type VARCHAR(50),
        abilities       JSONB NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'::jsonb,
        skills          JSONB NOT NULL DEFAULT '[]'::jsonb,
        base_age        INTEGER NOT NULL DEFAULT 13,
        is_dead         BOOLEAN NOT NULL DEFAULT FALSE,
        created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_members_campaign ON family_members(campaign_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_members_character ON family_members(character_id)`);
    console.log('✅ family_members table ensured');

    await client.query(`
      CREATE TABLE IF NOT EXISTS family_relationships (
        id                 SERIAL PRIMARY KEY,
        campaign_id        INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        relationship_type  VARCHAR(20) NOT NULL CHECK (relationship_type IN ('spouse','parent_child')),
        member_a_id        INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
        member_b_id        INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
        created_at         TIMESTAMP DEFAULT NOW(),
        UNIQUE (relationship_type, member_a_id, member_b_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_relationships_campaign ON family_relationships(campaign_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_relationships_a ON family_relationships(member_a_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_relationships_b ON family_relationships(member_b_id)`);
    console.log('✅ family_relationships table ensured');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_family_tree migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addFamilyTree;

if (require.main === module) {
  addFamilyTree()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
