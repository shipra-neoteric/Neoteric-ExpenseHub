const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const requestContext = require('./middleware/requestContext');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// Render (and most PaaS hosts) puts exactly one reverse proxy in front of
// the app and sets X-Forwarded-For accordingly. Express defaults to
// distrusting that header entirely, which makes express-rate-limit throw on
// every single request instead of using the real client IP — trusting
// exactly one hop tells Express (and therefore the rate limiter and req.ip)
// to read it. Never set this to `true` (trust every hop) on a host where
// the outermost layer isn't controlled by the platform itself.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(compression());
// Slack signs the exact raw bytes it sent, so this route must keep the body
// as an untouched Buffer instead of the parsed object express.json() would
// produce — it's mounted here, ahead of the global JSON parser, specifically
// so that parser skips it (its content-type is x-www-form-urlencoded anyway).
app.use('/api/slack/interactions', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(requestContext);
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
