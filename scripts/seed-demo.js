const fs = require('fs');
const path = require('path');
const pg = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function seedDemoData() {
  const seedFile = path.join(__dirname, '..', 'data', 'demo_seed.sql');
  if (!fs.existsSync(seedFile)) {
    console.error('File data/demo_seed.sql not found. Run npm run generate:demo first.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new pg.Client({
    connectionString,
    ssl: connectionString && !/localhost|127\.0\.0\.1/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    console.log('[OK] Connected to Supabase PostgreSQL.');

    // Check existing players
    const pCountRes = await client.query('SELECT count(*) as count FROM player');
    const existingCount = parseInt(pCountRes.rows[0].count, 10);
    console.log(`Current player count in database: ${existingCount}`);

    if (existingCount >= 5000) {
      console.log('Database already has 5,000+ players. Skipping seeding.');
      return;
    }

    console.log('Reading data/demo_seed.sql...');
    const rawSql = fs.readFileSync(seedFile, 'utf-8');
    const lines = rawSql.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith('--'));

    console.log(`Executing ${lines.length} SQL statements in chunks...`);

    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(lines.length / BATCH_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = lines.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      const batchSql = batch.join('\n');

      await client.query('BEGIN');
      try {
        await client.query(batchSql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error in batch ${i + 1}/${totalBatches}:`, err.message);
        throw err;
      }

      if ((i + 1) % 10 === 0 || i === totalBatches - 1) {
        const pct = Math.round(((i + 1) / totalBatches) * 100);
        console.log(`[PROGRESS] ${pct}% (${i + 1}/${totalBatches} batches)`);
      }
    }

    console.log('\n[SUCCESS] Demo data seeded successfully!');

    // Refresh percentiles & role scores for the latest season
    console.log('Refreshing percentiles and role scores for 2025/2026...');
    try {
      await client.query("SELECT fn_refresh_percentiles('2025/2026')");
      await client.query("SELECT fn_refresh_role_scores('2025/2026')");
      console.log('[SUCCESS] Percentiles & role scores refreshed!');
    } catch (refErr) {
      console.warn('[WARN] Refresh scores skipped or failed:', refErr.message);
    }
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

seedDemoData();
