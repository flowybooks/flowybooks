export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
};

export type SlidingWindowRateLimiter = {
  consume: (key: string, nowMs?: number) => RateLimitResult;
};

export function createSlidingWindowRateLimiter(params: {
  windowMs: number;
  max: number;
}): SlidingWindowRateLimiter {
  const { windowMs, max } = params;

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('windowMs must be a positive number');
  }

  if (!Number.isFinite(max) || max <= 0) {
    throw new Error('max must be a positive number');
  }

  const buckets = new Map<string, number[]>();

  function consume(key: string, nowMs: number = Date.now()): RateLimitResult {
    const windowStart = nowMs - windowMs;
    const previous = buckets.get(key) ?? [];
    const timestamps = previous.filter((ts) => ts > windowStart);

    if (timestamps.length >= max) {
      buckets.set(key, timestamps);
      return {
        allowed: false,
        limit: max,
        remaining: 0,
        resetAtMs: (timestamps[0] ?? nowMs) + windowMs,
      };
    }

    timestamps.push(nowMs);
    buckets.set(key, timestamps);

    return {
      allowed: true,
      limit: max,
      remaining: max - timestamps.length,
      resetAtMs: (timestamps[0] ?? nowMs) + windowMs,
    };
  }

  return { consume };
}
