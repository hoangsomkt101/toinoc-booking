const { Pool } = require('pg');
const { databaseUrl, dbSsl } = require('../config');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: dbSsl ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL client error', error);
});

async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (...args) => pool.query(...args),
  withTransaction,
  close: () => pool.end()
};
