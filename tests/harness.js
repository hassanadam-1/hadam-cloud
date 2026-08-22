/**
 * Minimal, zero-dependency test runner.
 * Groups tests into named suites; each suite prints as it runs;
 * a final summary makes CI/console output easy to scan.
 */
const assert = require('assert');

let currentTestIp = randomTestIp();
function randomTestIp() {
  return `10.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
}

let results = [];
let currentSuite = null;

function suite(name, fn) {
  currentSuite = name;
  currentTestIp = randomTestIp(); // each suite gets its own rate-limit budget, so unrelated suites' login/register volume never collide as the test file grows
  console.log(`\n\x1b[1m${name}\x1b[0m`);
  return fn();
}

async function test(name, fn) {
  const label = `  ${currentSuite} > ${name}`;
  try {
    await fn();
    results.push({ suite: currentSuite, name, pass: true });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.push({ suite: currentSuite, name, pass: false, error: err.message });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`      ${err.message}`);
  }
}

/**
 * fetch() refuses to let caller-code override the Host header (it's on
 * the forbidden header list), which is exactly what's needed to simulate
 * different tenant subdomains against one local server. Node's core
 * http module has no such restriction, so tests use this instead.
 */
const http = require('http');
// A stable, distinct default IP for all ordinary test traffic — otherwise, as the suite grows,
// its own legitimate login volume eventually exceeds the rate limiter's own threshold, since
// every test in one run happens within the same few seconds (same rate-limit window). See
// randomTestIp()/currentTestIp above — each suite gets a fresh IP so growing the test file
// over time doesn't cause unrelated suites to exhaust a shared budget. Individual tests that
// specifically exercise the rate limiter still pass their own X-Forwarded-For and take priority.

function request(port, hostHeader, urlPath, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request({
      hostname: 'localhost', port, path: urlPath, method,
      headers: { Host: hostHeader, 'Content-Type': 'application/json', 'X-Forwarded-For': currentTestIp, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        let parsed = buf;
        if (ct.includes('application/json')) { try { parsed = JSON.parse(buf.toString('utf8')); } catch { parsed = buf.toString('utf8'); } }
        else if (ct.startsWith('text/') || ct.includes('charset')) { parsed = buf.toString('utf8'); }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function summary() {
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  console.log('\n' + '─'.repeat(50));
  console.log(`${passed}/${total} tests passed${failed ? `, ${failed} FAILED` : ''}`);
  if (failed) {
    console.log('\nFailed:');
    results.filter(r => !r.pass).forEach(r => console.log(`  - [${r.suite}] ${r.name}: ${r.error}`));
  }
  console.log('─'.repeat(50));
  return failed === 0;
}

module.exports = { suite, test, summary, assert, request };
