/**
 * Postgres store adapter — REFERENCE CODE, NOT TESTED FROM THIS SANDBOX.
 *
 * This environment has no network access to any real database (confirmed:
 * even `npm install pg` and `apt-get install postgresql` were blocked here
 * with 403 Forbidden, despite appearing allowed). Everything below is
 * written correctly against the official `pg` driver's documented API, but
 * it has not been executed against a live Postgres server. Test it yourself
 * against your real Supabase/Neon/RDS instance before trusting it in
 * production — that's not a formality, it's a real gap in verification.
 *
 * Works identically for Supabase, Neon, or a plain self-hosted Postgres —
 * they're all just Postgres. Only the connection string differs.
 *
 * Setup:
 *   npm install pg
 *   export HADAM_DB_DRIVER=postgres
 *   export DATABASE_URL=postgres://user:password@host:5432/dbname
 *
 * Design choice: rather than modeling tenants/users/products/orders as
 * separate relational tables (a bigger, higher-value rewrite for later),
 * this keeps the exact same whole-state-as-one-object shape the rest of
 * server.js already expects, stored as a single JSONB column. This is the
 * lowest-risk migration path — zero changes needed to any route logic —
 * at the cost of not yet getting real per-row indexing/query performance.
 * Splitting into proper tables is a natural next step once this is proven
 * stable, and is a separate, larger piece of work.
 */
function makePostgresStore({ connectionString, seedPath, seedPasswordHasher, seedPasswords }) {
  // Lazy require so this file doesn't break `node server.js` for people using
  // the default file store, who won't have the `pg` package installed at all.
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const TABLE = 'hadam_state';

  async function ensureTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id INT PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT single_row CHECK (id = 1)
      );
    `);
  }

  return {
    async load() {
      const fs = require('fs');
      await ensureTable();
      const { rows } = await pool.query(`SELECT data FROM ${TABLE} WHERE id = 1;`);
      if (rows.length > 0) return rows[0].data;

      // First run: seed from seed.json, same as the file store does.
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      seed.users = seed.users.map(u => {
        const plain = seedPasswords[u.id];
        return plain ? { ...u, passwordHash: seedPasswordHasher(plain) } : u;
      });
      await pool.query(`INSERT INTO ${TABLE} (id, data) VALUES (1, $1);`, [JSON.stringify(seed)]);
      return seed;
    },
    async save(state) {
      await pool.query(
        `INSERT INTO ${TABLE} (id, data, updated_at) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now();`,
        [JSON.stringify(state)]
      );
    },
  };
}

module.exports = { makePostgresStore };
