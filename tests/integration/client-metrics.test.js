/**
 * Client Metrics Integration Tests (SSRK-173)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE, createInMemorySink } from '../../client/src/sse-connector.js';

describe('Client Metrics Integration', () => {
  let serverProcess;
  const port = 3086;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '200',
        SSE_HEARTBEAT_INTERVAL: '800',
      },
      stdio: 'pipe',
    });

    await new Promise((resolve) => {
      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('SSE Streaming')) {
          resolve();
        }
      });
      setTimeout(resolve, 2000);
    });
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('should enable metrics by default', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(connector.options.enableMetrics).toBe(true);
    expect(connector.getMetrics()).toBeDefined();

    connector.stop();
  });

  it('should accept custom metrics sink', async () => {
    const sink = createInMemorySink();
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      metricsSink: sink,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should have recorded some metrics
    expect(sink.getCounter('sse_client_connections_opened_total')).toBe(1);
    expect(sink.getCounter('sse_client_events_received_total')).toBeGreaterThan(0);

    connector.stop();
  });

  it('should increment reconnect_attempts_total on retry (SSRK-167)', async () => {
    const sink = createInMemorySink();
    
    // Connect to non-existent port to trigger retry
    const connector = connectSSE(`http://localhost:39999/stream`, {
      autoReconnect: true,
      enableLivenessCheck: false,
      metricsSink: sink,
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 3,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have recorded reconnect attempts
    const reconnects = Object.keys(sink.counters)
      .filter(k => k.includes('reconnect_attempts_total'))
      .reduce((sum, k) => sum + sink.counters[k], 0);
    
    expect(reconnects).toBeGreaterThan(0);

    connector.stop();
  });

  it('should track resume success/failure (SSRK-168)', async () => {
    const sink = createInMemorySink();
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      metricsSink: sink,
    });

    // Set fake lastEventId to trigger cannot-resume
    connector.lastEventId = 'fake-event-id-that-does-not-exist';
    
    connector.stop();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have recorded resume failure
    const failures = Object.keys(sink.counters)
      .filter(k => k.includes('resume_failure_total'))
      .reduce((sum, k) => sum + sink.counters[k], 0);
    
    expect(failures).toBe(1);

    connector.stop();
  });

  it('should track duplicate_events_total on duplicates (SSRK-169)', async () => {
    const sink = createInMemorySink();
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      metricsSink: sink,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Manually trigger duplicate detection
    const cache = connector.getDedupeCache();
    cache.isDuplicate({ event_id: 'dup-test', type: 'domain.test', ts: '', payload: {} });
    cache.isDuplicate({ event_id: 'dup-test', type: 'domain.test', ts: '', payload: {} });

    const duplicates = sink.getCounter('sse_client_duplicate_events_total', { type: 'domain.test' });
    expect(duplicates).toBe(1);

    connector.stop();
  });

  it('should record event_lag_ms (SSRK-170)', async () => {
    const sink = createInMemorySink();
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      metricsSink: sink,
      trackEventLag: true,
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have recorded lag observations
    const lagObs = sink.getHistogram('sse_client_event_lag_ms');
    expect(lagObs.length).toBeGreaterThan(0);

    // Lag stats should be available
    const stats = connector.getStats();
    expect(stats.lag.count).toBeGreaterThan(0);

    connector.stop();
  });

  it('should track liveness_failures_total (SSRK-171)', async () => {
    const sink = createInMemorySink();
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: true,
      livenessTimeoutMs: 500, // Very short timeout
      livenessGracePeriodMs: 100,
      metricsSink: sink,
    });

    // Wait for liveness failure (heartbeat interval is 60s, timeout is 500ms)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const failures = sink.getCounter('sse_client_liveness_failures_total');
    expect(failures).toBeGreaterThanOrEqual(1);

    connector.stop();
  });

  it('should include lag stats in getStats()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      trackEventLag: true,
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = connector.getStats();

    expect(stats.lag).toBeDefined();
    expect(stats.lag.count).toBeGreaterThan(0);
    expect(stats.lag.min).toBeGreaterThanOrEqual(0);
    expect(stats.lag.max).toBeGreaterThanOrEqual(0);
    expect(stats.lag.avg).toBeGreaterThanOrEqual(0);

    connector.stop();
  });

  it('should allow disabling metrics', async () => {
    const sink = createInMemorySink();
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      enableMetrics: false,
      metricsSink: sink,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Metrics should not be recorded
    expect(Object.keys(sink.counters).length).toBe(0);

    connector.stop();
  });
});
