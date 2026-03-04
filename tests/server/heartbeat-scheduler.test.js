/**
 * Heartbeat Scheduler Tests (SSRK-115, SSRK-116)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HeartbeatScheduler,
  createHeartbeatScheduler,
} from '../../server/src/heartbeat-scheduler.js';

describe('HeartbeatScheduler', () => {
  let scheduler;
  let mockWriter;

  beforeEach(() => {
    vi.useFakeTimers();

    mockWriter = {
      sendEvent: vi.fn().mockReturnValue(true),
      connected: true,
    };
  });

  afterEach(() => {
    if (scheduler) scheduler.stop();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create scheduler with default options', () => {
      scheduler = createHeartbeatScheduler({
        writer: mockWriter,
      });

      expect(scheduler.intervalMs).toBe(30000);
      expect(scheduler.isRunning).toBe(false);
    });

    it('should accept custom interval', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 15000,
        writer: mockWriter,
      });

      expect(scheduler.intervalMs).toBe(15000);
    });

    it('should accept connection ID', () => {
      scheduler = createHeartbeatScheduler({
        connectionId: 'test-conn-123',
        writer: mockWriter,
      });

      expect(scheduler.connectionId).toBe('test-conn-123');
    });
  });

  describe('Start/Stop (SSRK-115)', () => {
    it('should start and begin sending heartbeats', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();
      expect(scheduler.isRunning).toBe(true);

      // Advance time to trigger heartbeat
      vi.advanceTimersByTime(1000);

      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(1);
    });

    it('should stop sending heartbeats when stopped', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);
      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(1);

      scheduler.stop();
      expect(scheduler.isRunning).toBe(false);

      vi.advanceTimersByTime(2000);
      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(1); // No more calls
    });

    it('should not start twice', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();
      scheduler.start();

      vi.advanceTimersByTime(1000);
      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('Heartbeat Events (SSRK-113)', () => {
    it('should send heartbeat with correct payload', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        connectionId: 'test-conn',
        writer: mockWriter,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);

      expect(mockWriter.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system.heartbeat',
          payload: expect.objectContaining({
            server_time: expect.any(String),
            interval_ms: 1000,
            connection_id: 'test-conn',
          }),
        })
      );
    });

    it('should send multiple heartbeats at interval', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();

      vi.advanceTimersByTime(1000);
      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(1000);
      expect(mockWriter.sendEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('Safe Write / Error Handling (SSRK-116)', () => {
    it('should stop on write failure', () => {
      mockWriter.sendEvent.mockReturnValue(false);

      const onError = vi.fn();
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
        onError,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);

      expect(scheduler.isRunning).toBe(false);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'heartbeat_write_failed',
        })
      );
    });

    it('should stop on write exception', () => {
      mockWriter.sendEvent.mockImplementation(() => {
        throw new Error('Socket closed');
      });

      const onError = vi.fn();
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
        onError,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);

      expect(scheduler.isRunning).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should track failed count', () => {
      mockWriter.sendEvent.mockReturnValue(false);

      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);

      const stats = scheduler.getStats();
      expect(stats.failedCount).toBe(1);
    });
  });

  describe('Callbacks', () => {
    it('should fire onHeartbeat callback on success', () => {
      const onHeartbeat = vi.fn();
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        connectionId: 'test-conn',
        writer: mockWriter,
        onHeartbeat,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);

      expect(onHeartbeat).toHaveBeenCalledWith({
        connectionId: 'test-conn',
        count: 1,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Statistics (SSRK-118)', () => {
    it('should track heartbeat count', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();

      vi.advanceTimersByTime(3000);

      const stats = scheduler.getStats();
      expect(stats.heartbeatCount).toBe(3);
    });

    it('should track last heartbeat time', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 1000,
        writer: mockWriter,
      });

      scheduler.start();
      vi.advanceTimersByTime(1000);

      const stats = scheduler.getStats();
      expect(stats.lastHeartbeatTime).not.toBeNull();
    });

    it('should include all stats', () => {
      scheduler = createHeartbeatScheduler({
        intervalMs: 5000,
        connectionId: 'stats-test',
        writer: mockWriter,
      });

      scheduler.start();

      const stats = scheduler.getStats();

      expect(stats).toEqual({
        connectionId: 'stats-test',
        intervalMs: 5000,
        isRunning: true,
        heartbeatCount: 0,
        failedCount: 0,
        lastHeartbeatTime: null,
      });
    });
  });
});
