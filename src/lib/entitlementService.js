// =============================================================================
// entitlementService — the ONE place that reads/writes subscription state.
//
// Every webhook handler (stripe.js, apple.js, google.js, microsoft.js) ends by
// calling upsertEntitlement() with a normalized shape. That's the whole trick
// that avoids a redesign later: the four platforms speak different wire
// formats, but each handler's only job is to translate its platform's event
// into this one shape and hand it here. isActiveForCustomer() — the function
// the paywall actually calls — never needs to know which platform a customer
// paid through.
// =============================================================================
import { pool } from '../db/pool.js';

/** Statuses that mean "let them in". Kept in one place on purpose. */
const ACCESS_GRANTING_STATUSES = new Set(['active', 'trialing', 'grace_period']);

/**
 * Find a customer by email, creating one if none exists.
 */
export async function findOrCreateCustomerByEmail(email, displayName = null) {
  const existing = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
  if (existing.rows[0]) return existing.rows[0];
  const created = await pool.query(
    'INSERT INTO customers (email, display_name) VALUES ($1, $2) RETURNING *',
    [email, displayName]
  );
  return created.rows[0];
}

/**
 * Record (or confirm) that a customer has an identity on a given platform.
 * platform: 'stripe' | 'apple' | 'google' | 'microsoft'
 */
export async function linkPlatformIdentity({ customerId, platform, externalCustomerId }) {
  await pool.query(
    `INSERT INTO platform_identities (customer_id, platform, external_customer_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (platform, external_customer_id) DO NOTHING`,
    [customerId, platform, externalCustomerId]
  );
}

/**
 * Resolve a canonical product id from a platform + that platform's own SKU.
 */
export async function resolveProductId(platform, externalSku) {
  const { rows } = await pool.query(
    'SELECT product_id FROM product_platform_skus WHERE platform = $1 AND external_sku = $2',
    [platform, externalSku]
  );
  return rows[0]?.product_id ?? null;
}

/**
 * The single normalized write path for subscription state, called by every
 * platform's webhook/poll handler. Upserts on (platform, external_subscription_id).
 *
 * shape:
 *   customerId, productId, platform, externalSubscriptionId, status,
 *   currentPeriodEnd (Date|null), cancelAtPeriodEnd (bool), rawPayload (object)
 */
export async function upsertEntitlement(shape) {
  const {
    customerId, productId, platform, externalSubscriptionId,
    status, currentPeriodEnd = null, cancelAtPeriodEnd = false, rawPayload = null,
  } = shape;

  const { rows } = await pool.query(
    `INSERT INTO entitlements
       (customer_id, product_id, platform, external_subscription_id,
        status, current_period_end, cancel_at_period_end, raw_payload, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (platform, external_subscription_id) DO UPDATE SET
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = now()
     RETURNING *`,
    [customerId, productId, platform, externalSubscriptionId,
     status, currentPeriodEnd, cancelAtPeriodEnd, rawPayload]
  );
  return rows[0];
}

/**
 * The paywall's only question: does this customer have ANY entitlement,
 * on ANY platform, that currently grants access?
 */
export async function isActiveForCustomer(customerId) {
  const { rows } = await pool.query(
    `SELECT * FROM entitlements
     WHERE customer_id = $1
     ORDER BY updated_at DESC`,
    [customerId]
  );
  const active = rows.find((r) => ACCESS_GRANTING_STATUSES.has(r.status));
  return {
    active: Boolean(active),
    entitlement: active ?? rows[0] ?? null,
  };
}

/**
 * Look up a customer by their identity on one platform (used by webhook
 * handlers when all they have is e.g. a Stripe customer id).
 */
export async function findCustomerByPlatformIdentity(platform, externalCustomerId) {
  const { rows } = await pool.query(
    `SELECT c.* FROM customers c
     JOIN platform_identities pi ON pi.customer_id = c.id
     WHERE pi.platform = $1 AND pi.external_customer_id = $2`,
    [platform, externalCustomerId]
  );
  return rows[0] ?? null;
}

/**
 * Idempotency guard: has this exact platform event already been processed?
 * Call at the top of every webhook handler; skip processing if true.
 */
export async function recordWebhookEventOnce({ platform, externalEventId, payload }) {
  const { rows } = await pool.query(
    `INSERT INTO webhook_events (platform, external_event_id, payload)
     VALUES ($1,$2,$3)
     ON CONFLICT (platform, external_event_id) DO NOTHING
     RETURNING id`,
    [platform, externalEventId, payload]
  );
  const isNewEvent = rows.length > 0;
  return isNewEvent;
}
