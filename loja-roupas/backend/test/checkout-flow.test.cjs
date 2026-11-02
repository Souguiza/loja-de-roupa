const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { BadRequestException, ServiceUnavailableException } = require('@nestjs/common');
const { OrdersService } = require('../dist/orders/orders.service.js');
const { ShippingService } = require('../dist/shipping/shipping.service.js');

const baseDto = { name: 'Cliente Agape', email: 'cliente@example.com', phone: '', shippingQuoteId: 'quote-1', items: [{ variantId: 'variant-1', quantity: 2 }], address: { cep: '79800000', street: 'Rua A', number: '12', complement: '', neighborhood: 'Centro', city: 'Dourados', state: 'MS' } };
const config = { get: (key) => ({ CHECKOUT_ENABLED: 'true', MERCADO_PAGO_ACCESS_TOKEN: 'test-token', MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret', MERCADO_PAGO_NOTIFICATION_URL: 'https://api.example.com/api/orders/webhook/mercado-pago', PUBLIC_SITE_URL: 'https://agape.example.com' })[key] };
const shipping = { normalizeItems: (items) => items.map((item) => ({ ...item })).sort((a, b) => a.variantId.localeCompare(b.variantId)) };
const variant = { id: 'variant-1', active: true, stockQty: 3, priceCents: 5000, size: 'M', color: 'Preto', product: { active: true, name: 'Camiseta Agape' } };
const quote = { id: 'quote-1', destinationCep: '79800000', expiresAt: new Date(Date.now() + 60000), consumedAt: null, items: [{ variantId: 'variant-1', quantity: 2 }], priceCents: 1500, companyName: 'Transportadora', serviceName: 'Expresso' };

test('shipping quote item normalization aggregates duplicates and enforces per-variant limits', () => {
  const service = new ShippingService({}, {});
  assert.deepEqual(service.normalizeItems([{ variantId: 'v2', quantity: 1 }, { variantId: 'v1', quantity: 2 }, { variantId: 'v1', quantity: 1 }]), [
    { variantId: 'v1', quantity: 3 }, { variantId: 'v2', quantity: 1 },
  ]);
  assert.throws(() => service.normalizeItems([{ variantId: 'v1', quantity: 20 }, { variantId: 'v1', quantity: 1 }]), (error) => error instanceof BadRequestException);
});

function transactionalPrisma({ stockCount = 1, coupon = null } = {}) {
  const calls = { decremented: 0, decrementArgs: [], variantQuery: null, orderData: null, created: 0, couponUses: 0, canceled: 0, restocked: 0, preferenceWrites: [] };
  const tx = {
    shippingQuote: { updateMany: async () => ({ count: 1 }) },
    customer: { upsert: async () => ({ id: 'customer-1' }) },
    productVariant: {
      updateMany: async (args) => { calls.decremented++; calls.decrementArgs.push(args); return { count: stockCount }; },
      update: async () => { calls.restocked++; },
    },
    coupon: { findUnique: async () => coupon, updateMany: async () => { calls.couponUses++; return { count: 1 }; } },
    order: {
      findUnique: async () => ({ id: 'order-1', status: 'AWAITING_PAYMENT', couponId: null, items: [{ variantId: 'variant-1', quantity: 2 }] }),
      updateMany: async () => { calls.canceled++; return { count: 1 }; },
      create: async ({ data }) => { calls.orderData = data; calls.created++; return { id: 'order-1', number: 12, publicToken: 'public-order-token', ...data }; },
    },
  };
  const prisma = {
    shippingQuote: { findFirst: async () => quote },
    productVariant: { findMany: async (args) => { calls.variantQuery = args; return [variant]; } },
    payment: { updateMany: async (args) => { calls.preferenceWrites.push(args); return { count: 1 }; } },
    $transaction: async (callback) => callback(tx),
  };
  return { prisma, calls };
}

test('expires an unpaid order after the payment window and restores stock and coupon usage', async () => {
  const calls = { stock: [], coupon: [], claimed: 0 };
  const staleOrder = { id: 'order-stale', status: 'AWAITING_PAYMENT', couponId: 'coupon-1', items: [{ variantId: 'variant-1', quantity: 2 }] };
  const prisma = {
    order: { findMany: async ({ where, take }) => {
      assert.equal(where.status, 'AWAITING_PAYMENT');
      assert.ok(Date.now() - where.createdAt.lt.getTime() >= 35 * 60_000 - 100);
      assert.equal(take, 50);
      return [staleOrder];
    } },
    $transaction: async (callback) => callback({
      order: { updateMany: async ({ where, data }) => { calls.claimed++; assert.equal(where.status, 'AWAITING_PAYMENT'); assert.equal(data.status, 'CANCELED'); return { count: 1 }; } },
      productVariant: { update: async (args) => { calls.stock.push(args); } },
      coupon: { updateMany: async (args) => { calls.coupon.push(args); return { count: 1 }; } },
    }),
  };
  const service = new OrdersService(prisma, config, shipping);
  await service.expireUnpaidOrders();
  assert.equal(calls.claimed, 1);
  assert.deepEqual(calls.stock, [{ where: { id: 'variant-1' }, data: { stockQty: { increment: 2 } } }]);
  assert.deepEqual(calls.coupon, [{ where: { id: 'coupon-1', usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } }]);
});

test('does not restore stock if payment approval wins the expiry race', async () => {
  const calls = { stock: 0, coupon: 0 };
  const prisma = {
    order: { findMany: async () => [{ id: 'order-race', status: 'AWAITING_PAYMENT', couponId: 'coupon-1', items: [{ variantId: 'variant-1', quantity: 1 }] }] },
    $transaction: async (callback) => callback({
      order: { updateMany: async () => ({ count: 0 }) },
      productVariant: { update: async () => { calls.stock++; } },
      coupon: { updateMany: async () => { calls.coupon++; return { count: 1 }; } },
    }),
  };
  const service = new OrdersService(prisma, config, shipping);
  await service.expireUnpaidOrders();
  assert.equal(calls.stock, 0);
  assert.equal(calls.coupon, 0);
});

test('order uses current catalog price and selected shipping quote to create the Mercado Pago preference', async () => {
  const { prisma, calls } = transactionalPrisma();
  const originalFetch = global.fetch;
  let preferencePayload;
  global.fetch = async (_url, init) => {
    preferencePayload = JSON.parse(init.body);
    return { ok: true, json: async () => ({ id: 'preference-1', init_point: 'https://checkout.example.com/pay' }) };
  };
  try {
    const service = new OrdersService(prisma, config, shipping);
    const result = await service.create(baseDto);
    assert.equal(calls.orderData.totalCents, 11500);
    assert.equal(calls.orderData.shippingQuoteId, quote.id);
    assert.equal(calls.orderData.items.create[0].unitPriceCents, 5000);
    assert.equal(calls.decremented, 1);
    assert.deepEqual(calls.variantQuery.where.product, { active: true, category: { active: true } });
    assert.deepEqual(calls.decrementArgs[0].where.product, { active: true, category: { active: true } });
    assert.equal(calls.decrementArgs[0].where.active, true);
    assert.equal(preferencePayload.external_reference, 'order-1');
    assert.equal(preferencePayload.payment_methods.default_payment_method_id, 'pix');
    assert.equal(preferencePayload.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0), 115);
    assert.deepEqual(calls.preferenceWrites[0].where, { orderId: 'order-1', provider: 'mercado_pago', status: 'PENDING', providerPreferenceId: null });
    assert.equal(calls.preferenceWrites[0].data.providerPreferenceId, 'preference-1');
    assert.equal(result.checkoutUrl, 'https://checkout.example.com/pay');
  } finally { global.fetch = originalFetch; }
});

test('checkout fails closed and releases stock when the preference cannot be linked to its payment', async () => {
  const { prisma, calls } = transactionalPrisma();
  prisma.payment.updateMany = async () => ({ count: 0 });
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ id: 'preference-orphan', init_point: 'https://checkout.example.com/pay' }) });
  try {
    const service = new OrdersService(prisma, config, shipping);
    await assert.rejects(service.create(baseDto), (error) => error instanceof ServiceUnavailableException && error.getStatus() === 503);
    assert.equal(calls.canceled, 1);
    assert.equal(calls.restocked, 1);
  } finally { global.fetch = originalFetch; }
});

