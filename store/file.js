/**
 * File-based store — the default, and the only one actually tested end to
 * end in this project (157/157 tests pass against it). Reads/writes the
 * entire application state as one JSON file.
 *
 * This is intentionally NOT how a real production database is used — it's
 * a single flat file with no locking, no concurrent-write safety, and no
 * query capability beyond "load everything into memory." It works well for
 * a single-process demo/reference build and for genuinely small deployments,
 * but should be swapped for a real backend (see postgres.js/mongo.js in this
 * folder) before relying on this under real concurrent traffic.
 */
const fs = require('fs');

function makeFileStore({ dbPath, seedPath, seedPasswordHasher, seedPasswords }) {
  return {
    async load() {
      if (!fs.existsSync(dbPath)) {
        const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        seed.users = seed.users.map(u => {
          const plain = seedPasswords[u.id];
          return plain ? { ...u, passwordHash: seedPasswordHasher(plain) } : u;
        });
        fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2));
        return seed;
      }
      return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    },
    async save(state) {
      fs.writeFileSync(dbPath, JSON.stringify(state, null, 2));
    },
  };
}

module.exports = { makeFileStore };
