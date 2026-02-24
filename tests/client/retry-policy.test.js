/**
 * Retry Policy Tests (US-09, US-10)
 */
import { describe, it, expect } from 'vitest';
import {
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
  RetryPolicies,
  createRetryPolicy,
} from '../../client/src/retry-policy.js';

describe('RetryPolicy', () => {
  describe('Configuration', () => {
    it('should use default config when none provided', () => {
      const policy = new RetryPolicy();
      const config = policy.getConfig();
      
      expect(config.baseDelayMs).toBe(DEFAULT_RETRY_POLICY.baseDelayMs);
      expect(config.maxDelayMs).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
      expect(config.maxAttempts).toBe(DEFAULT_RETRY_POLICY.maxAttempts);
      expect(config.maxRetryTimeMs).toBe(DEFAULT_RETRY_POLICY.maxRetryTimeMs);
      expect(config.jitterPct).toBe(DEFAULT_RETRY_POLICY.jitterPct);
    });

    it('should accept custom config including maxRetryTimeMs', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 500,
        maxDelayMs: 5000,
        maxAttempts: 3,
        maxRetryTimeMs: 60000,
        jitterPct: 0.1,
      });
      const config = policy.getConfig();
      
      expect(config.baseDelayMs).toBe(500);
      expect(config.maxRetryTimeMs).toBe(60000);
    });

    it('should validate config', () => {
      expect(() => new RetryPolicy({ baseDelayMs: -1 })).toThrow();
      expect(() => new RetryPolicy({ maxDelayMs: 100, baseDelayMs: 1000 })).toThrow();
      expect(() => new RetryPolicy({ maxAttempts: -1 })).toThrow();
      expect(() => new RetryPolicy({ maxRetryTimeMs: -1 })).toThrow();
      expect(() => new RetryPolicy({ jitterPct: 2 })).toThrow();
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential delays', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterPct: 0,
      });

      expect(policy.calculateBackoff(0)).toBe(1000);
      expect(policy.calculateBackoff(1)).toBe(2000);
      expect(policy.calculateBackoff(2)).toBe(4000);
      expect(policy.calculateBackoff(3)).toBe(8000);
    });

    it('should clamp at maxDelayMs', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterPct: 0,
      });

      expect(policy.calculateBackoff(10)).toBe(5000);
    });
  });

  describe('Jitter', () => {
    it('should add jitter within bounds', () => {
      const policy = new RetryPolicy({
        baseDelayMs: 1000,
        jitterPct: 0.2,
      });

      const delay = 1000;
      for (let i = 0; i < 100; i++) {
        const jittered = policy.addJitter(delay);
        expect(jittered).toBeGreaterThanOrEqual(800);
        expect(jittered).toBeLessThanOrEqual(1200);
      }
    });

    it('should return exact delay when jitter is 0', () => {
      const policy = new RetryPolicy({ jitterPct: 0 });
      expect(policy.addJitter(1000)).toBe(1000);
    });
  });

  describe('shouldRetryByAttempts (SSRK-106)', () => {
    it('should return true when attempts remain', () => {
      const policy = new RetryPolicy({ maxAttempts: 3 });
      
      expect(policy.shouldRetryByAttempts(0)).toBe(true);
      expect(policy.shouldRetryByAttempts(1)).toBe(true);
      expect(policy.shouldRetryByAttempts(2)).toBe(true);
    });

    it('should return false when max attempts reached', () => {
      const policy = new RetryPolicy({ maxAttempts: 3 });
      
      expect(policy.shouldRetryByAttempts(3)).toBe(false);
      expect(policy.shouldRetryByAttempts(4)).toBe(false);
    });

    it('should return true when maxAttempts is 0 (unlimited)', () => {
      const policy = new RetryPolicy({ maxAttempts: 0 });
      
      expect(policy.shouldRetryByAttempts(100)).toBe(true);
    });
  });

  describe('shouldRetryByTime (SSRK-107)', () => {
    it('should return true when time remains', () => {
      const policy = new RetryPolicy({ maxRetryTimeMs: 60000 });
      
      expect(policy.shouldRetryByTime(0)).toBe(true);
      expect(policy.shouldRetryByTime(30000)).toBe(true);
      expect(policy.shouldRetryByTime(59999)).toBe(true);
    });

    it('should return false when max time exceeded', () => {
      const policy = new RetryPolicy({ maxRetryTimeMs: 60000 });
      
      expect(policy.shouldRetryByTime(60000)).toBe(false);
      expect(policy.shouldRetryByTime(60001)).toBe(false);
    });

    it('should return true when maxRetryTimeMs is 0 (unlimited)', () => {
      const policy = new RetryPolicy({ maxRetryTimeMs: 0 });
      
      expect(policy.shouldRetryByTime(999999999)).toBe(true);
    });
  });

  describe('shouldRetry (combined)', () => {
    it('should check both attempts and time', () => {
      const policy = new RetryPolicy({
        maxAttempts: 5,
        maxRetryTimeMs: 60000,
      });

      // Within both limits
      expect(policy.shouldRetry(2, 30000).shouldRetry).toBe(true);
      
      // Exceeds attempts
      expect(policy.shouldRetry(5, 30000).shouldRetry).toBe(false);
      expect(policy.shouldRetry(5, 30000).reason).toBe('max_attempts_reached');
      
      // Exceeds time
      expect(policy.shouldRetry(2, 60001).shouldRetry).toBe(false);
      expect(policy.shouldRetry(2, 60001).reason).toBe('max_retry_time_exceeded');
    });

    it('should prioritize attempt check over time check', () => {
      const policy = new RetryPolicy({
        maxAttempts: 2,
        maxRetryTimeMs: 60000,
      });

      // Both exceeded - should report attempts first
      const result = policy.shouldRetry(5, 90000);
      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toBe('max_attempts_reached');
    });
  });

  describe('getRetryInfo', () => {
    it('should return complete retry info', () => {
      const policy = new RetryPolicy({
        maxAttempts: 5,
        maxRetryTimeMs: 60000,
        jitterPct: 0,
      });

      const info = policy.getRetryInfo(2, 10000);
      
      expect(info.shouldRetry).toBe(true);
      expect(info.stopReason).toBeNull();
      expect(info.delay).toBeGreaterThan(0);
      expect(info.attempt).toBe(2);
      expect(info.maxAttempts).toBe(5);
      expect(info.maxRetryTimeMs).toBe(60000);
      expect(info.elapsedMs).toBe(10000);
    });

    it('should include stopReason when should not retry', () => {
      const policy = new RetryPolicy({ maxAttempts: 2 });

      const info = policy.getRetryInfo(5, 0);
      
      expect(info.shouldRetry).toBe(false);
      expect(info.stopReason).toBe('max_attempts_reached');
    });
  });

  describe('Preset Policies', () => {
    it('should provide timeCapped policy', () => {
      const policy = RetryPolicies.timeCapped();
      expect(policy.getConfig().maxAttempts).toBe(0);
      expect(policy.getConfig().maxRetryTimeMs).toBe(300000);
    });

    it('should provide balanced policy with both caps', () => {
      const policy = RetryPolicies.balanced();
      expect(policy.getConfig().maxAttempts).toBe(10);
      expect(policy.getConfig().maxRetryTimeMs).toBe(120000);
    });
  });
});