test('order applies coupon discount to the Mercado Pago line items and records usage', async () => {
  const coupon = { id: 'coupon-1', code: 'BANDO10', type: 'PERCENT', value: 10, minSubtotalCents: 0, usageLimit: 5, usedCount: 0, startsAt: new Date(Date.now() - 60000), expiresAt: null, active: true };
  const { prisma, calls } = transactionalPrisma({ coupon });
  const originalFetch = global.fetch; let preferencePayload;
  global.fetch = async (_url, init) => { preferencePayload = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'preference-coupon', init_point: 'https://checkout.example.com/pay' }) }; };
  try {
    const service = new OrdersService(prisma, config, shipping);
    await service.create({ ...baseDto, couponCode: ' bando10 ' });
    assert.equal(calls.orderData.discountCents, 1000);
    assert.equal(calls.orderData.totalCents, 10500);
    assert.equal(calls.orderData.couponCode, 'BANDO10');
    assert.equal(calls.couponUses, 1);
    assert.equal(preferencePayload.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0), 105);
  } finally { global.fetch = originalFetch; }
});

test('order aborts when conditional stock decrement loses a race', async () => {
  const { prisma, calls } = transactionalPrisma({ stockCount: 0 });
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Mercado Pago não deveria ser chamado'); };
  try {
    const service = new OrdersService(prisma, config, shipping);
    await assert.rejects(service.create(baseDto), (error) => error instanceof BadRequestException && error.getStatus() === 400);
    assert.equal(calls.created, 0);
    assert.deepEqual(calls.decrementArgs[0].where.product, { active: true, category: { active: true } });
  } finally { global.fetch = originalFetch; }
});

