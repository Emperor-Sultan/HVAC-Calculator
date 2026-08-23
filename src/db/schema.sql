-- =============================================================================
-- HETECH BIM HVAC — canonical customer / subscription (entitlement) schema
--
-- Design goal: ONE data model that already fits Stripe (web) today and Apple
-- App Store / Google Play / Microsoft Store in-app purchases later, so that
-- listing on those stores never requires a schema rewrite — only filling in
-- the already-stubbed webhook/poll handlers in src/routes/webhooks/.
--
-- Core idea: a "customer" is a person, independent of how they pay. Each
-- platform they've ever paid through gets a row in platform_identities.
-- Every purchase/subscription they hold, on any platform, gets a row in
-- entitlements. "Is this person allowed to use the app right now" is always
-- answered by reading entitlements — never by asking Stripe/Apple/Google/
-- Microsoft directly at request time.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- One row per human/organization using the app, regardless of payment source.
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Links a customer to their identity on a given payment platform. A customer
-- normally has exactly one of these, but the model allows more (e.g. someone
-- who bought on the web via Stripe and later also bought via the Android app)
-- so the two purchases can be reconciled onto a single customer later without
-- restructuring anything.
CREATE TABLE platform_identities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL CHECK (platform IN ('stripe','apple','google','microsoft')),
  -- stripe: cus_...   apple: originalTransactionId (or the App Account Token)
  -- google: the obfuscatedAccountId you pass at purchase time
  -- microsoft: the Microsoft Store userId / puid
  external_customer_id  TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_customer_id)
);

-- Platform-agnostic product catalog. Today there's one row: the HVAC Pro
-- subscription. If tiers are added later (e.g. a Team plan) they go here.
CREATE TABLE products (
  id                TEXT PRIMARY KEY,      -- e.g. 'hvac_pro_monthly'
  name              TEXT NOT NULL,
  entitlement_scope TEXT NOT NULL          -- e.g. 'full_app' — what unlocking this product grants
);

-- Maps each platform's own SKU/price id back to one canonical product, so a
-- webhook from any of the four platforms can resolve "which product is this".
CREATE TABLE product_platform_skus (
  product_id     TEXT NOT NULL REFERENCES products(id),
  platform       TEXT NOT NULL CHECK (platform IN ('stripe','apple','google','microsoft')),
  -- stripe: price_...   apple: the In-App Purchase product identifier
  -- google: the Play Console subscription product id   microsoft: the Store Add-on id
  external_sku   TEXT NOT NULL,
  PRIMARY KEY (platform, external_sku)
);

-- THE canonical source of truth for access control. One row per subscription
-- (or one-time purchase) a customer holds on a given platform. The paywall
-- check reads only this table.
CREATE TABLE entitlements (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id                TEXT NOT NULL REFERENCES products(id),
  platform                  TEXT NOT NULL CHECK (platform IN ('stripe','apple','google','microsoft')),
  -- stripe: sub_...   apple: originalTransactionId   google: purchaseToken   microsoft: orderId
  external_subscription_id  TEXT NOT NULL,
  status                    TEXT NOT NULL CHECK (status IN
                               ('active','trialing','past_due','grace_period','canceled','expired')),
  current_period_end        TIMESTAMPTZ,   -- when access should stop absent renewal
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT false,
  raw_payload                JSONB,        -- last raw event from the platform, for support/debugging
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_subscription_id)
);
CREATE INDEX idx_entitlements_customer ON entitlements(customer_id);
CREATE INDEX idx_entitlements_status   ON entitlements(status);

-- Idempotency + audit log for every inbound webhook/notification from any
-- platform. Prevents double-processing on retried deliveries (all four
-- platforms retry aggressively on non-2xx responses).
CREATE TABLE webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT NOT NULL CHECK (platform IN ('stripe','apple','google','microsoft')),
  external_event_id   TEXT NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload             JSONB,
  UNIQUE (platform, external_event_id)
);

-- Seed the one product that exists today. "hvac_pro" grants full-app access
-- regardless of billing interval — monthly and annual are two Prices/SKUs
-- (see product_platform_skus, seeded by src/db/seedSkus.js) that both map to
-- this same product, so subscribing at either interval grants the same
-- entitlement. Add rows here (not new tables) for a genuinely different tier
-- later (e.g. a Team plan with a different scope).
INSERT INTO products (id, name, entitlement_scope) VALUES
  ('hvac_pro', 'HETECH BIM HVAC — Pro', 'full_app')
ON CONFLICT (id) DO NOTHING;
