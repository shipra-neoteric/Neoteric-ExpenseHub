const multer = require('multer');
const env = require('./env');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
});

module.exports = upload;
