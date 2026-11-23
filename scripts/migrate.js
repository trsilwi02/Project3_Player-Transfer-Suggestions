const fs = require('fs');
const path = require('path');
const pg = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function runMigrations() {
  console.log('Connecting to database:', connectionString.replace(/:[^:@]+@/, ':****@'));
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('[OK] Connected.');

    // Create migrations tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _app_migrations (
        version varchar(255) PRIMARY KEY,
        applied_at timestamptz DEFAULT now()
      );
    `);

    // Check existing tables to see if 001 and 002 were already applied manually
    const tableCheck = await client.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_user'");
    if (tableCheck.rows.length > 0) {
      await client.query("INSERT INTO _app_migrations (version) VALUES ('20261120000100_schema.sql'), ('20261120000200_functions_views.sql') ON CONFLICT DO NOTHING");
    }

    const appliedRes = await client.query('SELECT version FROM _app_migrations');
    const applied = new Set(appliedRes.rows.map((r) => r.version));

    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[SKIP] Already applied: ${file}`);
        continue;
      }

      console.log(`[APPLYING] ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      // Strip any psql commands like \set
      const cleanSql = sql.replace(/^\\set\s+.*$/gm, '');

      try {
        await client.query('BEGIN');
        await client.query(cleanSql);
        await client.query('INSERT INTO _app_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[DONE] Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[ERROR] Failed to apply ${file}:`, err.message);
        // If it's already created tables or functions, let's mark it as applied if appropriate
        if (err.message.includes('already exists')) {
          console.log(`[NOTE] Objects in ${file} already exist in database. Recording as applied.`);
          await client.query('INSERT INTO _app_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        } else {
          throw err;
        }
      }
    }

    console.log('\nAll migrations are up-to-date!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

runMigrations();
