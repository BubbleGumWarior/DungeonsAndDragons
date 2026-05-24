require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD }
);

async function main() {
  // Check kingdoms table
  console.log('\n=== KINGDOMS (last 10) ===');
  const kResult = await pool.query(
    `SELECT id, name, campaign_id,
       CASE WHEN location_modifiers IS NOT NULL THEN location_modifiers::text ELSE 'COLUMN MISSING' END AS location_modifiers
     FROM kingdoms ORDER BY id DESC LIMIT 10`
  );
  console.log(JSON.stringify(kResult.rows, null, 2));

  // Check fiefs table
  console.log('\n=== FIEFS (last 10) ===');
  const fResult = await pool.query(
    `SELECT id, name, kingdom_id,
       CASE WHEN location_modifiers IS NOT NULL THEN location_modifiers::text ELSE 'COLUMN MISSING' END AS location_modifiers
     FROM fiefs ORDER BY id DESC LIMIT 10`
  );
  console.log(JSON.stringify(fResult.rows, null, 2));

  // Check if columns exist
  console.log('\n=== COLUMN EXISTENCE CHECK ===');
  const colResult = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_name IN ('kingdoms','fiefs') AND column_name = 'location_modifiers'
     ORDER BY table_name`
  );
  console.log(JSON.stringify(colResult.rows, null, 2));
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end());
