// Maps each configured Stripe Price (monthly, annual, ...) to the canonical
// 'hvac_pro' product, so the webhook can resolve "which product did this
// price belong to" without guessing. Run after every deploy where a price ID
// changed: npm run seed
//
// Safe to re-run — it's an upsert. When you add Apple/Google/Microsoft SKUs
// later, add their mappings here the same way instead of a new table.
import 'dotenv/config';
import { pool } from './pool.js';

const mappings = [
  { platform: 'stripe', externalSku: process.env.STRIPE_PRICE_HVAC_PRO_MONTHLY, productId: 'hvac_pro' },
  { platform: 'stripe', externalSku: process.env.STRIPE_PRICE_HVAC_PRO_ANNUAL, productId: 'hvac_pro' },
].filter((m) => m.externalSku); // skip any not configured yet

if (mappings.length === 0) {
  console.log('No STRIPE_PRICE_* env vars set — nothing to seed.');
  process.exit(0);
}

try {
  for (const m of mappings) {
    await pool.query(
      `INSERT INTO product_platform_skus (product_id, platform, external_sku)
       VALUES ($1, $2, $3)
       ON CONFLICT (platform, external_sku) DO UPDATE SET product_id = EXCLUDED.product_id`,
      [m.productId, m.platform, m.externalSku]
    );
    console.log(`✓ mapped ${m.platform}:${m.externalSku} -> ${m.productId}`);
  }
} catch (err) {
  console.error('✗ seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
