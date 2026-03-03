/**
 * Reconnect Manager Tests (US-09, US-10)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReconnectManager,
  createReconnectManager,
  RECONNECTABLE_REASONS,
  NON_RECONNECTABLE_REASONS,
  GiveUpReason,
} from '../../client/src/reconnect-manager.js';
import { TransitionReason } from '../../client/src/state-machine.js';

describe('ReconnectManager', () => {
  let manager;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (manager) manager.cancel();
    vi.useRealTimers();
  });

  describe('Attempt Counter (SSRK-105)', () => {
    it('should increment attempt on each retry', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 5, jitterPct: 0 },
        onReconnect: () => {},
      });

      expect(manager.attempt).toBe(0);

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);
      expect(manager.attempt).toBe(1);

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(200);
      expect(manager.attempt).toBe(2);
    });

    it('should reset attempt counter on reset()', () => {
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
    });
  });

  describe('maxAttempts Limit (SSRK-106)', () => {
    it('should stop after maxAttempts', () => {
      const onGiveUp = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 2, jitterPct: 0 },
        onGiveUp,
        onReconnect: () => {},
      });

      // Attempt 1
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);

      // Attempt 2
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(200);

      // Attempt 3 - should give up
      const scheduled = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(scheduled).toBe(false);
      expect(onGiveUp).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: GiveUpReason.MAX_ATTEMPTS,
          attempts: 2,
        })
      );
    });
  });

  describe('maxRetryTimeMs Limit (SSRK-107)', () => {
    it('should stop after maxRetryTimeMs', () => {
      const onGiveUp = vi.fn();
      manager = createReconnectManager({
        retryPolicy: {
          baseDelayMs: 100,
          maxAttempts: 100, // High limit
          maxRetryTimeMs: 500, // 500ms time limit
          jitterPct: 0,
        },
        onGiveUp,
        onReconnect: () => {},
      });

      // First failure - starts the clock
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);

      // Advance time beyond limit
      vi.advanceTimersByTime(500);

      // Should give up due to time
      const scheduled = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(scheduled).toBe(false);
      expect(onGiveUp).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: GiveUpReason.MAX_TIME,
        })
      );
    });
  });

  describe('Give Up State (SSRK-108)', () => {
    it('should enter give-up state and stay there', () => {
      const onGiveUp = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 1, jitterPct: 0 },
        onGiveUp,
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);

      // Hit limit
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(manager.hasGivenUp).toBe(true);
      expect(manager.giveUpReason).toBe(GiveUpReason.MAX_ATTEMPTS);

      // Further attempts should be rejected
      const result = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      expect(result).toBe(false);
    });

    it('should track giveUpReason', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 0, maxRetryTimeMs: 100, jitterPct: 0 },
        onGiveUp: () => {},
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(200);

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(manager.giveUpReason).toBe(GiveUpReason.MAX_TIME);
    });
  });

  describe('onGiveUp Callback (SSRK-109)', () => {
    it('should fire onGiveUp with correct info', () => {
      const onGiveUp = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 2, jitterPct: 0 },
        onGiveUp,
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR, new Error('Connection failed'));
      vi.advanceTimersByTime(100);

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR, new Error('Connection failed'));
      vi.advanceTimersByTime(200);

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR, new Error('Connection failed'));

      expect(onGiveUp).toHaveBeenCalledWith({
        reason: GiveUpReason.MAX_ATTEMPTS,
        attempts: 2,
        elapsedMs: expect.any(Number),
        lastError: expect.any(Error),
        lastDisconnectReason: TransitionReason.NETWORK_ERROR,
      });
    });

    it('should fire onGiveUp only once', () => {
      const onGiveUp = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 1, jitterPct: 0 },
        onGiveUp,
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);

      // Hit limit - should fire onGiveUp
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      // More attempts - should NOT fire again
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(onGiveUp).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cleanup (SSRK-110)', () => {
    it('should clear timers on stop()', () => {
      const onReconnect = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxAttempts: 5 },
        onReconnect,
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      expect(manager.isPending).toBe(true);

      manager.stop();

      expect(manager.isPending).toBe(false);

      vi.advanceTimersByTime(2000);
      expect(onReconnect).not.toHaveBeenCalled();
    });

    it('should mark as given up on stop()', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 1000, maxAttempts: 5 },
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      manager.stop();

      expect(manager.hasGivenUp).toBe(true);
      expect(manager.giveUpReason).toBe(GiveUpReason.USER_STOP);
    });
  });

  describe('Manual Restart (SSRK-111)', () => {
    it('should allow restart after give-up', () => {
      const onReconnect = vi.fn();
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 1, jitterPct: 0 },
        onReconnect,
        onGiveUp: () => {},
      });

      // Use up retries
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(manager.hasGivenUp).toBe(true);

      // Restart
      manager.restart();

      expect(manager.hasGivenUp).toBe(false);
      expect(manager.attempt).toBe(0);
      expect(manager.giveUpReason).toBeNull();

      // Should work again
      const scheduled = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      expect(scheduled).toBe(true);
    });
  });

  describe('No Retry After Stop (SSRK-112)', () => {
    it('should not schedule retry after stop()', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 5 },
        onReconnect: () => {},
      });

      manager.stop();

      const scheduled = manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      expect(scheduled).toBe(false);
      expect(manager.isPending).toBe(false);
    });

    it('should not trigger reconnect on intentional disconnect', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 5 },
        onGiveUp: () => {},
      });

      const scheduled = manager.scheduleReconnect(TransitionReason.USER_STOP);

      expect(scheduled).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should include give-up info', () => {
      manager = createReconnectManager({
        retryPolicy: { baseDelayMs: 100, maxAttempts: 1, jitterPct: 0 },
        onGiveUp: () => {},
        onReconnect: () => {},
      });

      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);
      vi.advanceTimersByTime(100);
      manager.scheduleReconnect(TransitionReason.NETWORK_ERROR);

      const stats = manager.getStats();

      expect(stats.hasGivenUp).toBe(true);
      expect(stats.giveUpReason).toBe(GiveUpReason.MAX_ATTEMPTS);
      expect(stats.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });
});
