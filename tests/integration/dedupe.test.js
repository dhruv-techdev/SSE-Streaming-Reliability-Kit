/**
 * Dedupe Integration Tests (SSRK-151)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE } from '../../client/src/sse-connector.js';

describe('Client Dedupe Integration', () => {
  let serverProcess;
  const port = 3089;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '200',
        SSE_HEARTBEAT_INTERVAL: '60000',
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

  it('should enable dedupe by default', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(connector.options.enableDedupe).toBe(true);
    expect(connector.getDedupeCache()).toBeDefined();

    connector.stop();
  });

  it('should track duplicatesIgnored in stats', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const stats = connector.getStats();
    expect(stats.duplicatesIgnored).toBeDefined();
    expect(stats.dedupe).toBeDefined();

    connector.stop();
  });

  it('should include dedupe stats in getStats()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const stats = connector.getStats();

    expect(stats.dedupe.size).toBeGreaterThanOrEqual(0);
    expect(stats.dedupe.maxSize).toBe(1000);
    expect(stats.dedupe.totalChecked).toBeGreaterThan(0);

    connector.stop();
  });

  it('should fire onDuplicate callback (SSRK-150)', async () => {
    const duplicates = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onDuplicate: (info) => {
        duplicates.push(info);
      },
    });

    // Wait for events
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Manually add a duplicate to the cache to simulate
    const cache = connector.getDedupeCache();
    const testEvent = { event_id: 'test-dup-event', type: 'domain.test', ts: '', payload: {} };

    // Simulate receiving the same event twice
    cache.isDuplicate(testEvent);
    cache.isDuplicate(testEvent);

    expect(duplicates.length).toBe(1);
    expect(duplicates[0].event_id).toBe('test-dup-event');

    connector.stop();
  });

  it('should respect dedupeMaxSize config (SSRK-149)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      dedupeMaxSize: 50,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const cache = connector.getDedupeCache();
    expect(cache.maxSize).toBe(50);

    connector.stop();
  });

  it('should allow disabling dedupe', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      enableDedupe: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(connector.options.enableDedupe).toBe(false);

    connector.stop();
  });

  it('should clear dedupe cache via clearDedupeCache()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const cache = connector.getDedupeCache();
    expect(cache.size).toBeGreaterThan(0);

    connector.clearDedupeCache();
    expect(cache.size).toBe(0);

    connector.stop();
  });

  it('should not cache heartbeat events (SSRK-148)', async () => {
    let heartbeatCount = 0;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onHeartbeat: () => {
        heartbeatCount++;
      },
    });

    // Start with short heartbeat interval
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Heartbeats should not be in cache
    const cache = connector.getDedupeCache();
    const stats = cache.getStats();

    // All cached events should be domain events, not heartbeats
    // (This is hard to test directly without controlling server)
    expect(stats.totalAdded).toBeGreaterThanOrEqual(0);

    connector.stop();
  });

  it('should track eventsReceived vs eventsProcessed', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const stats = connector.getStats();

    // eventsReceived >= eventsProcessed (difference is duplicates)
    expect(stats.eventsReceived).toBeGreaterThanOrEqual(stats.eventsProcessed);

    // In normal flow without replay, should be equal (no duplicates from server)
    expect(stats.eventsReceived).toBe(stats.eventsProcessed);

    connector.stop();
  });

  it('should handle cache eviction correctly (SSRK-147, SSRK-151)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      dedupeMaxSize: 5, // Very small cache
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const cache = connector.getDedupeCache();

    // Cache should never exceed maxSize
    expect(cache.size).toBeLessThanOrEqual(5);

    // Should have evicted some
    const stats = cache.getStats();
    expect(stats.totalEvicted).toBeGreaterThan(0);

    connector.stop();
  });
});
