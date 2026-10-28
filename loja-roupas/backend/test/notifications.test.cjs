const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationsService } = require('../dist/notifications/notifications.service');

function config(values = {}) {
  return { get: (key) => values[key] };
}

function notificationRow(overrides = {}) {
  return {
    id: 'notification-test-id',
    event: 'ORDER_PAID',
    channel: 'EMAIL',
    attempts: 0,
    order: {
      number: 42,
      trackingCode: null,
      publicToken: 'public-token-test',
      customer: { name: 'Ana <b>Oliveira & Cia</b>', email: 'ana@example.test', phone: '67999990000' },
    },
    ...overrides,
  };
}

function deliveryHarness(t, row, fetchImpl, configValues = {}) {
  const updates = [];
  const fetchCalls = [];
  let available = true;
  const prisma = {
    notificationOutbox: {
      updateMany: async ({ where }) => ({ count: where.status === 'PENDING' ? 1 : 0 }),
      findFirst: async () => {
        if (!available) return null;
        available = false;
        return row;
      },
      update: async (entry) => {
        updates.push(entry);
        return entry;
      },
    },
  };
  const service = new NotificationsService(prisma, config({
    PUBLIC_SITE_URL: 'https://agape.example',
    RESEND_API_KEY: 'test-only-api-key',
    NOTIFICATION_FROM_EMAIL: 'Agape <pedidos@example.test>',
    ...configValues,
  }));
  t.mock.method(globalThis, 'fetch', async (...args) => {
    fetchCalls.push(args);
    return fetchImpl(...args);
  });
  return { service, updates, fetchCalls };
}

test('notification readiness reports provider setup without exposing secrets', () => {
  const service = new NotificationsService({}, config({
    RESEND_API_KEY: 'resend-test-secret',
    NOTIFICATION_FROM_EMAIL: 'Agape <pedidos@example.test>',
    WHATSAPP_ACCESS_TOKEN: 'whatsapp-test-secret',
    WHATSAPP_TEMPLATE_NAME: 'pedido_atualizado',
    WHATSAPP_MESSAGES_URL: 'https://graph.facebook.com/v22.0/12345/messages',
  }));

  const status = service.readiness();
  assert.equal(status.email.configured, true);
  assert.equal(status.whatsapp.configured, true);
  assert.equal(JSON.stringify(status).includes('test-secret'), false);
});

test('outbox queues WhatsApp only with customer consent and a configured provider', async () => {
  const created = [];
  const service = new NotificationsService({}, config({
    RESEND_API_KEY: 'test-key',
    NOTIFICATION_FROM_EMAIL: 'Agape <pedidos@example.test>',
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_TEMPLATE_NAME: 'pedido_atualizado',
    WHATSAPP_MESSAGES_URL: 'https://graph.facebook.com/v22.0/12345/messages',
  }));
  const tx = { notificationOutbox: { createMany: async (data) => { created.push(data); return { count: data.data.length }; } } };
  const customer = { email: 'ana@example.test', phone: '67999990000' };

  await service.enqueue(tx, 'order-1', 'ORDER_PAID', { whatsappUpdates: false, customer });
  await service.enqueue(tx, 'order-2', 'ORDER_PAID', { whatsappUpdates: true, customer });

  assert.deepEqual(created.map((entry) => entry.data.map(({ channel }) => channel)), [['EMAIL'], ['EMAIL', 'WHATSAPP']]);
  assert.equal(created.every((entry) => entry.skipDuplicates), true);
});

test('email delivery escapes customer content and marks the outbox row sent', async (t) => {
  const harness = deliveryHarness(t, notificationRow(), async () => ({ ok: true, json: async () => ({ id: 'resend-message-1' }) }));
  await harness.service.drain();

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0][0], 'https://api.resend.com/emails');
  assert.equal(harness.fetchCalls[0][1].headers['Idempotency-Key'], 'agape-notification-notification-test-id');
  const body = JSON.parse(harness.fetchCalls[0][1].body);
  assert.match(body.html, /&lt;b&gt;Oliveira &amp; Cia&lt;\/b&gt;/);
  assert.equal(harness.updates.at(-1).data.status, 'SENT');
  assert.equal(harness.updates.at(-1).data.providerMessageId, 'resend-message-1');
});

test('provider failure schedules a retry and the eighth failed delivery is terminal', async (t) => {
  const first = deliveryHarness(t, notificationRow(), async () => ({ ok: false, status: 503, json: async () => ({}) }));
  const before = Date.now();
  await first.service.drain();
  const retry = first.updates.at(-1).data;
  assert.equal(retry.status, 'PENDING');
  assert.equal(retry.lastErrorCode, 'http_503');
  assert.ok(retry.nextAttemptAt.getTime() >= before + 29_000);
  assert.ok(retry.nextAttemptAt.getTime() <= Date.now() + 31_000);

  const exhausted = deliveryHarness(t, notificationRow({ attempts: 7 }), async () => { throw new Error('network unavailable'); });
  await exhausted.service.drain();
  assert.equal(exhausted.updates.at(-1).data.status, 'FAILED');
  assert.equal(exhausted.updates.at(-1).data.lastErrorCode, 'network_error');
});
