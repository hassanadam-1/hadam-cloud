const fs = require('fs');
const l = fs.readFileSync('my-supabase-keys.sh', 'utf8').split('\n').find(x => x.includes('RESEND_API_KEY'));
if (!l) {
  console.log('No RESEND_API_KEY line found in the file.');
} else {
  const m = l.match(/RESEND_API_KEY=["']?([^"'\s]+)/);
  if (m) {
    console.log('Found line. Key starts with:', m[1].slice(0, 7), '  length:', m[1].length);
  } else {
    console.log('Line found but could not parse it:', l);
  }
}
