// One-off manual smoke test: spins up an in-memory Mongo replica set, runs the
// real seed script against it, then boots the real Express app and exercises
// login -> dashboard summary -> list expenses over HTTP. Not part of the Jest
// suite; run with `node tests/manual/smoke.js`.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const http = require('http');

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await replSet.waitUntilRunning();
  process.env.MONGO_URI = replSet.getUri();
  process.env.JWT_ACCESS_SECRET = 'smoke_access';
  process.env.JWT_REFRESH_SECRET = 'smoke_refresh';
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4999';

  delete require.cache[require.resolve('../../src/seed/seed.js')];
  await new Promise((resolve, reject) => {
    const { fork } = require('child_process');
    const child = fork(require.resolve('../../src/seed/seed.js'), [], {
      env: { ...process.env },
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('seed failed with code ' + code))));
  });

  const { connectDB, mongoose } = require('../../src/config/db');
  await connectDB();
  const app = require('../../src/app');
  const server = app.listen(4999);

  const base = 'http://127.0.0.1:4999';
  const login = await request('POST', `${base}/api/auth/login`, { email: 'master@neoteric.test', password: 'ChangeMe123!' });
  console.log('LOGIN STATUS', login.status);
  const token = login.body.accessToken;
  if (!token) throw new Error('login did not return an access token');

  const sites = await request('GET', `${base}/api/sites/mine`, null, token);
  console.log('SITES', sites.status, sites.body.items?.map((s) => s.name));
  const siteId = sites.body.items.find((s) => s.name === 'Silver Estate')._id;

  const dash = await request('GET', `${base}/api/dashboard/summary?siteId=${siteId}`, null, token);
  console.log('DASHBOARD', dash.status, dash.body.balance);

  const expenses = await request('GET', `${base}/api/expenses?siteId=${siteId}`, null, token);
  console.log('EXPENSES', expenses.status, expenses.body.total, expenses.body.items?.length);

  const csv = await requestRaw('GET', `${base}/api/reports/export.csv?siteId=${siteId}`, token);
  console.log('CSV EXPORT STATUS', csv.status, 'first 80 chars:', csv.body.slice(0, 80).replace(/\n/g, '\\n'));

  server.close();
  await mongoose.connection.close();
  await replSet.stop();
  console.log('SMOKE TEST OK');
}

function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function requestRaw(method, url, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.end();
  });
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED', err);
  process.exit(1);
});
