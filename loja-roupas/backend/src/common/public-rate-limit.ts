import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };
type Rule = { method: string; path: string; limit: number };

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 4096;
const RULES: Rule[] = [
  { method: 'POST', path: '/api/auth/admin/login', limit: 8 },
  { method: 'POST', path: '/api/auth/login', limit: 12 },
  { method: 'POST', path: '/api/auth/register', limit: 6 },
  { method: 'POST', path: '/api/orders', limit: 8 },
  { method: 'POST', path: '/api/products/*/reviews', limit: 5 },
  { method: 'POST', path: '/api/shipping/quote', limit: 20 },
  { method: 'POST', path: '/api/coupons/validate', limit: 20 },
  { method: 'GET', path: '/api/admin/shipping/authorize', limit: 5 },
  { method: 'POST', path: '/api/admin/media/images', limit: 30 },
];

/** Per-process abuse guard for public credential and checkout endpoints. */
export function createPublicRateLimitMiddleware(windowMs = WINDOW_MS, now = Date.now) {
  const buckets = new Map<string, Bucket>();

  return (request: Request, response: Response, next: NextFunction) => {
    const rule = RULES.find((candidate) => {
      if (candidate.method !== request.method) return false;
      if (!candidate.path.includes('*')) return candidate.path === request.path;
      const [prefix, suffix] = candidate.path.split('*');
      const variableSegment = request.path.slice(prefix.length, request.path.length - suffix.length);
      return request.path.startsWith(prefix) && request.path.endsWith(suffix) && variableSegment.length > 0 && !variableSegment.includes('/');
    });
    if (!rule) return next();

    const current = now();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const key = `${rule.method}:${rule.path}:${ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }

    const remaining = Math.max(0, rule.limit - bucket.count - 1);
    response.setHeader('RateLimit-Limit', String(rule.limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count >= rule.limit) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - current) / 1000))));
      return response.status(429).json({ statusCode: 429, message: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
    }

    bucket.count++;
    if (buckets.size > MAX_BUCKETS) {
      for (const [entryKey, entry] of buckets) if (entry.resetAt <= current) buckets.delete(entryKey);
      while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
    }
    return next();
  };
}
