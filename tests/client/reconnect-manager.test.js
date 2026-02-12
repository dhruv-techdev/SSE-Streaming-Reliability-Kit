/**
 * Reconnect Manager Tests (US-09)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReconnectManager,
  createReconnectManager,
  RECONNECTABLE_REASONS,
  NON_RECONNECTABLE_REASONS,
} from '../../client/src/reconnect-manager.js';
import { TransitionReason } from '../../client/src/state-machine.js';

describe('ReconnectManager', () => {
  let manager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = createReconnectManager({
      retryPolicy: {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        maxAttempts: 3,
        jitterPct: 0, // No jitter for predictable tests
      },
    });
  });

  afterEach(() => {
    manager.cancel();
    vi.useRealTimers();
  });

  describe('shouldReconnect (SSRK-100)', () => {
    it('should return true for reconnectable reasons', () => {
      RECONNECTABLE_REASONS.forEach(reason => {
        expect(manager.shouldReconnect(reason)).toBe(true);
      });
    });

    it('should return false for non-reconnectable reasons', () => {
      NON_RECONNECTABLE_REASONS.forEach(reason => {
        expect(manager.shouldReconnect(reason)).toBe(false);
      });
    });

    it('should not reconnect on USER_STOP', () => {
      expect(manager.shouldReconnect(TransitionReason.USER_STOP)).toBe(false);
    });

    it('should reconnect on NETWORK_ERROR', () => {
      expect(manager.shouldReconnect(TransitionReason.NETWORK_ERROR)).toBe(true);
    });

    it('should reconnect on SERVER_CLOSE', () => {
      expect(manager.shouldReconnect(TransitionReason.SERVER_CLOSE)).toBe(true);
    });

    it('should reconnect on CONNECTION_TIMEOUT', () => {
      expect(manager.shouldReconnect(TransitionReason.CONNECTION_TIMEOUT)).toBe(true);
    });
  });

  describe('scheduleReconnect (SSRK-101)', () => {
    it('should schedule reconnect for valid reasons', () => {
      const onReconnect = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxAttempts: 3, jitterPct: 0 },
        onReconnect,
      });

      const scheduled = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      
      expect(scheduled).toBe(true);
      expect(manager.isPending).toBe(true);
      
      // Fast-forward timer
      vi.advanceTimersByTime(1000);
      
      expect(onReconnect).toHaveBeenCalledWith({
        attempt: 1,
        reason: TransitionReason.NETWORK_ERROR,
      });
    });

    it('should not schedule for intentional stops', () => {
      const scheduled = manager.scheduleReconnect(TransitionReason.USER_STOP);
      
      expect(scheduled).toBe(false);
      expect(manager.isPending).toBe(false);
    });

    it('should use exponential backoff for delays', () => {
      const delays = [];
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxDelayMs: 10000, maxAttempts: 5, jitterPct: 0 },
        onRetry: ({ delayMs }) => delays.push(delayMs),
        onReconnect: () => {},
      });

      // First attempt
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(1000);
      
      // Second attempt
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(2000);
      
      // Third attempt
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
    });
  });

  describe('onRetry callback (SSRK-102)', () => {
    it('should fire onRetry with correct info', () => {
      const onRetry = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxAttempts: 5, jitterPct: 0 },
        onRetry,
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      
      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        delayMs: 1000,
        reason: TransitionReason.NETWORK_ERROR,
        maxAttempts: 5,
      });
    });

    it('should increment attempt on each retry', () => {
      const attempts = [];
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 5, jitterPct: 0 },
        onRetry: ({ attempt }) => attempts.push(attempt),
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);
      
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(200);
      
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      
      expect(attempts).toEqual([1, 2, 3]);
    });
  });

  describe('Max attempts (SSRK-100)', () => {
    it('should call onGiveUp when max attempts reached', () => {
      const onGiveUp = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 2, jitterPct: 0 },
        onGiveUp,
        onReconnect: () => {},
      });

      // First attempt
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);
      
      // Second attempt
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(200);
      
      // Third attempt - should give up
      const scheduled = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      
      expect(scheduled).toBe(false);
      expect(onGiveUp).toHaveBeenCalledWith({
        attempts: 2,
        reason: 'max_attempts_reached',
        lastDisconnectReason: TransitionReason.NETWORK_ERROR,
      });
    });
  });

  describe('reset', () => {
    it('should reset attempt counter', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 5, jitterPct: 0 },
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);
      
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(200);
      
      expect(manager.attempt).toBe(2);
      
      manager.reset();
      
      expect(manager.attempt).toBe(0);
      expect(manager.isPending).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should cancel pending reconnect', () => {
      const onReconnect = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxAttempts: 5 },
        onReconnect,
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      expect(manager.isPending).toBe(true);
      
      manager.cancel();
      
      expect(manager.isPending).toBe(false);
      
      vi.advanceTimersByTime(1000);
      expect(onReconnect).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return current stats', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxAttempts: 5 },
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      
      const stats = manager.getStats();
      
      expect(stats.attempt).toBe(0);
      expect(stats.isPending).toBe(true);
      expect(stats.lastReason).toBe(TransitionReason.NETWORK_ERROR);
      expect(stats.policyConfig).toBeDefined();
    });
  });
});
