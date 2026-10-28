const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ServiceUnavailableException } = require('@nestjs/common');
const { OrdersService } = require('../dist/orders/orders.service.js');

for (const enabled of ['false', undefined, 'true']) {
  test(`POST order stays closed when CHECKOUT_ENABLED=${enabled ?? 'unset'}`, async () => {
    const prisma = new Proxy({}, {
      get() {
        return () => { throw new Error('Prisma não deveria ser chamado com checkout fechado'); };
      },
    });
    const config = { get: () => enabled };
    const service = new OrdersService(prisma, config);

    await assert.rejects(
      service.create({ items: [] }),
      (error) => error instanceof ServiceUnavailableException && error.getStatus() === 503,
    );
  });
}
