const ApiError = require('../utils/ApiError');

// Validates req[part] against a zod schema and replaces it with the parsed
// (coerced/stripped) value so downstream code trusts the shape.
function validate(schema, part = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', result.error.flatten()));
    }
    req[part] = result.data;
    next();
  };
}

module.exports = validate;
