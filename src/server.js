import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { router as entitlementsRouter } from './routes/entitlements.js';
import { router as stripeWebhookRouter } from './routes/webhooks/stripe.js';
import { router as appleWebhookRouter } from './routes/webhooks/apple.js';
import { router as googleWebhookRouter } from './routes/webhooks/google.js';
import { router as microsoftWebhookRouter } from './routes/webhooks/microsoft.js';

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));

// Stripe's webhook signature check needs the exact raw request bytes, so this
// route is mounted with express.raw() BEFORE the global express.json() below.
app.use('/v1/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

app.use(express.json());

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// entitlementsRouter exposes GET /check and POST /checkout-session (see routes/entitlements.js)
app.use('/v1/entitlements', entitlementsRouter);
app.use('/v1/webhooks/apple', appleWebhookRouter);
app.use('/v1/webhooks/google', googleWebhookRouter);
app.use('/v1/webhooks/microsoft', microsoftWebhookRouter);

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`HETECH BIM HVAC backend listening on :${port}`);
});
