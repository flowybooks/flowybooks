import { describe, expect, it } from 'vitest';
import { createSlidingWindowRateLimiter } from '../../lib/rate-limit';

describe('rate-limit', () => {
  it('allows up to max within the window', () => {
    const limiter = createSlidingWindowRateLimiter({ windowMs: 1000, max: 2 });

    expect(limiter.consume('org:1', 0).allowed).toBe(true);
    expect(limiter.consume('org:1', 10).allowed).toBe(true);
    expect(limiter.consume('org:1', 20).allowed).toBe(false);
  });

  it('resets after the window passes', () => {
    const limiter = createSlidingWindowRateLimiter({ windowMs: 1000, max: 2 });

    expect(limiter.consume('org:1', 0).allowed).toBe(true);
    expect(limiter.consume('org:1', 10).allowed).toBe(true);
    expect(limiter.consume('org:1', 20).allowed).toBe(false);

    // After 1000ms, the first hit at 0ms falls out of the window.
    expect(limiter.consume('org:1', 1001).allowed).toBe(true);
  });

  it('tracks limits independently per key', () => {
    const limiter = createSlidingWindowRateLimiter({ windowMs: 1000, max: 1 });

    expect(limiter.consume('org:1', 0).allowed).toBe(true);
    expect(limiter.consume('org:2', 0).allowed).toBe(true);

    expect(limiter.consume('org:1', 10).allowed).toBe(false);
    expect(limiter.consume('org:2', 10).allowed).toBe(false);
  });
});
