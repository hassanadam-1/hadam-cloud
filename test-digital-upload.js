const http = require('http');

function request(reqPath, method, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port: 3000, path: reqPath, method,
      headers: { 'Host': 'demo.localhost', 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...extraHeaders },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const loginRes = await request('/api/auth/login', 'POST', { email: 'hadam-test-server12@mailinator.com', password: 'TestPassword123!' });
  const { token } = JSON.parse(loginRes.body);
  console.log('1. Logged in.');

  const fileContent = 'This is a REAL test file content for the HTML product.';
  const dataBase64 = Buffer.from(fileContent).toString('base64');

  const uploadRes = await request(
    '/api/admin/products/5417e3cf-c704-4141-b287-39c936c888df/digital-file',
    'POST',
    { mimeType: 'text/plain', filename: 'test-real-file.txt', dataBase64 },
    { Authorization: `Bearer ${token}` }
  );
  console.log('2. Upload response status:', uploadRes.status);
  console.log('3. Upload response body:', uploadRes.body);
}

main().catch(e => console.error('FAILED:', e.message));
