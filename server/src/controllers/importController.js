const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const importService = require('../services/importService');

const dryRun = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('CSV file is required (field name "file")', 'FILE_REQUIRED');
  const result = await importService.dryRun({ organizationId: req.organizationId, fileBuffer: req.file.buffer });
  res.json(result);
});

const commit = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('CSV file is required (field name "file")', 'FILE_REQUIRED');
  const summary = await importService.commit({ organizationId: req.organizationId, fileBuffer: req.file.buffer, userId: req.user._id, req });
  res.json(summary);
});

module.exports = { dryRun, commit };
