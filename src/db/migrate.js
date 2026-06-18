const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function migrate() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const appliedResult = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');

      console.log(`Applied migration ${file}`);
    }

    if (files.every((file) => applied.has(file))) {
      console.log('No pending migrations');
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      if (rollbackError.code !== '25P01') {
        console.error('Rollback failed', rollbackError);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { migrate };
