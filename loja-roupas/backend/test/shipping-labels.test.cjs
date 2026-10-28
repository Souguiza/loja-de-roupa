const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { ShippingService } = require('../dist/shipping/shipping.service.js');

const dto = { recipientCpf: '12345678909', invoiceKey: '1'.repeat(44) };
const configValues = {
  MELHOR_ENV_ENV: 'sandbox', MELHOR_ENVIO_CLIENT_ID: 'client', MELHOR_ENVIO_CLIENT_SECRET: 'secret',
  MELHOR_ENVIO_REDIRECT_URI: 'https://api.agape.com.br/api/shipping/callback',
  MELHOR_ENVIO_USER_AGENT: 'Agape (suporte@agape.com.br)', MELHOR_ENVIO_FROM_CEP: '79800000',
  INTEGRATION_TOKEN_KEY: Buffer.alloc(32).toString('base64'),
  MELHOR_ENVIO_SENDER_NAME: 'Agape Streetwear', MELHOR_ENVIO_SENDER_EMAIL: 'pedidos@agape.com.br',
  MELHOR_ENVIO_SENDER_PHONE: '67987654321', MELHOR_ENVIO_SENDER_CNPJ: '12345678000190',
  MELHOR_ENVIO_SENDER_STATE_REGISTER: 'ISENTO', MELHOR_ENVIO_SENDER_ADDRESS: 'Rua de Origem',
  MELHOR_ENVIO_SENDER_NUMBER: '42', MELHOR_ENVIO_SENDER_DISTRICT: 'Centro',
  MELHOR_ENVIO_SENDER_CITY: 'Dourados', MELHOR_ENVIO_SENDER_STATE: 'MS',
};

function setup(initial = {}) {
  const order = {
    id: 'order-1', number: 15, status: 'PROCESSING', subtotalCents: 10000, discountCents: 0,
    customer: { name: 'Pessoa Cliente', email: 'cliente@example.com', phone: '67999998888' },
    shippingAddress: { street: 'Rua Destino', number: '10', complement: '', neighborhood: 'Centro', city: 'Campo Grande', state: 'MS', cep: '79000000' },
    items: [{ productName: 'Camiseta Bando', quantity: 2, unitPriceCents: 5000 }],
    shippingQuote: { serviceId: 1, packages: [{ dimensions: { height: 4, width: 25, length: 30 }, weight: 0.64 }] },
    shippingLabelId: null, shippingLabelStatus: null, trackingCode: null,
    ...initial,
  };
  const calls = { requests: [], updateData: [] };
  const prisma = {
    order: {
      findUnique: async () => order,
      updateMany: async ({ where, data }) => {
        if (where.shippingLabelStatus === null && order.shippingLabelStatus !== null) return { count: 0 };
        if (where.shippingLabelStatus && order.shippingLabelStatus !== where.shippingLabelStatus) return { count: 0 };
        Object.assign(order, data); calls.updateData.push(data); return { count: 1 };
      },
      update: async ({ data }) => {
        Object.assign(order, data); calls.updateData.push(data);
        return { id: order.id, number: order.number, shippingLabelId: order.shippingLabelId, shippingLabelStatus: order.shippingLabelStatus };
      },
    },
  };
  const config = { get: (key) => configValues[key], getOrThrow: (key) => configValues[key] };
  const service = new ShippingService(prisma, config);
  service.getValidAccessToken = async () => 'sandbox-token';
  return { order, calls, service };
}

test('prepares a commercial shipment with one validated volume and does not persist CPF or invoice key', async () => {
  const { order, calls, service } = setup();
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, json: async () => ({ id: 'me-shipment-1' }) };
  };
  try {
    const result = await service.prepareOrderLabel(order.id, dto);
    assert.equal(result.shippingLabelStatus, 'CARTED');
    assert.equal(order.shippingLabelId, 'me-shipment-1');
    assert.equal(calls.requests[0].url, 'https://sandbox.melhorenvio.com.br/api/v2/me/cart');
    assert.equal(calls.requests[0].headers.Authorization, 'Bearer sandbox-token');
    assert.equal(calls.requests[0].body.to.document, dto.recipientCpf);
    assert.deepEqual(calls.requests[0].body.options.invoice, { key: dto.invoiceKey });
    assert.deepEqual(calls.requests[0].body.volumes, [{ height: 4, width: 25, length: 30, weight: 0.64 }]);
    assert.equal(calls.requests[0].body.products[0].unitary_value, '50.00');
    assert.equal(JSON.stringify(calls.updateData).includes(dto.recipientCpf), false);
    assert.equal(JSON.stringify(calls.updateData).includes(dto.invoiceKey), false);
  } finally { global.fetch = originalFetch; }
});

