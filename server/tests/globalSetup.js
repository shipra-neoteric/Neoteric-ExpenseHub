const { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await replSet.waitUntilRunning();

  process.env.MONGO_URI = replSet.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.NODE_ENV = 'test';

  global.__MONGO_REPLSET__ = replSet;
};
