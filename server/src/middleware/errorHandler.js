const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these values already exists', details: err.keyValue } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}

module.exports = { notFoundHandler, errorHandler };