test('refuses multi-volume orders before calling Melhor Envio', async () => {
  const { order, service } = setup({ shippingQuote: { serviceId: 1, packages: [{ dimensions: { height: 4, width: 25, length: 30 }, weight: 0.64 }, { dimensions: { height: 4, width: 25, length: 30 }, weight: 0.64 }] } });
  const originalFetch = global.fetch; let called = false;
  global.fetch = async () => { called = true; throw new Error('Não deveria chamar a API'); };
  try {
    await assert.rejects(service.prepareOrderLabel(order.id, dto), (error) => error instanceof BadRequestException);
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});

test('refuses an Azul Cargo label because that service cannot be purchased through the API', async () => {
  const { order, service } = setup({ shippingQuote: { serviceId: 100, companyName: 'Azul Cargo', packages: [{ dimensions: { height: 4, width: 25, length: 30 }, weight: 0.64 }] } });
  const originalFetch = global.fetch; let called = false;
  global.fetch = async () => { called = true; throw new Error('Não deveria chamar a API'); };
  try {
    await assert.rejects(service.prepareOrderLabel(order.id, dto), (error) => error instanceof BadRequestException);
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});

test('rejects an invalid CPF before calling the shipping provider', async () => {
  const { order, service } = setup();
  const originalFetch = global.fetch; let called = false;
  global.fetch = async () => { called = true; throw new Error('Não deveria chamar a API'); };
  try {
    await assert.rejects(service.prepareOrderLabel(order.id, { ...dto, recipientCpf: '12345678901' }), (error) => error instanceof BadRequestException);
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});

test('allocates the order discount into declared product values without losing cents', async () => {
  const { order, calls, service } = setup({
    subtotalCents: 26970, discountCents: 2,
    items: [{ productName: 'Camiseta Drop', quantity: 3, unitPriceCents: 8990 }],
  });
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    calls.requests.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ id: 'me-shipment-discounted' }) };
  };
  try {
    await service.prepareOrderLabel(order.id, dto);
    const payload = calls.requests[0];
    const declaredCents = payload.products.reduce((sum, product) => sum + Number(product.unitary_value) * 100 * Number(product.quantity), 0);
    assert.equal(declaredCents, order.subtotalCents - order.discountCents);
    assert.equal(payload.options.insurance_value, 269.68);
    assert.equal(payload.products.reduce((sum, product) => sum + Number(product.quantity), 0), 3);
  } finally { global.fetch = originalFetch; }
});

test('an uncertain wallet checkout enters review and cannot be charged again automatically', async () => {
  const { order, calls, service } = setup({ shippingLabelId: 'me-shipment-1', shippingLabelStatus: 'CARTED' });
  const originalFetch = global.fetch;
  global.fetch = async () => { calls.requests.push('checkout'); throw new Error('Resposta perdida'); };
  try {
    await assert.rejects(service.purchaseOrderLabel(order.id));
    assert.equal(order.shippingLabelStatus, 'PAYMENT_REVIEW');
    await assert.rejects(service.purchaseOrderLabel(order.id), (error) => error instanceof BadRequestException);
    assert.equal(calls.requests.length, 1);
  } finally { global.fetch = originalFetch; }
});

test('purchase, generation, private print and tracking follow the staged shipment lifecycle', async () => {
  const { order, calls, service } = setup({ shippingLabelId: 'me-shipment-1', shippingLabelStatus: 'CARTED' });
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith('/shipment/print')) return { ok: true, json: async () => ({ labels: [{ url: 'https://sandbox.melhorenvio.com.br/print/private-token' }] }) };
    if (String(url).endsWith('/shipment/tracking')) return { ok: true, json: async () => ({ data: [{ tracking_code: 'BR123456789MS', status: 'posted' }] }) };
    return { ok: true, json: async () => ({ success: true }) };
  };
  try {
    assert.equal((await service.purchaseOrderLabel(order.id)).shippingLabelStatus, 'PURCHASED');
    assert.equal((await service.generateOrderLabel(order.id)).shippingLabelStatus, 'GENERATED');
    assert.deepEqual(await service.printOrderLabel(order.id), { url: 'https://sandbox.melhorenvio.com.br/print/private-token' });
    assert.deepEqual(await service.refreshOrderTracking(order.id), { trackingCode: 'BR123456789MS', status: 'posted' });
    assert.equal(order.trackingCode, 'BR123456789MS');
    assert.equal(calls.requests.find((request) => String(request.url).endsWith('/shipment/checkout')).body.orders[0], 'me-shipment-1');
    assert.equal(calls.requests.find((request) => String(request.url).endsWith('/shipment/generate')).body.orders[0], 'me-shipment-1');
    assert.equal(calls.requests.find((request) => String(request.url).endsWith('/shipment/print')).body.mode, 'private');
  } finally { global.fetch = originalFetch; }
});
