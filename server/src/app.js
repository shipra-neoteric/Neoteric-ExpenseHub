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
const monthEndSummaryJob = require('./services/monthEndSummaryJob');

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

// No external scheduler on Render's free tier, so instead of relying on one,
// any incoming request on the month's last calendar day opportunistically
// triggers the month-end summary. Never awaited — must not add latency or
// ever fail a real request — and the DB-backed lock inside it guarantees it
// actually runs at most once per day regardless of how many requests land.
//
// The equivalent automatic trigger for monthlyRolloverJob was intentionally
// removed: with the Monthly Transfers page, Finance now reviews and sends
// each site's exact top-up amount manually (with proof), so an unattended
// rollover auto-topping-up every site on the 1st would double up with
// that manual payment instead of replacing it. fundController.runRollover
// (the "Run Monthly Rollover" button) still exists for whoever wants to
// trigger it by hand.
if (env.nodeEnv !== 'test') {
  app.use((req, res, next) => {
    monthEndSummaryJob.maybeRunOnRequest().catch(() => {});
    next();
  });
}

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
