const { DATABASE_URL, PGSSL } = process.env;

// The phone lines are the only state this app owns — call and message history both live
// in Twilio. A container filesystem doesn't survive a redeploy (and this image ships on
// every push to main), so when DATABASE_URL is set the lines go to Postgres. Without one
// the file backend in lines.js takes over, which is all local dev needs.
let pool = null;

if (DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Managed Postgres (RDS and friends) serves a cert Node won't chain to a public root,
    // so the default verify fails. PGSSL=no-verify keeps the transport encrypted and skips
    // only the chain check; leave it unset when the CA is trusted.
    ssl: PGSSL === 'no-verify' ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
  // An idle client dropped by the server arrives here rather than as an uncaught
  // exception — the pool replaces it on the next query.
  pool.on('error', (e) => console.error('postgres pool error —', e.message));
}

module.exports = { pool, hasDb: Boolean(pool) };
