const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ServiceUnavailableException } = require('@nestjs/common');
const { ShippingService } = require('../dist/shipping/shipping.service.js');

test('shipping quote sends product units and honors Melhor Envio custom price and delivery time', async () => {
  const created = [];
  const prisma = {
    productVariant: { findMany: async () => [{ id: 'variant-1', sku: 'TEE-BLACK-M', priceCents: 8990, product: { name: 'Camiseta Agape', shippingWeightGrams: 320, shippingWidthCm: 25, shippingHeightCm: 4, shippingLengthCm: 30 } }] },
    shippingQuote: { create: async ({ data }) => { created.push(data); return { id: 'quote-1', ...data }; } },
  };
  const config = { get: (key) => ({ MELHOR_ENVIO_FROM_CEP: '79800000', MELHOR_ENVIO_ENV: 'sandbox', MELHOR_ENVIO_USER_AGENT: 'Agape (suporte@example.com)' })[key], getOrThrow: (key) => ({ MELHOR_ENVIO_USER_AGENT: 'Agape (suporte@example.com)' })[key] };
  const service = new ShippingService(prisma, config);
  service.getValidAccessToken = async () => 'sandbox-token';
  const originalFetch = global.fetch; let request;
  global.fetch = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return { ok: true, json: async () => [{ id: 1, name: 'PAC', custom_price: '19.90', price: '40.00', custom_delivery_time: 3, delivery_time: 8, company: { name: 'Correios' }, packages: [{ width: 25, height: 4, length: 30, weight: 0.32 }] }] };
  };
  try {
    const quotes = await service.quote({ cep: '01001000', items: [{ variantId: 'variant-1', quantity: 2 }] });
    assert.equal(request.url, 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate');
    assert.equal(request.init.headers.Authorization, 'Bearer sandbox-token');
    assert.deepEqual(request.body.from, { postal_code: '79800000' });
    assert.deepEqual(request.body.to, { postal_code: '01001000' });
    assert.deepEqual(request.body.products[0], { id: 'TEE-BLACK-M', name: 'Camiseta Agape', width: 25, height: 4, length: 30, weight: 0.32, insurance_value: 89.9, quantity: 2 });
    assert.equal(quotes[0].priceCents, 1990);
    assert.equal(quotes[0].deliveryDays, 3);
    assert.equal(created[0].items[0].quantity, 2);
  } finally { global.fetch = originalFetch; }
});

test('shipping quote fails closed when product package dimensions are missing', async () => {
  const prisma = { productVariant: { findMany: async () => [{ id: 'variant-1', sku: 'TEE-M', priceCents: 8990, product: { name: 'Camiseta Agape', shippingWeightGrams: 320, shippingWidthCm: null, shippingHeightCm: 4, shippingLengthCm: 30 } }] } };
  const config = { get: (key) => ({ MELHOR_ENVIO_FROM_CEP: '79800000', MELHOR_ENVIO_ENV: 'sandbox' })[key] };
  const service = new ShippingService(prisma, config);
  let called = false;
  service.getValidAccessToken = async () => 'sandbox-token';
  const originalFetch = global.fetch;
  global.fetch = async () => { called = true; throw new Error('Frete não deveria ser consultado sem dimensões'); };
  try {
    await assert.rejects(service.quote({ cep: '01001000', items: [{ variantId: 'variant-1', quantity: 1 }] }), (error) => error instanceof ServiceUnavailableException);
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});

test('shipping account remains connected while the refresh token is valid even if access token expired', async () => {
  const prisma = { shippingIntegration: { findUnique: async () => ({ expiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 60_000) }) } };
  const config = { get: (key) => ({ MELHOR_ENVIO_CLIENT_ID: 'client', MELHOR_ENVIO_CLIENT_SECRET: 'secret', MELHOR_ENVIO_REDIRECT_URI: 'https://api.example.com/api/shipping/callback', MELHOR_ENVIO_USER_AGENT: 'Agape (suporte@agape.com.br)', MELHOR_ENVIO_FROM_CEP: '79800000', INTEGRATION_TOKEN_KEY: Buffer.alloc(32).toString('base64') })[key] };
  const service = new ShippingService(prisma, config);
  const result = await service.status();
  assert.equal(result.appReady, true);
  assert.equal(result.connected, true);
  assert.equal(result.originCepConfigured, true);
});

test('shipping authorization asks for label, wallet checkout, print and tracking scopes', async () => {
  const prisma = { shippingOAuthState: { deleteMany: async () => ({ count: 0 }), create: async () => ({}) } };
  const config = { get: (key) => ({
    MELHOR_ENVIO_ENV: 'sandbox', MELHOR_ENVIO_CLIENT_ID: 'client',
    MELHOR_ENVIO_CLIENT_SECRET: 'secret',
    MELHOR_ENVIO_REDIRECT_URI: 'https://api.example.com/api/shipping/callback',
    MELHOR_ENVIO_USER_AGENT: 'Agape (suporte@agape.com.br)',
    MELHOR_ENVIO_FROM_CEP: '79800000', INTEGRATION_TOKEN_KEY: Buffer.alloc(32).toString('base64'),
  })[key], getOrThrow: (key) => ({ INTEGRATION_TOKEN_KEY: Buffer.alloc(32).toString('base64') })[key] };
  const service = new ShippingService(prisma, config);
  const { url } = await service.getAuthorizationUrl();
  const scopes = new URL(url).searchParams.get('scope').split(' ');
  for (const scope of ['shipping-calculate', 'cart-write', 'shipping-checkout', 'shipping-generate', 'shipping-print', 'shipping-tracking']) assert.ok(scopes.includes(scope));
});
