// =============================================================================
// /v1/webhooks/microsoft — STUB, ready to fill in when you list on the
// Microsoft Store. Not called by anything until you do.
//
// Unlike the other three, the Microsoft Store does not push webhooks for
// subscription changes. Instead you POLL the Microsoft Store "Recurring
// Billing" REST API (via an Azure AD app registration) for each known
// subscriber's current state. This file exposes that poll as a route you
// can hit from a scheduled job (cron / hosting platform's scheduler) instead
// of a route the Store calls directly — kept under /v1/webhooks/* for
// consistency with the other three platforms, but wire it to a schedule,
// not to a Store-configured URL.
//
// To activate this handler:
//   npm install @azure/msal-node
//   1. Authenticate with MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET (client
//      credentials flow) to get a token for the Store API.
//   2. For each row in platform_identities where platform='microsoft', call
//      GET https://manage.devcenter.microsoft.com/v1.0/my/purchases/subscriptions
//      (or the newer Microsoft Store analytics "Recurring Billing" endpoint)
//      filtered to that external_customer_id.
//   3. Map the returned autoRenew / expirationTime / status fields to our
//      status the same way as the Stripe/Apple/Google handlers do:
//        active & within expirationTime -> 'active'
//        autoRenew=false, still within period -> 'active', cancelAtPeriodEnd=true
//        past expirationTime -> 'expired'
//   4. resolveProductId('microsoft', addOnId) then upsertEntitlement({...}).
//
// Same upsertEntitlement() call as the other three — no schema changes.
// =============================================================================
import express from 'express';
export const router = express.Router();

// Manual trigger for now (call this from your host's scheduler once configured).
router.post('/poll', async (req, res) => {
  res.status(501).json({ error: 'Microsoft Store integration not yet configured' });
});