test('Mercado Pago webhook ignores forged signatures before querying payment or mutating orders', async () => {
  const prisma = { order: { findUnique: async () => { throw new Error('Prisma não deveria ser consultado'); } } };
  const service = new OrdersService(prisma, config, shipping);
  await assert.rejects(service.mercadoPagoWebhook('12345', 'request-1', 'ts=1,v1=forged'), (error) => error instanceof BadRequestException && error.getStatus() === 400);
});

test('Mercado Pago webhook approves only the amount checked against the persisted order', async () => {
  const secret = 'webhook-secret'; const dataId = '12345'; const requestId = 'request-approved'; const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
  const order = { id: 'order-1', status: 'AWAITING_PAYMENT', whatsappUpdates: false, customer: { email: 'cliente@example.com', phone: null }, payments: [{ id: 'payment-1', provider: 'mercado_pago', providerPreferenceId: 'preference-1', amountCents: 11500 }] };
  const mutations = [];
  const prisma = {
    order: { findUnique: async () => order },
    $transaction: async (callback) => callback({
      order: { updateMany: (...args) => { mutations.push(['order', ...args]); return Promise.resolve({ count: 1 }); } },
      payment: { update: (...args) => { mutations.push(['payment', ...args]); return Promise.resolve({}); } },
      stockReservation: { deleteMany: (...args) => { mutations.push(['reservations', ...args]); return Promise.resolve({ count: 0 }); } },
      notificationOutbox: { createMany: (...args) => { mutations.push(['notifications', ...args]); return Promise.resolve({ count: 0 }); } },
    }),
  };
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ id: Number(dataId), preference_id: 'preference-1', external_reference: 'order-1', transaction_amount: 115, currency_id: 'BRL', status: 'approved', date_approved: new Date().toISOString() }) });
  try {
    const notifications = { enqueue: async (_tx, id, event, data) => { mutations.push(['enqueue', id, event, data]); } };
    const service = new OrdersService(prisma, config, shipping, notifications);
    assert.deepEqual(await service.mercadoPagoWebhook(dataId, requestId, signature), { received: true });
    assert.equal(mutations.length, 4);
    assert.equal(mutations.find(([type]) => type === 'order')[1].data.status, 'PAID');
    assert.equal(mutations.find(([type]) => type === 'enqueue')[2], 'ORDER_PAID');
  } finally { global.fetch = originalFetch; }
});

test('approved payment racing with an order cancellation triggers an idempotent refund', async () => {
  const secret = 'webhook-secret'; const dataId = '12345'; const requestId = 'request-race'; const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
  const order = { id: 'order-1', status: 'AWAITING_PAYMENT', whatsappUpdates: false, customer: { email: 'cliente@example.com', phone: null }, payments: [{ id: 'payment-1', provider: 'mercado_pago', providerPreferenceId: 'preference-1', amountCents: 11500 }] };
  const calls = { orderReads: 0, refunds: 0, paymentUpdates: 0 };
  const prisma = {
    order: { findUnique: async () => (++calls.orderReads === 1 ? order : { status: 'CANCELED' }) },
    payment: { updateMany: async ({ data }) => { calls.paymentUpdates++; assert.equal(data.status, 'REFUNDED'); return { count: 1 }; } },
    $transaction: async (callback) => callback({ order: { updateMany: async () => ({ count: 0 }) } }),
  };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/refunds')) { calls.refunds++; return { ok: true, json: async () => ({ id: 'refund-1' }) }; }
    return { ok: true, json: async () => ({ id: Number(dataId), preference_id: 'preference-1', external_reference: 'order-1', transaction_amount: 115, currency_id: 'BRL', status: 'approved', date_approved: new Date().toISOString() }) };
  };
  try {
    const service = new OrdersService(prisma, config, shipping, { enqueue: async () => { throw new Error('Pedido cancelado não deve gerar aviso de pagamento'); } });
    assert.deepEqual(await service.mercadoPagoWebhook(dataId, requestId, signature), { received: true });
    assert.equal(calls.refunds, 1);
    assert.equal(calls.paymentUpdates, 1);
    assert.equal(calls.orderReads, 2);
  } finally { global.fetch = originalFetch; }
});

