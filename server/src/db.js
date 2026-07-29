const { Pool } = require('pg');

/**
 * One shared connection pool for the whole application.
 * Opening a new database connection for every request would
 * exhaust PostgreSQL very quickly.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// A pooled connection can fail while sitting idle (for example if the
// database restarts). Without this handler, that error is unhandled
// and crashes the whole server process.
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
});

/**
 * The ONLY approved way to talk to the database.
 *
 * `text`   - SQL with $1, $2 ... placeholders. Always a fixed string.
 * `params` - the user-supplied values, passed separately.
 */
async function query(text, params) {
  const started = Date.now();
  const result = await pool.query(text, params);

  if (process.env.NODE_ENV === 'development') {
    // Log only the query shape and timing.
    // Deliberately NOT logging `params` - they contain passwords,
    // MFA secrets and personal data.
    const shape = text.replace(/\s+/g, ' ').trim().slice(0, 70);
    console.log(`[db] ${Date.now() - started}ms rows=${result.rowCount} :: ${shape}`);
  }

  return result;
}

module.exports = { pool, query };