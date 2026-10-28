const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OrdersService } = require('../dist/orders/orders.service.js');

test('admin order pages return only operational fields without provider payment identifiers', async () => {
  let query;
  const service = new OrdersService({ order: { count: async () => 52, findMany: async (args) => { query = args; return []; } } }, {}, {}, {});

  assert.deepEqual(await service.list(2), { items: [], total: 52, page: 2, pageSize: 50, pageCount: 2 });
  assert.equal(query.include, undefined);
  assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(query.skip, 50);
  assert.equal(query.take, 50);
  assert.deepEqual(query.select.customer, { select: { name: true, email: true, phone: true } });
  assert.deepEqual(query.select.items, { select: { productName: true, size: true, color: true, quantity: true } });
  assert.deepEqual(query.select.shippingQuote, {
    select: { companyName: true, serviceName: true, priceCents: true, deliveryDays: true },
  });
  assert.equal(Object.hasOwn(query.select, 'payments'), false);
  assert.equal(Object.hasOwn(query.select, 'publicToken'), false);
});

test('admin dashboard uses database counts and only fetches four recent orders', async () => {
  const countQueries = [];
  let recentQuery;
  const prisma = {
    order: {
      count: async (query) => { countQueries.push(query); return countQueries.length * 2; },
      findMany: async (query) => { recentQuery = query; return []; },
    },
    productVariant: { count: async (query) => { countQueries.push(query); return 3; } },
    review: { count: async (query) => { countQueries.push(query); return 1; } },
  };
  const service = new OrdersService(prisma, {}, {}, {});

  assert.deepEqual(await service.summary(), {
    activeOrderCount: 2, waitingPaymentCount: 4, lowStockVariantCount: 3, pendingReviewCount: 1, recentOrders: [],
  });
  assert.deepEqual(countQueries[0], { where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED'] } } });
  assert.deepEqual(countQueries[1], { where: { status: 'AWAITING_PAYMENT' } });
  assert.deepEqual(countQueries[2], { where: { active: true, stockQty: { lte: 2 }, product: { active: true, category: { active: true } } } });
  assert.deepEqual(countQueries[3], { where: { status: 'PENDING' } });
  assert.equal(recentQuery.take, 4);
  assert.deepEqual(recentQuery.select.customer, { select: { name: true } });
  assert.equal(Object.hasOwn(recentQuery.select, 'shippingAddress'), false);
});

test('admin order pagination rejects invalid page numbers', async () => {
  let queried = false;
  const service = new OrdersService({ order: { count: async () => { queried = true; return 0; } } }, {}, {}, {});
  await assert.rejects(service.list(0), /Página de pedidos inválida/);
  await assert.rejects(service.list(Number.NaN), /Página de pedidos inválida/);
  assert.equal(queried, false);
});
