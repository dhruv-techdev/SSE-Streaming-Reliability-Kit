/**
 * Retry Policy Tests (US-09)
 */
import { describe, it, expect } from 'vitest';
import {
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
  RetryPolicies,
  createRetryPolicy,
} from '../../client/src/retry-policy.js';

describe('RetryPolicy', () => {
  describe('Configuration (SSRK-97)', () => {
    it('should use default config when none provided', () => {
      const policy = new RetryPolicy();
      const config = policy.getConfig();
      
      expect(config.baseDelayMs).toBe(DEFAULT_RETRY_POLICY.baseDelayMs);
      expect(config.maxDelayMs).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
      expect(config.maxAttempts).toBe(DEFAULT_RETRY_POLICY.maxAttempts);
      expect(config.jitterPct).toBe(DEFAULT_RETRY_POLICY.jitterPct);
    });

    it('should accept custom config', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 500,
        maxDelayMs: 5000,
        maxAttempts: 3,
        jitterPct: 0.1,
      });
      const config = policy.getConfig();
      
      expect(config.baseDelayMs).toBe(500);
      expect(config.maxDelayMs).toBe(5000);
      expect(config.maxAttempts).toBe(3);
      expect(config.jitterPct).toBe(0.1);
    });

    it('should validate config', () => {
      expect(() => new RetryPolicy({ baseDelayMs: -1 })).toThrow();
      expect(() => new RetryPolicy({ maxDelayMs: 100, baseDelayMs: 1000 })).toThrow();
      expect(() => new RetryPolicy({ maxAttempts: -1 })).toThrow();
      expect(() => new RetryPolicy({ jitterPct: 2 })).toThrow();
      expect(() => new RetryPolicy({ backoffMultiplier: 0.5 })).toThrow();
    });
  });

  describe('Exponential Backoff (SSRK-98)', () => {
    it('should calculate exponential delays', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterPct: 0, // No jitter for predictable testing
      });

      expect(policy.calculateBackoff(0)).toBe(1000);   // 1000 * 2^0 = 1000
      expect(policy.calculateBackoff(1)).toBe(2000);   // 1000 * 2^1 = 2000
      expect(policy.calculateBackoff(2)).toBe(4000);   // 1000 * 2^2 = 4000
      expect(policy.calculateBackoff(3)).toBe(8000);   // 1000 * 2^3 = 8000
      expect(policy.calculateBackoff(4)).toBe(16000);  // 1000 * 2^4 = 16000
    });

    it('should clamp at maxDelayMs', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterPct: 0,
      });

      expect(policy.calculateBackoff(0)).toBe(1000);
      expect(policy.calculateBackoff(1)).toBe(2000);
      expect(policy.calculateBackoff(2)).toBe(4000);
      expect(policy.calculateBackoff(3)).toBe(5000);  // Clamped
      expect(policy.calculateBackoff(4)).toBe(5000);  // Still clamped
      expect(policy.calculateBackoff(10)).toBe(5000); // Still clamped
    });

    it('should support different multipliers', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 100000,
        backoffMultiplier: 3,
        jitterPct: 0,
      });

      expect(policy.calculateBackoff(0)).toBe(1000);
      expect(policy.calculateBackoff(1)).toBe(3000);
      expect(policy.calculateBackoff(2)).toBe(9000);
      expect(policy.calculateBackoff(3)).toBe(27000);
    });
  });

  describe('Jitter (SSRK-99)', () => {
    it('should add jitter within bounds', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        jitterPct: 0.2, // ±10%
      });

      const delay = 1000;
      const results = new Set();
      
      // Run multiple times to verify randomness
      for (let i = 0; i < 100; i++) {
        const jittered = policy.addJitter(delay);
        results.add(jittered);
        
        // Should be within 10% of base (800-1200 for 20% jitter)
        expect(jittered).toBeGreaterThanOrEqual(800);
        expect(jittered).toBeLessThanOrEqual(1200);
      }
      
      // Should have some variation
      expect(results.size).toBeGreaterThan(1);
    });

    it('should return exact delay when jitter is 0', () => {
      const policy = new RetryPolicy({ jitterPct: 0 });
      
      expect(policy.addJitter(1000)).toBe(1000);
      expect(policy.addJitter(5000)).toBe(5000);
    });

    it('should never return negative delay', () => {
      const policy = new RetryPolicy({ jitterPct: 1 }); // 100% jitter
      
      for (let i = 0; i < 100; i++) {
        expect(policy.addJitter(100)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getDelay (SSRK-98 + SSRK-99)', () => {
    it('should combine backoff and jitter', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterPct: 0.2,
      });

      // Attempt 0: base is 1000, with 20% jitter = 800-1200
      const delay0 = policy.getDelay(0);
      expect(delay0).toBeGreaterThanOrEqual(800);
      expect(delay0).toBeLessThanOrEqual(1200);

      // Attempt 2: base is 4000, with 20% jitter = 3200-4800
      const delay2 = policy.getDelay(2);
      expect(delay2).toBeGreaterThanOrEqual(3200);
      expect(delay2).toBeLessThanOrEqual(4800);
    });
  });

  describe('shouldRetry', () => {
    it('should return true when attempts remain', () => {
      const policy = new RetryPolicy({ maxAttempts: 3 });
      
      expect(policy.shouldRetry(0)).toBe(true);
      expect(policy.shouldRetry(1)).toBe(true);
      expect(policy.shouldRetry(2)).toBe(true);
    });

    it('should return false when max attempts reached', () => {
      const policy = new RetryPolicy({ maxAttempts: 3 });
      
      expect(policy.shouldRetry(3)).toBe(false);
      expect(policy.shouldRetry(4)).toBe(false);
    });

    it('should always return true when maxAttempts is 0 (unlimited)', () => {
      const policy = new RetryPolicy({ maxAttempts: 0 });
      
      expect(policy.shouldRetry(0)).toBe(true);
      expect(policy.shouldRetry(100)).toBe(true);
      expect(policy.shouldRetry(1000)).toBe(true);
    });
  });

  describe('getRetryInfo', () => {
    it('should return complete retry info', () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        jitterPct: 0,
      });

      const info = policy.getRetryInfo(1);
      
      expect(info.shouldRetry).toBe(true);
      expect(info.delay).toBeGreaterThan(0);
      expect(info.attempt).toBe(1);
      expect(info.maxAttempts).toBe(3);
      expect(info.isLastAttempt).toBe(false);
    });

    it('should detect last attempt', () => {
      const policy = new RetryPolicy({ maxAttempts: 3 });

      expect(policy.getRetryInfo(0).isLastAttempt).toBe(false);
      expect(policy.getRetryInfo(1).isLastAttempt).toBe(false);
      expect(policy.getRetryInfo(2).isLastAttempt).toBe(true);
    });
  });

  describe('Preset Policies', () => {
    it('should provide default policy', () => {
      const policy = RetryPolicies.default();
      expect(policy.getConfig().baseDelayMs).toBe(1000);
    });

    it('should provide aggressive policy', () => {
      const policy = RetryPolicies.aggressive();
      expect(policy.getConfig().baseDelayMs).toBe(500);
      expect(policy.getConfig().maxAttempts).toBe(20);
    });

    it('should provide conservative policy', () => {
      const policy = RetryPolicies.conservative();
      expect(policy.getConfig().baseDelayMs).toBe(2000);
      expect(policy.getConfig().maxAttempts).toBe(5);
    });

    it('should provide persistent policy (unlimited)', () => {
      const policy = RetryPolicies.persistent();
      expect(policy.getConfig().maxAttempts).toBe(0);
    });
  });

  describe('with() helper', () => {
    it('should create modified policy', () => {
      const original = new RetryPolicy({ maxAttempts: 3 });
      const modified = original.with({ maxAttempts: 10 });
      
      expect(original.getConfig().maxAttempts).toBe(3);
      expect(modified.getConfig().maxAttempts).toBe(10);
    });
  });
});
