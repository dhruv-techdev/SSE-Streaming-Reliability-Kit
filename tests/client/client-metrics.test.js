/**
 * Client Metrics Tests (SSRK-173)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClientMetrics,
  createClientMetrics,
  MetricsSink,
  ConsoleMetricsSink,
  InMemoryMetricsSink,
  createInMemorySink,
} from '../../client/src/client-metrics.js';

describe('ClientMetrics', () => {
  describe('Metrics Sink Interface (SSRK-166)', () => {
    it('should have default no-op sink', () => {
      const metrics = createClientMetrics();

      // Should not throw
      metrics.incReconnectAttempts();
      metrics.incDuplicateEvents();
      metrics.recordEventLag(100);
    });

    it('should accept custom sink', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incReconnectAttempts('network_error');

      expect(
        sink.getCounter('sse_client_reconnect_attempts_total', { reason: 'network_error' })
      ).toBe(1);
    });
  });

  describe('InMemoryMetricsSink', () => {
    let sink;

    beforeEach(() => {
      sink = createInMemorySink();
    });

    it('should store counters', () => {
      sink.incCounter('test_counter', 1);
      sink.incCounter('test_counter', 2);

      expect(sink.getCounter('test_counter')).toBe(3);
    });

    it('should store counters with labels', () => {
      sink.incCounter('labeled_counter', 1, { type: 'a' });
      sink.incCounter('labeled_counter', 1, { type: 'b' });
      sink.incCounter('labeled_counter', 1, { type: 'a' });

      expect(sink.getCounter('labeled_counter', { type: 'a' })).toBe(2);
      expect(sink.getCounter('labeled_counter', { type: 'b' })).toBe(1);
    });

    it('should store gauges', () => {
      sink.setGauge('test_gauge', 42);
      expect(sink.getGauge('test_gauge')).toBe(42);

      sink.setGauge('test_gauge', 100);
      expect(sink.getGauge('test_gauge')).toBe(100);
    });

    it('should store histogram observations', () => {
      sink.observe('test_histogram', 10);
      sink.observe('test_histogram', 20);
      sink.observe('test_histogram', 30);

      expect(sink.getHistogram('test_histogram')).toEqual([10, 20, 30]);
    });

    it('should reset all metrics', () => {
      sink.incCounter('counter');
      sink.setGauge('gauge', 1);
      sink.observe('histogram', 1);

      sink.reset();

      expect(sink.getCounter('counter')).toBe(0);
      expect(sink.getGauge('gauge')).toBeUndefined();
      expect(sink.getHistogram('histogram')).toEqual([]);
    });

    it('should export to JSON', () => {
      sink.incCounter('c1', 5);
      sink.setGauge('g1', 10);
      sink.observe('h1', 100);

      const json = sink.toJSON();

      expect(json.counters.c1).toBe(5);
      expect(json.gauges.g1).toBe(10);
      expect(json.histograms.h1).toEqual([100]);
    });
  });

  describe('Reconnect attempts counter (SSRK-167)', () => {
    it('should increment with reason label', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incReconnectAttempts('network_error');
      metrics.incReconnectAttempts('network_error');
      metrics.incReconnectAttempts('server_close');

      expect(
        sink.getCounter('sse_client_reconnect_attempts_total', { reason: 'network_error' })
      ).toBe(2);
      expect(
        sink.getCounter('sse_client_reconnect_attempts_total', { reason: 'server_close' })
      ).toBe(1);
    });
  });

  describe('Resume success/failure counters (SSRK-168)', () => {
    it('should track resume success', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incResumeSuccess();
      metrics.incResumeSuccess();

      expect(sink.getCounter('sse_client_resume_success_total')).toBe(2);
    });

    it('should track resume failure with reason', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incResumeFailure('event_not_found');
      metrics.incResumeFailure('buffer_expired');

      expect(
        sink.getCounter('sse_client_resume_failure_total', { reason: 'event_not_found' })
      ).toBe(1);
      expect(sink.getCounter('sse_client_resume_failure_total', { reason: 'buffer_expired' })).toBe(
        1
      );
    });
  });

  describe('Duplicate events counter (SSRK-169)', () => {
    it('should track duplicates by event type', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incDuplicateEvents('domain.user.created');
      metrics.incDuplicateEvents('domain.user.created');
      metrics.incDuplicateEvents('domain.order.placed');

      expect(
        sink.getCounter('sse_client_duplicate_events_total', { type: 'domain.user.created' })
      ).toBe(2);
      expect(
        sink.getCounter('sse_client_duplicate_events_total', { type: 'domain.order.placed' })
      ).toBe(1);
    });
  });

  describe('Event lag measurement (SSRK-170)', () => {
    it('should record event lag', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.recordEventLag(100);
      metrics.recordEventLag(200);
      metrics.recordEventLag(50);

      expect(sink.getHistogram('sse_client_event_lag_ms')).toEqual([100, 200, 50]);
    });

    it('should calculate lag from timestamp', () => {
      const metrics = createClientMetrics();

      const now = Date.now();
      const eventTs = new Date(now - 500).toISOString();

      const lag = metrics.calculateLag(eventTs);

      // Should be approximately 500ms (allow some tolerance)
      expect(lag).toBeGreaterThanOrEqual(500);
      expect(lag).toBeLessThan(600);
    });

    it('should record lag from envelope', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      const envelope = {
        event_id: 'test',
        type: 'domain.test',
        ts: new Date(Date.now() - 100).toISOString(),
        payload: {},
      };

      metrics.recordEventLagFromEnvelope(envelope);

      const observations = sink.getHistogram('sse_client_event_lag_ms');
      expect(observations.length).toBe(1);
      expect(observations[0]).toBeGreaterThanOrEqual(100);
    });

    it('should compute lag statistics', () => {
      const metrics = createClientMetrics();

      metrics.recordEventLag(10);
      metrics.recordEventLag(20);
      metrics.recordEventLag(30);
      metrics.recordEventLag(40);
      metrics.recordEventLag(50);

      const stats = metrics.getLagStats();

      expect(stats.count).toBe(5);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.avg).toBe(30);
    });

    it('should limit lag samples', () => {
      const metrics = createClientMetrics({ maxLagSamples: 3 });

      metrics.recordEventLag(1);
      metrics.recordEventLag(2);
      metrics.recordEventLag(3);
      metrics.recordEventLag(4);
      metrics.recordEventLag(5);

      const stats = metrics.getLagStats();
      expect(stats.count).toBe(3);
    });
  });

  describe('Liveness failures counter (SSRK-171)', () => {
    it('should track liveness failures', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incLivenessFailures();
      metrics.incLivenessFailures();

      expect(sink.getCounter('sse_client_liveness_failures_total')).toBe(2);
    });
  });

  describe('Additional counters', () => {
    it('should track events received', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incEventsReceived();
      metrics.incEventsReceived();

      expect(sink.getCounter('sse_client_events_received_total')).toBe(2);
    });

    it('should track events processed', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incEventsProcessed();

      expect(sink.getCounter('sse_client_events_processed_total')).toBe(1);
    });

    it('should track out-of-order events', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incOutOfOrderEvents();

      expect(sink.getCounter('sse_client_out_of_order_events_total')).toBe(1);
    });

    it('should track connections opened', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incConnectionsOpened();

      expect(sink.getCounter('sse_client_connections_opened_total')).toBe(1);
    });

    it('should track connections closed with reason', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.incConnectionsClosed('client_close');

      expect(
        sink.getCounter('sse_client_connections_closed_total', { reason: 'client_close' })
      ).toBe(1);
    });

    it('should set connection state gauge', () => {
      const sink = createInMemorySink();
      const metrics = createClientMetrics({ sink });

      metrics.setConnectionState('open');

      expect(sink.getGauge('sse_client_connection_state', { state: 'open' })).toBe(2);
    });
  });
});
