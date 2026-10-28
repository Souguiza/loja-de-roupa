const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { ReviewsService } = require('../dist/catalog/reviews.service.js');

test('review requires a delivered order containing the reviewed product and enters moderation', async () => {
  const created = [];
  const prisma = {
    product: { findFirst: async () => ({ id: 'product-1' }) },
    order: { findUnique: async () => ({ id: 'order-1', customerId: 'customer-1', status: 'DELIVERED', items: [{ id: 'order-item-1' }] }) },
    review: { create: async ({ data }) => { created.push(data); return { id: 'review-1', status: data.status }; } },
  };
  const service = new ReviewsService(prisma);
  const result = await service.create('camiseta-agape', { publicToken: 'public-order-token', rating: 5, comment: 'A peça vestiu muito bem.' });
  assert.deepEqual(result, { id: 'review-1', status: 'PENDING' });
  assert.equal(created[0].customerId, 'customer-1');
  assert.equal(created[0].orderId, 'order-1');
  assert.equal(created[0].status, 'PENDING');
});

test('review is rejected until the order is delivered', async () => {
  let created = false;
  const prisma = {
    product: { findFirst: async () => ({ id: 'product-1' }) },
    order: { findUnique: async () => ({ id: 'order-1', customerId: 'customer-1', status: 'SHIPPED', items: [{ id: 'order-item-1' }] }) },
    review: { create: async () => { created = true; } },
  };
  const service = new ReviewsService(prisma);
  await assert.rejects(service.create('camiseta-agape', { publicToken: 'public-order-token', rating: 5, comment: 'A peça vestiu muito bem.' }), (error) => error instanceof BadRequestException);
  assert.equal(created, false);
});

test('review is rejected when the order token does not include the product', async () => {
  const prisma = {
    product: { findFirst: async () => ({ id: 'product-1' }) },
    order: { findUnique: async () => ({ id: 'order-1', customerId: 'customer-1', status: 'DELIVERED', items: [] }) },
    review: { create: async () => { throw new Error('Não deveria criar avaliação'); } },
  };
  const service = new ReviewsService(prisma);
  await assert.rejects(service.create('camiseta-agape', { publicToken: 'public-order-token', rating: 5, comment: 'A peça vestiu muito bem.' }), (error) => error instanceof NotFoundException);
});
