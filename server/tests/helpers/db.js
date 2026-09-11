const mongoose = require('mongoose');

async function connect() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI);
}

async function disconnect() {
  await mongoose.connection.close();
}

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

module.exports = { connect, disconnect, clearDatabase };
