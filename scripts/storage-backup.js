/**
 * Hadam Storage backup script.
 *
 * Downloads every file from every bucket in Supabase Storage into a local
 * folder structure that mirrors the bucket layout exactly, so it can be
 * re-uploaded 1:1 during a real recovery. This is necessary because neither
 * Supabase's daily backups nor PITR cover Storage objects at all -- only
 * the Postgres database itself. Confirmed via Supabase's own documentation
 * during tonight's Management API research.
 *
 * SECURITY: credentials are read from environment variables, never
 * hardcoded here. Run it like:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx node storage-backup.js
 *
 * Requires: npm install @supabase/supabase-js (already a Hadam dependency)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUTPUT_DIR = process.env.STORAGE_BACKUP_DIR || path.join(__dirname, 'storage-backup');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as environment variables.');
  console.error('Never hardcode these in this script or pass them on a command line that gets logged/saved.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKETS = ['digital-files', 'product-images'];

let totalFiles = 0;
let totalBytes = 0;
let failures = 0;

/**
 * Storage's list() only returns one folder level at a time, so this
 * recurses into every subfolder it finds until it's walked the entire
 * bucket, downloading each actual file as it goes.
 */
async function backupFolder(bucket, folderPath, localBase) {
  const { data: entries, error } = await supabase.storage.from(bucket).list(folderPath, { limit: 1000 });
  if (error) {
    console.error(`  FAILED to list ${bucket}/${folderPath}: ${error.message}`);
    failures++;
    return;
  }

  for (const entry of entries || []) {
    const entryPath = folderPath ? `${folderPath}/${entry.name}` : entry.name;
    // Storage's list() distinguishes files from folders by whether
    // metadata is present -- folders have none.
    const isFolder = entry.id === null;

    if (isFolder) {
      await backupFolder(bucket, entryPath, localBase);
    } else {
      const localFilePath = path.join(localBase, entryPath);
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });

      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(entryPath);
      if (downloadError) {
        console.error(`  FAILED to download ${bucket}/${entryPath}: ${downloadError.message}`);
        failures++;
        continue;
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      fs.writeFileSync(localFilePath, buffer);
      totalFiles++;
      totalBytes += buffer.length;
      console.log(`  ${bucket}/${entryPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    }
  }
}

(async () => {
  console.log(`Starting Storage backup to: ${OUTPUT_DIR}\n`);

  for (const bucket of BUCKETS) {
    console.log(`Bucket: ${bucket}`);
    const bucketLocalDir = path.join(OUTPUT_DIR, bucket);
    fs.mkdirSync(bucketLocalDir, { recursive: true });
    await backupFolder(bucket, '', bucketLocalDir);
    console.log('');
  }

  console.log('---');
  console.log(`Files backed up: ${totalFiles}`);
  console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  if (failures > 0) {
    console.log(`FAILURES: ${failures} -- see errors above. Treat this backup run as INCOMPLETE.`);
    process.exit(1);
  }
  console.log('Storage backup completed successfully.');
})();
