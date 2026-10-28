const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { CatalogService } = require('../dist/catalog/catalog.service.js');

test('public catalog and product detail hide products assigned to paused categories', async () => {
  const queries = [];
  const prisma = {
    product: {
      findMany: async (query) => { queries.push(query); return []; },
      findFirst: async (query) => { queries.push(query); return null; },
    },
  };
  const catalog = new CatalogService(prisma);

  await catalog.listProducts();
  await catalog.listProducts('camisetas');
  await assert.rejects(catalog.getProduct('bando-067'), (error) => error instanceof NotFoundException);

  assert.deepEqual(queries[0].where, { active: true, category: { active: true } });
  assert.deepEqual(queries[1].where, { active: true, category: { active: true, slug: 'camisetas' } });
  assert.deepEqual(queries[2].where, { slug: 'bando-067', active: true, category: { active: true } });
});

test('product creation rejects inactive categories before persisting the product', async () => {
  let created = false;
  let categoryQuery;
  const catalog = new CatalogService({
    category: { findFirst: async (query) => { categoryQuery = query; return null; } },
    product: { create: async () => { created = true; } },
  });

  await assert.rejects(catalog.createProduct({ categoryId: 'paused-category' }), (error) => error instanceof BadRequestException);
  assert.deepEqual(categoryQuery, { where: { id: 'paused-category', active: true }, select: { id: true } });
  assert.equal(created, false);
});

test('category update trims names and supports pausing without changing its SEO slug', async () => {
  let query;
  const catalog = new CatalogService({ category: { update: async (args) => { query = args; return args; } } });

  await catalog.updateCategory('category-1', { name: '  Camisetas  ', active: false });
  assert.deepEqual(query, { where: { id: 'category-1' }, data: { name: 'Camisetas', active: false } });
  await assert.rejects(catalog.updateCategory('category-1', {}), (error) => error instanceof BadRequestException);
  await assert.rejects(catalog.updateCategory('category-1', { name: '  ' }), (error) => error instanceof BadRequestException);
});
