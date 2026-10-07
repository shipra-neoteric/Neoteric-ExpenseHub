require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/expensehub'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  appTimezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '8', 10),
  lowBalanceThresholdPaise: parseInt(process.env.LOW_BALANCE_THRESHOLD_PAISE || '200000', 10),
  automationSecret: process.env.AUTOMATION_SECRET || null,
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || null,
    signingSecret: process.env.SLACK_SIGNING_SECRET || null,
  },
  appBaseUrl: process.env.APP_BASE_URL || null,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || null,
    apiKey: process.env.CLOUDINARY_API_KEY || null,
    apiSecret: process.env.CLOUDINARY_API_SECRET || null,
  },
};
