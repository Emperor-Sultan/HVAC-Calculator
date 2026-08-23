// =============================================================================
// /v1/entitlements/* — what the app itself talks to (paywall check + checkout)
// =============================================================================
import express from 'express';
import Stripe from 'stripe';
import { findOrCreateCustomerByEmail, isActiveForCustomer } from '../lib/entitlementService.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
export const router = express.Router();

/**
 * GET /v1/entitlements/check?email=someone@example.com
 *
 * This is the ONLY call the app makes to decide whether to show the paywall.
 * It never needs to know whether the customer paid via Stripe, Apple, Google,
 * or Microsoft — isActiveForCustomer() already merged that.
 */
router.get('/check', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email is required' });

  const customer = await findOrCreateCustomerByEmail(email);
  const { active, entitlement } = await isActiveForCustomer(customer.id);

  res.json({
    active,
    status: entitlement?.status ?? 'none',
    platform: entitlement?.platform ?? null,
    current_period_end: entitlement?.current_period_end ?? null,
    cancel_at_period_end: entitlement?.cancel_at_period_end ?? false,
  });
});

// Both plans grant the same 'hvac_pro' entitlement (see schema.sql) — they're
// just two Prices on the same Product. Add a new key here (and its matching
// STRIPE_PRICE_* env var + a seed row in seedSkus.js) for any future tier.
const PLAN_ENV_KEYS = {
  monthly: 'STRIPE_PRICE_HVAC_PRO_MONTHLY',
  annual: 'STRIPE_PRICE_HVAC_PRO_ANNUAL',
};

/**
 * POST /v1/entitlements/checkout-session  { email, plan }
 *
 * plan is 'monthly' (default) or 'annual'. Creates a Stripe Checkout session
 * for the chosen price and returns the URL to redirect the browser to. This
 * is the web (Stripe) path; the Apple/Google/Microsoft equivalent of "start
 * a purchase" happens inside the native app/store UI itself, not through
 * this endpoint — those clients call /v1/entitlements/check the same way
 * once their platform's webhook (see routes/webhooks/) has recorded the
 * purchase.
 */
router.post('/checkout-session', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const plan = String(req.body?.plan || 'monthly').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email is required' });

  const envKey = PLAN_ENV_KEYS[plan];
  if (!envKey) {
    return res.status(400).json({ error: `plan must be one of: ${Object.keys(PLAN_ENV_KEYS).join(', ')}` });
  }
  const priceId = process.env[envKey];
  if (!priceId) {
    return res.status(500).json({ error: `${envKey} is not configured` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: process.env.CHECKOUT_SUCCESS_URL || 'https://example.com/success',
      cancel_url: process.env.CHECKOUT_CANCEL_URL || 'https://example.com/cancel',
      metadata: { hetech_email: email, plan },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
