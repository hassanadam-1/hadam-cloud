/**
 * MongoDB store adapter — REFERENCE CODE, NOT TESTED FROM THIS SANDBOX.
 * Same caveat as postgres.js: written correctly against the official
 * `mongodb` driver's documented API, but never executed against a live
 * MongoDB server from this environment (no network access to test with).
 * Verify it against your real Atlas cluster before trusting it in production.
 *
 * Works identically for MongoDB Atlas or a self-hosted MongoDB — only the
 * connection string differs.
 *
 * Setup:
 *   npm install mongodb
 *   export HADAM_DB_DRIVER=mongo
 *   export MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/hadam
 *
 * Same design choice as the Postgres adapter: the whole application state
 * is stored as a single document in one collection, rather than splitting
 * into per-collection documents (products, orders, etc.) yet. Lowest-risk
 * migration path first; a real per-collection model is natural follow-up
 * work once this is proven stable against your actual cluster.
 */
function makeMongoStore({ uri, dbName = 'hadam', seedPath, seedPasswordHasher, seedPasswords }) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri);
  const COLLECTION = 'hadam_state';
  let connected = false;

  async function getCollection() {
    if (!connected) { await client.connect(); connected = true; }
    return client.db(dbName).collection(COLLECTION);
  }

  return {
    async load() {
      const fs = require('fs');
      const col = await getCollection();
      const doc = await col.findOne({ _id: 'state' });
      if (doc) { const { _id, ...state } = doc; return state; }

      // First run: seed from seed.json, same as the file store does.
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      seed.users = seed.users.map(u => {
        const plain = seedPasswords[u.id];
        return plain ? { ...u, passwordHash: seedPasswordHasher(plain) } : u;
      });
      await col.insertOne({ _id: 'state', ...seed });
      return seed;
    },
    async save(state) {
      const col = await getCollection();
      await col.replaceOne({ _id: 'state' }, { _id: 'state', ...state }, { upsert: true });
    },
  };
}

module.exports = { makeMongoStore };