test('a second approved payment for an already paid order is refunded by payment id', async () => {
  const secret = 'webhook-secret'; const dataId = '22222'; const requestId = 'request-duplicate-charge'; const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
  const order = { id: 'order-1', status: 'PAID', payments: [{ id: 'payment-1', provider: 'mercado_pago', providerPaymentId: '11111', providerPreferenceId: 'preference-1', amountCents: 11500 }] };
  const calls = { refunds: 0, mutations: 0 };
  const prisma = { order: { findUnique: async () => order }, payment: { update: async () => { calls.mutations++; }, updateMany: async () => { calls.mutations++; } } };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/refunds')) { calls.refunds++; return { ok: true, json: async () => ({ id: 'refund-2' }) }; }
    return { ok: true, json: async () => ({ id: Number(dataId), preference_id: 'preference-1', external_reference: 'order-1', transaction_amount: 115, currency_id: 'BRL', status: 'approved', date_approved: new Date().toISOString() }) };
  };
  try {
    const service = new OrdersService(prisma, config, shipping, {});
    assert.deepEqual(await service.mercadoPagoWebhook(dataId, requestId, signature), { received: true, refunded: true, duplicatePayment: true });
    assert.equal(calls.refunds, 1);
    assert.equal(calls.mutations, 0);
  } finally { global.fetch = originalFetch; }
});

test('admin order transition refuses to overwrite a concurrent status change', async () => {
  const order = { id: 'order-1', status: 'PROCESSING', items: [], couponId: null, trackingCode: null, customer: { email: 'cliente@example.com', phone: null }, whatsappUpdates: false };
  let claimed = false;
  const prisma = {
    order: { findUnique: async () => order },
    $transaction: async (callback) => callback({
      order: { updateMany: async () => { claimed = true; return { count: 0 }; } },
      productVariant: { update: async () => ({}) },
      coupon: { updateMany: async () => ({ count: 1 }) },
      notificationOutbox: { createMany: async () => ({ count: 1 }) },
    }),
  };
  const service = new OrdersService(prisma, config, shipping, { enqueue: async () => { throw new Error('A transição concorrente não deve enviar aviso'); } });
  await assert.rejects(service.update('order-1', { status: 'SHIPPED', trackingCode: 'ABC123' }), (error) => error instanceof BadRequestException && error.getStatus() === 400);
  assert.equal(claimed, true);
});

test('admin cannot cancel an order after its Melhor Envio label flow has started', async () => {
  const order = { id: 'order-1', status: 'PROCESSING', shippingLabelId: 'me-label-1', shippingLabelStatus: 'PURCHASED', items: [], couponId: null, trackingCode: null, customer: { email: 'cliente@example.com', phone: null }, whatsappUpdates: false };
  let transactionStarted = false;
  const prisma = {
    order: { findUnique: async () => order },
    $transaction: async () => { transactionStarted = true; throw new Error('Não deveria abrir transação'); },
  };
  const service = new OrdersService(prisma, config, shipping, {});
  await assert.rejects(service.update(order.id, { status: 'CANCELED' }), (error) => error instanceof BadRequestException && error.getStatus() === 400);
  assert.equal(transactionStarted, false);
});

test('admin cannot cancel a processing order without completing the payment refund flow', async () => {
  const order = { id: 'order-1', status: 'PROCESSING', shippingLabelId: null, shippingLabelStatus: null, items: [], couponId: null, trackingCode: null, customer: { email: 'cliente@example.com', phone: null }, whatsappUpdates: false };
  let transactionStarted = false;
  const prisma = {
    order: { findUnique: async () => order },
    $transaction: async () => { transactionStarted = true; throw new Error('Não deveria abrir transação'); },
  };
  const service = new OrdersService(prisma, config, shipping, {});
  await assert.rejects(service.update(order.id, { status: 'CANCELED' }), (error) => error instanceof BadRequestException && error.getStatus() === 400);
  assert.equal(transactionStarted, false);
});
