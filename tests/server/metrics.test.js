/**
 * Metrics Tests (SSRK-165)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsRegistry, createMetrics } from '../../server/src/metrics.js';

describe('MetricsRegistry', () => {
  let metrics;

  beforeEach(() => {
    metrics = createMetrics();
  });

  describe('Active streams gauge (SSRK-159)', () => {
    it('should start at zero', () => {
      expect(metrics.getActiveStreams()).toBe(0);
    });

    it('should increment on stream open', () => {
      metrics.incActiveStreams();
      expect(metrics.getActiveStreams()).toBe(1);

      metrics.incActiveStreams();
      expect(metrics.getActiveStreams()).toBe(2);
    });

    it('should decrement on stream close', () => {
      metrics.incActiveStreams();
      metrics.incActiveStreams();
      expect(metrics.getActiveStreams()).toBe(2);

      metrics.decActiveStreams();
      expect(metrics.getActiveStreams()).toBe(1);
    });

    it('should never go negative', () => {
      metrics.decActiveStreams();
      metrics.decActiveStreams();
      expect(metrics.getActiveStreams()).toBe(0);
    });
  });

  describe('Streams opened counter (SSRK-160)', () => {
    it('should increment once per connection', () => {
      metrics.incStreamsOpened();
      metrics.incStreamsOpened();
      metrics.incStreamsOpened();

      const json = metrics.toJSON();
      expect(json.counters.streams_opened_total).toBe(3);
    });
  });

  describe('Disconnects counter with reason (SSRK-161)', () => {
    it('should track disconnects by reason', () => {
      metrics.incDisconnects('client_close');
      metrics.incDisconnects('client_close');
      metrics.incDisconnects('network_error');
      metrics.incDisconnects('server_shutdown');

      const json = metrics.toJSON();
      expect(json.counters.disconnects_total['client_close']).toBe(2);
      expect(json.counters.disconnects_total['network_error']).toBe(1);
      expect(json.counters.disconnects_total['server_shutdown']).toBe(1);
    });

    it('should handle new reason labels', () => {
      metrics.incDisconnects('new_reason');
      
      const json = metrics.toJSON();
      expect(json.counters.disconnects_total['new_reason']).toBe(1);
    });
  });

  describe('Rejected connections counter (SSRK-162)', () => {
    it('should increment on rejection', () => {
      metrics.incRejectedConnections();
      metrics.incRejectedConnections();

      const json = metrics.toJSON();
      expect(json.counters.rejected_connections_total).toBe(2);
    });
  });

  describe('Heartbeats counter (SSRK-163)', () => {
    it('should track heartbeats sent', () => {
      metrics.incHeartbeatsSent();
      metrics.incHeartbeatsSent();
      metrics.incHeartbeatsSent();

      const json = metrics.toJSON();
      expect(json.counters.heartbeats_sent_total).toBe(3);
    });

    it('should track heartbeats failed', () => {
      metrics.incHeartbeatsFailed();

      const json = metrics.toJSON();
      expect(json.counters.heartbeats_failed_total).toBe(1);
    });
  });

  describe('Replay metrics', () => {
    it('should track replay attempts', () => {
      metrics.incReplaysAttempted();
      metrics.incReplaysAttempted();

      const json = metrics.toJSON();
      expect(json.counters.replays_attempted_total).toBe(2);
    });

    it('should track replay successes', () => {
      metrics.incReplaysSucceeded();

      const json = metrics.toJSON();
      expect(json.counters.replays_succeeded_total).toBe(1);
    });

    it('should track replay failures', () => {
      metrics.incReplaysFailed();

      const json = metrics.toJSON();
      expect(json.counters.replays_failed_total).toBe(1);
    });

    it('should track replay events sent', () => {
      metrics.incReplayEventsSent(10);
      metrics.incReplayEventsSent(5);

      const json = metrics.toJSON();
      expect(json.counters.replay_events_sent_total).toBe(15);
    });
  });

  describe('Cannot resume counter', () => {
    it('should track by reason', () => {
      metrics.incCannotResume('event_not_found');
      metrics.incCannotResume('event_not_found');
      metrics.incCannotResume('buffer_expired');

      const json = metrics.toJSON();
      expect(json.counters.cannot_resume_total['event_not_found']).toBe(2);
      expect(json.counters.cannot_resume_total['buffer_expired']).toBe(1);
    });
  });

  describe('Prometheus format (SSRK-158)', () => {
    it('should export valid Prometheus text format', () => {
      metrics.incActiveStreams();
      metrics.incStreamsOpened();
      metrics.incDisconnects('client_close');
      metrics.incHeartbeatsSent();

      const prometheus = metrics.toPrometheus();

      // Check format
      expect(prometheus).toContain('# HELP sse_server_active_streams');
      expect(prometheus).toContain('# TYPE sse_server_active_streams gauge');
      expect(prometheus).toContain('sse_server_active_streams 1');

      expect(prometheus).toContain('# TYPE sse_server_streams_opened_total counter');
      expect(prometheus).toContain('sse_server_streams_opened_total 1');

      expect(prometheus).toContain('sse_server_disconnects_total{reason="client_close"} 1');
      expect(prometheus).toContain('sse_server_heartbeats_sent_total 1');
    });

    it('should include all metric types', () => {
      const prometheus = metrics.toPrometheus();

      expect(prometheus).toContain('sse_server_uptime_seconds');
      expect(prometheus).toContain('sse_server_active_streams');
      expect(prometheus).toContain('sse_server_streams_opened_total');
      expect(prometheus).toContain('sse_server_disconnects_total');
      expect(prometheus).toContain('sse_server_rejected_connections_total');
      expect(prometheus).toContain('sse_server_heartbeats_sent_total');
      expect(prometheus).toContain('sse_server_heartbeats_failed_total');
      expect(prometheus).toContain('sse_server_events_sent_total');
      expect(prometheus).toContain('sse_server_replays_attempted_total');
      expect(prometheus).toContain('sse_server_replays_succeeded_total');
      expect(prometheus).toContain('sse_server_replays_failed_total');
      expect(prometheus).toContain('sse_server_replay_events_sent_total');
      expect(prometheus).toContain('sse_server_cannot_resume_total');
    });

    it('should handle empty label sets', () => {
      const prometheus = metrics.toPrometheus();

      // When no disconnects, should have a placeholder
      expect(prometheus).toContain('sse_server_disconnects_total{reason="none"} 0');
    });
  });

  describe('JSON format', () => {
    it('should export valid JSON', () => {
      metrics.incActiveStreams();
      metrics.incStreamsOpened();

      const json = metrics.toJSON();

      expect(json.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(json.gauges.active_streams).toBe(1);
      expect(json.counters.streams_opened_total).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      metrics.incActiveStreams();
      metrics.incStreamsOpened();
      metrics.incDisconnects('test');
      metrics.incHeartbeatsSent();

      metrics.reset();

      const json = metrics.toJSON();
      expect(json.gauges.active_streams).toBe(0);
      expect(json.counters.streams_opened_total).toBe(0);
      expect(json.counters.disconnects_total).toEqual({});
      expect(json.counters.heartbeats_sent_total).toBe(0);
    });
  });
});
