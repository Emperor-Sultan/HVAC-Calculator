// =============================================================================
// POST /v1/webhooks/google — STUB, ready to fill in when you list on
// Google Play. Not called by anything until you do.
//
// Google delivers "Real-time Developer Notifications" (RTDN): a Pub/Sub
// message (base64 JSON in req.body.message.data) on every subscription
// lifecycle event (SUBSCRIPTION_PURCHASED, RENEWED, CANCELED, ON_HOLD,
// IN_GRACE_PERIOD, EXPIRED, REVOKED, ...). Configure a Pub/Sub topic in
// Play Console > Monetization setup > Real-time developer notifications,
// and point Pub/Sub's push subscription at this URL.
//
// To activate this handler:
//   npm install googleapis   (for the Play Developer API + Pub/Sub push auth)
//   1. Verify the push request is really from Pub/Sub (its OIDC token, or a
//      shared query-string secret on the endpoint URL).
//   2. Decode message.data -> { subscriptionNotification: { purchaseToken,
//      subscriptionId (their SKU), notificationType } }.
//   3. Call the Play Developer API purchases.subscriptionsv2.get with the
//      purchaseToken to fetch the authoritative current state (expiryTime,
//      subscriptionState) — RTDN is just a "go look" ping, not the full state.
//   4. Map subscriptionState -> our status:
//        SUBSCRIPTION_STATE_ACTIVE          -> 'active'
//        SUBSCRIPTION_STATE_IN_GRACE_PERIOD -> 'grace_period'
//        SUBSCRIPTION_STATE_ON_HOLD         -> 'past_due'
//        SUBSCRIPTION_STATE_CANCELED        -> keep status, cancelAtPeriodEnd=true
//        SUBSCRIPTION_STATE_EXPIRED         -> 'expired'
//   5. Resolve the customer via findCustomerByPlatformIdentity('google', purchaseToken)
//      — or via the obfuscatedAccountId you passed at purchase time (set that
//      to the customer's internal id to skip email matching entirely).
//   6. resolveProductId('google', subscriptionId) then upsertEntitlement({...}).
//
// Same result shape as Stripe and Apple — no schema or paywall changes needed.
// =============================================================================
import express from 'express';
export const router = express.Router();

router.post('/', async (req, res) => {
  // Not yet configured — Google has nothing to send here until this app is
  // on Google Play and RTDN is pointed at this URL.
  res.status(501).json({ error: 'Google Play integration not yet configured' });
});
