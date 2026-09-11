// Starts a real backend against an in-memory Mongo replica set and seeds it,
// for local manual/browser testing when no standalone MongoDB is installed.
// Not part of the app; delete once a real MongoDB is available.
const { MongoMemoryReplSet } = require('mongodb-memory-server');

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await replSet.waitUntilRunning();
  process.env.MONGO_URI = replSet.getUri();
  process.env.JWT_ACCESS_SECRET = 'dev_access_secret';
  process.env.JWT_REFRESH_SECRET = 'dev_refresh_secret';
  process.env.NODE_ENV = 'development';
  process.env.PORT = '4000';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';

  await new Promise((resolve, reject) => {
    const { fork } = require('child_process');
    const child = fork(require.resolve('../../src/seed/seed.js'), [], { env: { ...process.env }, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('seed failed'))));
  });

  const { connectDB } = require('../../src/config/db');
  await connectDB();
  require('../../src/app').listen(4000, () => console.log('[dev-backend] listening on 4000'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
