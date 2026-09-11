const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const env = require('./env');

const uploadRoot = path.join(process.cwd(), env.uploadDir);
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
});

module.exports = upload;
