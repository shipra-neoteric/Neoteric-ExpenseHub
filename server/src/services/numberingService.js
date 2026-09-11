const Counter = require('../models/Counter');

// Atomic, monotonic, gap-tolerant sequence per organization+year.
// findOneAndUpdate with $inc is a single atomic document operation in Mongo,
// so concurrent submissions never receive the same number.
async function nextExpenseNumber(organizationId, session) {
  const year = new Date().getFullYear();
  const key = `EXP-${organizationId}-${year}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  );
  const seq = String(counter.seq).padStart(6, '0');
  return `EXP-${year}-${seq}`;
}

module.exports = { nextExpenseNumber };
