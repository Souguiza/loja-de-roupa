const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPublicRateLimitMiddleware } = require('../dist/common/public-rate-limit.js');

function request(path = '/api/auth/admin/login', ip = '203.0.113.10', method = 'POST') {
  return { path, method, ip, socket: { remoteAddress: ip } };
}

function response() {
  const headers = {};
  return {
    headers, statusCode: 200, body: null,
    setHeader(name, value) { headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('admin login is limited per IP and reports when retry is allowed', () => {
  let now = 10_000;
  const middleware = createPublicRateLimitMiddleware(60_000, () => now);
  for (let i = 0; i < 8; i++) {
    const res = response(); let passed = false;
    middleware(request(), res, () => { passed = true; });
    assert.equal(passed, true);
    assert.equal(res.headers['RateLimit-Limit'], '8');
  }
  const blocked = response(); let passed = false;
  middleware(request(), blocked, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.match(blocked.body.message, /Muitas tentativas/);

  const otherIp = response(); let otherIpPassed = false;
  middleware(request('/api/auth/admin/login', '203.0.113.11'), otherIp, () => { otherIpPassed = true; });
  assert.equal(otherIpPassed, true);

  now += 60_001;
  const reset = response(); let resetPassed = false;
  middleware(request(), reset, () => { resetPassed = true; });
  assert.equal(resetPassed, true);
});

test('unlisted routes pass through without changing the rate limit bucket', () => {
  const middleware = createPublicRateLimitMiddleware(60_000, () => 10_000);
  const res = response(); let passed = false;
  middleware(request('/api/products', '203.0.113.10', 'GET'), res, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(res.headers['RateLimit-Limit'], undefined);
});

test('verified product reviews have a dedicated rate limit per IP', () => {
  const middleware = createPublicRateLimitMiddleware(60_000, () => 10_000);
  for (let i = 0; i < 5; i++) {
    const res = response(); let passed = false;
    middleware(request('/api/products/camiseta-rua/reviews', '203.0.113.10'), res, () => { passed = true; });
    assert.equal(passed, true);
    assert.equal(res.headers['RateLimit-Limit'], '5');
  }
  const blocked = response(); let passed = false;
  middleware(request('/api/products/camiseta-rua/reviews', '203.0.113.10'), blocked, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(blocked.statusCode, 429);
  const otherIp = response(); let otherPassed = false;
  middleware(request('/api/products/camiseta-luz/reviews', '203.0.113.11'), otherIp, () => { otherPassed = true; });
  assert.equal(otherPassed, true);
});
