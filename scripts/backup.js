#!/usr/bin/env node
/**
 * Hadam — database backup script.
 *
 * What this actually does right now: copies data/db.json to backups/,
 * timestamped, and prunes old copies beyond a retention count. This works
 * today regardless of which cloud database you eventually move to —
 * moving to Postgres/Mongo later just means replacing the "copy the file"
 * step below with `pg_dump`/`mongodump`, everything else here (scheduling,
 * retention, optional cloud upload) stays the same.
 *
 * Run it manually:
 *   node scripts/backup.js
 *
 * Run it daily automatically:
 *   - Linux/Mac (cron): add a line like this to `crontab -e`
 *       0 3 * * * cd /path/to/hadam-cloud && node scripts/backup.js >> backups/backup.log 2>&1
 *   - Windows: use Task Scheduler to run
 *       node C:\path\to\hadam-cloud\scripts\backup.js
 *     once a day (Task Scheduler → Create Task → Trigger: Daily → Action: node.exe with that argument).
 *
 * Uploading to the cloud: this script does NOT upload anywhere by itself —
 * I can't test real cloud credentials from this environment (no network
 * access here). The straightforward way to add it once you have a real
 * account: after the backup file is written below, pipe it through the
 * provider's CLI, e.g.:
 *   aws s3 cp <backup file> s3://your-bucket/          (AWS S3)
 *   rclone copy <backup file> remote:your-bucket/        (Cloudflare R2, B2, etc. via rclone)
 * Both of those are one extra line appended after RETAIN_COUNT below —
 * tell me which provider you land on and I'll wire that line in for real.
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.HADAM_DB_PATH || path.join(__dirname, '..', 'data', 'db.json');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const RETAIN_COUNT = Number(process.env.HADAM_BACKUP_RETAIN || 30); // keep the last 30 backups by default

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backup] No database file found at ${DB_PATH} — nothing to back up.`);
    process.exit(1);
  }
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dest = path.join(BACKUP_DIR, `db-backup-${timestamp()}.json`);
  fs.copyFileSync(DB_PATH, dest);
  const sizeKb = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`[backup] Wrote ${dest} (${sizeKb} KB)`);

  // Prune old backups beyond the retention count.
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('db-backup-') && f.endsWith('.json'))
    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  const toDelete = files.slice(RETAIN_COUNT);
  toDelete.forEach(f => {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    console.log(`[backup] Pruned old backup: ${f.name}`);
  });

  console.log(`[backup] Done. ${Math.min(files.length, RETAIN_COUNT)} backup(s) retained.`);
}

main();
