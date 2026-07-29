/**
 * Store selector. This is the actual "works with any backend" mechanism:
 * server.js only ever calls store.load() and store.save(state) — it has no
 * idea whether that's a JSON file, Postgres, or MongoDB underneath. Switch
 * backends with one environment variable, no code changes elsewhere.
 *
 *   HADAM_DB_DRIVER=file      (default — the only one tested in this project)
 *   HADAM_DB_DRIVER=postgres  (Supabase, Neon, or any Postgres — reference code, untested here)
 *   HADAM_DB_DRIVER=mongo     (MongoDB Atlas or self-hosted — reference code, untested here)
 */
const path = require('path');
const { makeFileStore } = require('./file');

function createStore({ dbPath, seedPath, seedPasswordHasher, seedPasswords }) {
  const driver = process.env.HADAM_DB_DRIVER || 'file';

  if (driver === 'file') {
    return makeFileStore({ dbPath, seedPath, seedPasswordHasher, seedPasswords });
  }
  if (driver === 'postgres') {
    const { makePostgresStore } = require('./postgres');
    if (!process.env.DATABASE_URL) throw new Error('HADAM_DB_DRIVER=postgres requires DATABASE_URL to be set.');
    return makePostgresStore({ connectionString: process.env.DATABASE_URL, seedPath, seedPasswordHasher, seedPasswords });
  }
  if (driver === 'mongo') {
    const { makeMongoStore } = require('./mongo');
    if (!process.env.MONGODB_URI) throw new Error('HADAM_DB_DRIVER=mongo requires MONGODB_URI to be set.');
    return makeMongoStore({ uri: process.env.MONGODB_URI, seedPath, seedPasswordHasher, seedPasswords });
  }
  throw new Error(`Unknown HADAM_DB_DRIVER: "${driver}". Use file, postgres, or mongo.`);
}

module.exports = { createStore };
