// =============================================================================
// POST /v1/webhooks/apple — STUB, ready to fill in when you list on the
// Apple App Store. Not called by anything until you do.
//
// Apple delivers "App Store Server Notifications V2": a signed JWT posted to
// this URL on every subscription lifecycle event (INITIAL_BUY, DID_RENEW,
// DID_FAIL_TO_RENEW, EXPIRED, DID_CHANGE_RENEWAL_STATUS, GRACE_PERIOD, ...).
// Configure the URL in App Store Connect > your app > App Information >
// App Store Server Notifications.
//
// To activate this handler:
//   npm install jsonwebtoken jwks-rsa   (to verify Apple's signature)
//   1. Verify req.body.signedPayload against Apple's public keys (jwks-rsa).
//   2. Decode it to get notificationType + the embedded transaction info,
//      which contains: originalTransactionId, productId (their SKU),
//      expiresDate, appAccountToken (if you set one at purchase time — set
//      this to the customer's internal id so you don't need email matching).
//   3. Map notificationType -> our status:
//        INITIAL_BUY, DID_RENEW                 -> 'active'
//        DID_CHANGE_RENEWAL_STATUS (auto-off)    -> keep status, set cancelAtPeriodEnd=true
//        GRACE_PERIOD                            -> 'grace_period'
//        DID_FAIL_TO_RENEW                       -> 'past_due'
//        EXPIRED, REFUND                         -> 'expired' / 'canceled'
//   4. Resolve the customer via findCustomerByPlatformIdentity('apple', originalTransactionId)
//      — or via appAccountToken if you used that — falling back to
//      findOrCreateCustomerByEmail() + linkPlatformIdentity() on first sight.
//   5. resolveProductId('apple', productId) then upsertEntitlement({...}).
//
// That's the entire integration: no new tables, no change to entitlements.js
// or to how the app checks /v1/entitlements/check.
// =============================================================================
import express from 'express';
export const router = express.Router();

router.post('/', async (req, res) => {
  // Not yet configured — Apple has nothing to send here until this app is on
  // the App Store and this URL is registered in App Store Connect.
  res.status(501).json({ error: 'Apple App Store integration not yet configured' });
});
