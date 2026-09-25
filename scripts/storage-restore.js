/**
 * Hadam Storage restore script.
 *
 * Uploads every file from a local backup folder (created by
 * storage-backup.js) back into Supabase Storage -- used to restore Storage
 * objects into a fresh/recovered project. Uses upsert so it's safe to
 * re-run if interrupted partway through.
 *
 * SECURITY: credentials are read from environment variables, never
 * hardcoded here.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... STORAGE_RESTORE_DIR=... node storage-restore.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT_DIR = process.env.STORAGE_RESTORE_DIR;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INPUT_DIR) {
  console.error('FATAL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and STORAGE_RESTORE_DIR must all be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BUCKETS = ['digital-files', 'product-images'];

let totalFiles = 0;
let failures = 0;

function walkAndUpload(bucket, localDir, remotePrefix) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  const promises = [];
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = remotePrefix ? `${remotePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      promises.push(walkAndUpload(bucket, localPath, remotePath));
    } else {
      promises.push((async () => {
        const buffer = fs.readFileSync(localPath);
        const { error } = await supabase.storage.from(bucket).upload(remotePath, buffer, { upsert: true });
        if (error) {
          console.error(`  FAILED to upload ${bucket}/${remotePath}: ${error.message}`);
          failures++;
        } else {
          totalFiles++;
          console.log(`  ${bucket}/${remotePath} (${(buffer.length / 1024).toFixed(1)} KB)`);
        }
      })());
    }
  }
  return Promise.all(promises);
}

(async () => {
  for (const bucket of BUCKETS) {
    const bucketLocalDir = path.join(INPUT_DIR, bucket);
    if (!fs.existsSync(bucketLocalDir)) {
      console.log(`Skipping ${bucket} -- no local folder found at ${bucketLocalDir}`);
      continue;
    }
    console.log(`Bucket: ${bucket}`);
    await walkAndUpload(bucket, bucketLocalDir, '');
    console.log('');
  }
  console.log('---');
  console.log(`Files uploaded: ${totalFiles}`);
  if (failures > 0) {
    console.log(`FAILURES: ${failures}`);
    process.exit(1);
  }
  console.log('Storage restore completed successfully.');
})();
