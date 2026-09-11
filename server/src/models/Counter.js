const { Schema, model } = require('mongoose');

// Backs atomic, gap-free-ish sequence generation for human-readable numbers
// (e.g. EXP-2026-000001) via findOneAndUpdate $inc, which Mongo serializes per document.
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = model('Counter', counterSchema);
