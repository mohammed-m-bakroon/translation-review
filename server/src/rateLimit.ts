export interface RateLimiter {
  allow(key: string): boolean;
}

/** Fixed window per key. Enough to stop a tight loop from spending the AI budget. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const at = now();
      const recent = (hits.get(key) ?? []).filter((stamp) => at - stamp < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(at);
      hits.set(key, recent);
      if (hits.size > 5000) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return true;
    },
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || 'local';
}
