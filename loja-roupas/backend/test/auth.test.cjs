const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { BadRequestException, ConflictException, UnauthorizedException } = require('@nestjs/common');
const { AuthService } = require('../dist/auth/auth.service.js');
const { RolesGuard } = require('../dist/auth/guards/roles.guard.js');

const password = 'SenhaSegura123!';
const passwordHash = bcrypt.hashSync(password, 4);
const jwt = { sign: (payload) => `token:${payload.role}:${payload.sub}` };

test('admin login normalizes email and returns a limited owner identity', async () => {
  const queries = [];
  const prisma = { adminUser: { findUnique: async (query) => {
    queries.push(query);
    return { id: 'admin-1', email: 'dona@example.com', name: 'Dona', role: 'OWNER', passwordHash };
  } } };
  const service = new AuthService(prisma, jwt);
  const result = await service.adminLogin({ email: 'DONA@EXAMPLE.COM', password });

  assert.deepEqual(queries, [{ where: { email: 'dona@example.com' } }]);
  assert.equal(result.accessToken, 'token:owner:admin-1');
  assert.deepEqual(result.user, { id: 'admin-1', name: 'Dona', email: 'dona@example.com', role: 'owner' });
  assert.equal(Object.hasOwn(result.user, 'passwordHash'), false);
});

test('admin login rejects incorrect credentials with a generic error', async () => {
  const prisma = { adminUser: { findUnique: async () => ({ email: 'dona@example.com', role: 'OWNER', passwordHash }) } };
  const service = new AuthService(prisma, jwt);
  await assert.rejects(service.adminLogin({ email: 'dona@example.com', password: 'senha-errada' }),
    (error) => error instanceof UnauthorizedException && error.message === 'E-mail ou senha inválidos');
});

test('customer login normalizes email and validates the stored password hash', async () => {
  const queries = [];
  const prisma = { customer: { findUnique: async (query) => {
    queries.push(query);
    return { id: 'customer-1', email: 'cliente@example.com', name: 'Cliente', passwordHash };
  } } };
  const service = new AuthService(prisma, jwt);
  const result = await service.login({ email: 'CLIENTE@EXAMPLE.COM', password });

  assert.deepEqual(queries, [{ where: { email: 'cliente@example.com' } }]);
  assert.equal(result.accessToken, 'token:customer:customer-1');
  assert.deepEqual(result.user, { id: 'customer-1', name: 'Cliente', email: 'cliente@example.com', role: 'customer' });
});

test('customer registration lowercases email and persists only a password hash', async () => {
  const calls = { lookups: [], create: null };
  const prisma = { customer: {
    findUnique: async (query) => { calls.lookups.push(query); return null; },
    create: async ({ data }) => { calls.create = data; return { id: 'customer-2', email: data.email, name: data.name }; },
  } };
  const service = new AuthService(prisma, jwt);
  const result = await service.register({ name: 'Pessoa', email: 'PESSOA@EXAMPLE.COM', password, phone: '67999999999' });

  assert.deepEqual(calls.lookups, [{ where: { email: 'pessoa@example.com' } }]);
  assert.equal(calls.create.email, 'pessoa@example.com');
  assert.notEqual(calls.create.passwordHash, password);
  assert.equal(bcrypt.compareSync(password, calls.create.passwordHash), true);
  assert.equal(result.user.role, 'customer');
  assert.equal(Object.hasOwn(result.user, 'passwordHash'), false);
});

test('customer registration rejects a duplicate normalized email', async () => {
  const prisma = { customer: { findUnique: async () => ({ id: 'existing-customer' }) } };
  const service = new AuthService(prisma, jwt);
  await assert.rejects(service.register({ name: 'Pessoa', email: 'PESSOA@EXAMPLE.COM', password }),
    (error) => error instanceof ConflictException);
});

test('passwords longer than bcrypt’s 72-byte limit are rejected before database access', async () => {
  let databaseCalls = 0;
  const prisma = {
    customer: { findUnique: async () => { databaseCalls++; return null; } },
    adminUser: { findUnique: async () => { databaseCalls++; return null; } },
  };
  const service = new AuthService(prisma, jwt);
  const oversized = 'á'.repeat(37); // 74 UTF-8 bytes

  await assert.rejects(service.register({ name: 'Pessoa', email: 'pessoa@example.com', password: oversized }),
    (error) => error instanceof BadRequestException);
  await assert.rejects(service.login({ email: 'pessoa@example.com', password: oversized }),
    (error) => error instanceof UnauthorizedException);
  await assert.rejects(service.adminLogin({ email: 'dona@example.com', password: oversized }),
    (error) => error instanceof UnauthorizedException);
  assert.equal(databaseCalls, 0);
});

test('roles guard allows only the role declared by the controller', () => {
  const guard = new RolesGuard({ getAllAndOverride: () => ['owner'] });
  const contextFor = (role) => ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  });

  assert.equal(guard.canActivate(contextFor('owner')), true);
  assert.equal(guard.canActivate(contextFor('staff')), false);
  assert.equal(guard.canActivate(contextFor(undefined)), false);
});
