// =============================================================================
// POST /v1/webhooks/stripe — the one platform that's live today.
//
// Register this URL in Stripe Dashboard > Developers > Webhooks, subscribed to:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted,
//   invoice.payment_failed
// =============================================================================
import express from 'express';
import Stripe from 'stripe';
import {
  findOrCreateCustomerByEmail, linkPlatformIdentity, resolveProductId,
  upsertEntitlement, recordWebhookEventOnce, findCustomerByPlatformIdentity,
} from '../../lib/entitlementService.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
export const router = express.Router();

// NOTE: this route must receive the RAW body (not JSON-parsed) for Stripe's
// signature check to succeed — see server.js, which mounts express.raw()
// on this exact path before the global express.json() middleware.
router.post('/', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  const isNew = await recordWebhookEventOnce({
    platform: 'stripe', externalEventId: event.id, payload: event,
  });
  if (!isNew) return res.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = (session.customer_email || session.metadata?.hetech_email || '').toLowerCase();
        if (email && session.customer) {
          const customer = await findOrCreateCustomerByEmail(email);
          await linkPlatformIdentity({
            customerId: customer.id, platform: 'stripe', externalCustomerId: session.customer,
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customer = await findCustomerByPlatformIdentity('stripe', sub.customer);
        if (!customer) break; // subscription created before checkout.session.completed landed; Stripe retries

        const priceId = sub.items?.data?.[0]?.price?.id;
        // Resolves via product_platform_skus (seeded by `npm run seed`), which is
        // what makes monthly and annual both land on 'hvac_pro' without this file
        // needing to know the difference. Falls back only if seeding was skipped.
        const productId = (await resolveProductId('stripe', priceId)) || 'hvac_pro';

        await upsertEntitlement({
          customerId: customer.id,
          productId,
          platform: 'stripe',
          externalSubscriptionId: sub.id,
          status: mapStripeStatus(sub.status),
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          rawPayload: sub,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customer = await findCustomerByPlatformIdentity('stripe', invoice.customer);
        if (customer && invoice.subscription) {
          await upsertEntitlement({
            customerId: customer.id,
            productId: 'hvac_pro',
            platform: 'stripe',
            externalSubscriptionId: invoice.subscription,
            status: 'past_due',
            rawPayload: invoice,
          });
        }
        break;
      }

      default:
        break; // other event types are safely ignored
    }
    res.json({ received: true });
  } catch (err) {
    // Returning 500 makes Stripe retry the delivery — desirable for transient DB errors.
    res.status(500).json({ error: err.message });
  }
});

function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled': return 'canceled';
    case 'incomplete_expired': return 'expired';
    default: return 'expired';
  }
}
