/**
 * Liveness Monitor Tests (US-12)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LivenessMonitor, createLivenessMonitor } from '../../client/src/liveness-monitor.js';
import { DisconnectReason } from '../../shared/src/index.js';

describe('LivenessMonitor', () => {
  let monitor;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) monitor.stop();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create monitor with default options', () => {
      monitor = createLivenessMonitor();

      expect(monitor.timeoutMs).toBe(45000);
      expect(monitor.gracePeriodMs).toBe(5000);
      expect(monitor.isRunning).toBe(false);
    });

    it('should accept custom timeout (SSRK-121)', () => {
      monitor = createLivenessMonitor({
        timeoutMs: 30000,
        gracePeriodMs: 3000,
      });

      expect(monitor.timeoutMs).toBe(30000);
      expect(monitor.gracePeriodMs).toBe(3000);
    });
  });

  describe('lastHeartbeatAt tracking (SSRK-120)', () => {
    it('should store lastHeartbeatAt when heartbeat received', () => {
      monitor = createLivenessMonitor();
      monitor.start();

      expect(monitor.lastHeartbeatAt).toBeNull();

      monitor.recordHeartbeat();

      expect(monitor.lastHeartbeatAt).not.toBeNull();
      expect(typeof monitor.lastHeartbeatAt).toBe('number');
    });

    it('should update lastHeartbeatAt on each heartbeat', () => {
      monitor = createLivenessMonitor();
      monitor.start();

      monitor.recordHeartbeat();
      const first = monitor.lastHeartbeatAt;

      vi.advanceTimersByTime(1000);
      monitor.recordHeartbeat();
      const second = monitor.lastHeartbeatAt;

      expect(second).toBeGreaterThan(first);
    });

    it('should track heartbeat count', () => {
      monitor = createLivenessMonitor();
      monitor.start();

      monitor.recordHeartbeat();
      monitor.recordHeartbeat();
      monitor.recordHeartbeat();

      const stats = monitor.getStats();
      expect(stats.heartbeatsReceived).toBe(3);
    });
  });

  describe('Liveness timeout config (SSRK-121)', () => {
    it('should use default LIVENESS_TIMEOUT_MS', () => {
      monitor = createLivenessMonitor();
      expect(monitor.timeoutMs).toBe(45000);
    });

    it('should allow custom timeout via config', () => {
      monitor = createLivenessMonitor({ timeoutMs: 60000 });
      expect(monitor.timeoutMs).toBe(60000);
    });

    it('should update timeout via setTimeoutMs', () => {
      monitor = createLivenessMonitor();
      monitor.setTimeoutMs(20000);
      expect(monitor.timeoutMs).toBe(20000);
    });
  });

  describe('Liveness check timer (SSRK-122)', () => {
    it('should start periodic check on start()', () => {
      monitor = createLivenessMonitor({
        timeoutMs: 5000,
        gracePeriodMs: 1000,
        checkIntervalMs: 1000,
      });

      monitor.start();
      expect(monitor.isRunning).toBe(true);
    });

    it('should run checks at interval', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 3000,
        gracePeriodMs: 500,
        checkIntervalMs: 1000,
        onLivenessFailure: onFailure,
      });

      monitor.start();

      // During grace period - no check
      vi.advanceTimersByTime(500);
      expect(onFailure).not.toHaveBeenCalled();

      // After grace period but no heartbeat yet - no failure
      vi.advanceTimersByTime(1000);
      expect(onFailure).not.toHaveBeenCalled();

      // Record heartbeat
      monitor.recordHeartbeat();

      // Now checks are active, but heartbeat was just received
      vi.advanceTimersByTime(1000);
      expect(onFailure).not.toHaveBeenCalled();
    });
  });

  describe('Trigger recovery on missed heartbeat (SSRK-123)', () => {
    it('should trigger failure when heartbeat missed', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 2000,
        gracePeriodMs: 500,
        checkIntervalMs: 1000,
        onLivenessFailure: onFailure,
      });

      monitor.start();
      
      // Pass grace period
      vi.advanceTimersByTime(500);
      
      // Record heartbeat
      monitor.recordHeartbeat();
      
      // Advance past timeout
      vi.advanceTimersByTime(3000);

      expect(onFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: DisconnectReason.HEARTBEAT_MISSED,
          lastHeartbeatAt: expect.any(Number),
          elapsedMs: expect.any(Number),
        })
      );
    });

    it('should include elapsed time in failure callback', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 2000,
        gracePeriodMs: 500,
        checkIntervalMs: 500,
        onLivenessFailure: onFailure,
      });

      monitor.start();
      vi.advanceTimersByTime(500);
      monitor.recordHeartbeat();
      vi.advanceTimersByTime(3000);

      expect(onFailure).toHaveBeenCalled();
      const callArg = onFailure.mock.calls[0][0];
      expect(callArg.elapsedMs).toBeGreaterThan(2000);
    });
  });

  describe('Grace period - no false positives (SSRK-124)', () => {
    it('should not check liveness during grace period', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 1000,
        gracePeriodMs: 5000,
        checkIntervalMs: 500,
        onLivenessFailure: onFailure,
      });

      monitor.start();

      // Within grace period - no failure even without heartbeat
      vi.advanceTimersByTime(3000);
      expect(onFailure).not.toHaveBeenCalled();
    });

    it('should not check until first heartbeat received', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 1000,
        gracePeriodMs: 500,
        checkIntervalMs: 500,
        onLivenessFailure: onFailure,
      });

      monitor.start();

      // Past grace period but no heartbeat yet
      vi.advanceTimersByTime(3000);
      expect(onFailure).not.toHaveBeenCalled();
      expect(monitor.hasReceivedHeartbeat).toBe(false);

      // Record heartbeat - now checks are active
      monitor.recordHeartbeat();
      expect(monitor.hasReceivedHeartbeat).toBe(true);

      // Now timeout will be enforced
      vi.advanceTimersByTime(2000);
      expect(onFailure).toHaveBeenCalled();
    });
  });

  describe('onLivenessFailure callback (SSRK-125)', () => {
    it('should fire callback with correct info', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 1000,
        gracePeriodMs: 100,
        checkIntervalMs: 500,
        onLivenessFailure: onFailure,
      });

      monitor.start();
      vi.advanceTimersByTime(100);
      monitor.recordHeartbeat();
      vi.advanceTimersByTime(2000);

      expect(onFailure).toHaveBeenCalledWith({
        reason: DisconnectReason.HEARTBEAT_MISSED,
        lastHeartbeatAt: expect.any(Number),
        elapsedMs: expect.any(Number),
        timeoutMs: 1000,
      });
    });

    it('should fire callback only once per failure', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 1000,
        gracePeriodMs: 100,
        checkIntervalMs: 300,
        onLivenessFailure: onFailure,
      });

      monitor.start();
      vi.advanceTimersByTime(100);
      monitor.recordHeartbeat();
      vi.advanceTimersByTime(5000);

      expect(onFailure).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cleanup on stop/close (SSRK-127)', () => {
    it('should stop timer on stop()', () => {
      const onFailure = vi.fn();
      monitor = createLivenessMonitor({
        timeoutMs: 1000,
        gracePeriodMs: 100,
        checkIntervalMs: 500,
        onLivenessFailure: onFailure,
      });

      monitor.start();
      vi.advanceTimersByTime(100);
      monitor.recordHeartbeat();

      monitor.stop();

      vi.advanceTimersByTime(5000);
      expect(onFailure).not.toHaveBeenCalled();
    });

    it('should clear state on reset()', () => {
      monitor = createLivenessMonitor();
      monitor.start();
      monitor.recordHeartbeat();
      monitor.recordHeartbeat();

      expect(monitor.lastHeartbeatAt).not.toBeNull();
      expect(monitor.getStats().heartbeatsReceived).toBe(2);

      monitor.reset();

      expect(monitor.lastHeartbeatAt).toBeNull();
      expect(monitor.isRunning).toBe(false);
    });

    it('should not run after stop', () => {
      monitor = createLivenessMonitor();
      monitor.start();
      monitor.stop();

      expect(monitor.isRunning).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track all stats', () => {
      monitor = createLivenessMonitor({
        timeoutMs: 5000,
        gracePeriodMs: 1000,
      });

      monitor.start();
      monitor.recordHeartbeat();
      monitor.recordEvent();
      monitor.recordEvent();

      const stats = monitor.getStats();

      expect(stats.isRunning).toBe(true);
      expect(stats.timeoutMs).toBe(5000);
      expect(stats.gracePeriodMs).toBe(1000);
      expect(stats.heartbeatsReceived).toBe(1);
      expect(stats.eventsReceived).toBe(2);
      expect(stats.firstHeartbeatReceived).toBe(true);
    });

    it('should track timeSinceLastHeartbeat', () => {
      monitor = createLivenessMonitor();
      monitor.start();
      monitor.recordHeartbeat();

      vi.advanceTimersByTime(1000);

      expect(monitor.timeSinceLastHeartbeat).toBeGreaterThanOrEqual(1000);
    });
  });
});
