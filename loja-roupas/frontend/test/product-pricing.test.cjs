const assert = require('node:assert/strict');
const test = require('node:test');

test('returns the lowest price among variants with stock', async () => {
  const { lowestAvailablePrice } = await import('../lib/product-pricing.mjs');

  assert.equal(lowestAvailablePrice([
    { priceCents: 7990, stockQty: 0 },
    { priceCents: 8990, stockQty: 4 },
    { priceCents: 10990, stockQty: 2 },
  ]), 8990);
});

test('returns null when every variant is sold out', async () => {
  const { lowestAvailablePrice } = await import('../lib/product-pricing.mjs');

  assert.equal(lowestAvailablePrice([
    { priceCents: 7990, stockQty: 0 },
    { priceCents: 8990, stockQty: 0 },
  ]), null);
});

test('ignores invalid prices instead of showing them as available', async () => {
  const { lowestAvailablePrice } = await import('../lib/product-pricing.mjs');

  assert.equal(lowestAvailablePrice([
    { priceCents: Number.NaN, stockQty: 4 },
    { priceCents: 0, stockQty: 2 },
    { priceCents: 7990, stockQty: Number.NaN },
    { priceCents: 10490, stockQty: 1 },
  ]), 10490);
});
