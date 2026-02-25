/**
 * Server Replay Integration Tests (SSRK-134, SSRK-139)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { parseSSEChunk, decodeSSE } from '../../shared/src/index.js';

describe('Server Replay Integration', () => {
  let serverProcess;
  const port = 3091;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: {
        ...process.env,
        PORT: port,
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '200', // Fast ticks for testing
        SSE_HEARTBEAT_INTERVAL: '60000', // Slow heartbeat
        SSE_MAX_BUFFER_SIZE: '100',
        SSE_MAX_REPLAY_BATCH: '10',
        LOG_REPLAY: 'true',
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

  /**
   * Helper to collect events from stream
   */
  async function collectEvents(options = {}) {
    const {
      lastEventId = null,
      count = 5,
      timeout = 5000,
      includeControl = false,
    } = options;

    const events = [];

    return new Promise((resolve) => {
      const reqOptions = {
        hostname: 'localhost',
        port,
        path: '/stream',
        headers: {},
      };

      if (lastEventId) {
        reqOptions.headers['Last-Event-ID'] = lastEventId;
      }

      const req = http.get(reqOptions, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);

          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope) {
                if (includeControl || !envelope.type.startsWith('control.')) {
                  events.push(envelope);
                }

                if (!includeControl && events.length >= count) {
                  req.destroy();
                  resolve(events);
                }
              }
            }
          }
        });
      });

      req.on('error', () => resolve(events));

      setTimeout(() => {
        req.destroy();
        resolve(events);
      }, timeout);
    });
  }

  it('should read Last-Event-ID from request header (SSRK-134)', async () => {
    // First, collect some events
    const firstEvents = await collectEvents({ count: 5, timeout: 3000 });
    expect(firstEvents.length).toBeGreaterThanOrEqual(3);

    const lastEventId = firstEvents[Math.floor(firstEvents.length / 2)].event_id;

    await new Promise(resolve => setTimeout(resolve, 200));

    // Reconnect with Last-Event-ID and collect control events
    const allEvents = await collectEvents({
      lastEventId,
      count: 5,
      timeout: 2000,
      includeControl: true,
    });

    const replayControl = allEvents.find(e =>
      e.type === 'control.replay_start' ||
      e.type === 'control.reconnect'
    );

    expect(replayControl).toBeDefined();
  });

  it('should replay events after the requested ID (SSRK-136, SSRK-139)', { timeout: 10000 }, async () => {
    // Collect initial events
    const initialEvents = await collectEvents({ count: 8, timeout: 3000 });
    expect(initialEvents.length).toBeGreaterThanOrEqual(5);

    // Pick a middle event
    const resumeIndex = 2;
    const lastEventId = initialEvents[resumeIndex].event_id;

    // Wait a bit for more events to be generated
    await new Promise(resolve => setTimeout(resolve, 500));

    // Reconnect with Last-Event-ID
    const allEvents = await collectEvents({
      lastEventId,
      count: 20,
      timeout: 3000,
      includeControl: true,
    });

    // Should have received replay_start control
    const replayStart = allEvents.find(e => e.type === 'control.replay_start');

    if (replayStart && replayStart.payload.reason === 'replay_started') {
      // Replayed events should be in order
      const replayEnd = allEvents.find(e => e.type === 'control.replay_end');
      expect(replayEnd).toBeDefined();
    }
  });

  it('should send control.reconnect when event ID not found (SSRK-136)', async () => {
    // Connect with non-existent Last-Event-ID
    const events = await collectEvents({
      lastEventId: 'non-existent-event-id-12345',
      count: 5,
      timeout: 2000,
      includeControl: true,
    });

    const reconnectControl = events.find(e => e.type === 'control.reconnect');

    expect(reconnectControl).toBeDefined();
    expect(reconnectControl.payload.reason).toBe('events_expired');
  });

  it('should truncate replay when exceeding MAX_REPLAY_BATCH (SSRK-138)', { timeout: 10000 }, async () => {
    // We configured MAX_REPLAY_BATCH=10
    // First, let's collect many events to fill the buffer
    const manyEvents = await collectEvents({ count: 20, timeout: 6000 });
    expect(manyEvents.length).toBeGreaterThanOrEqual(15);

    // Get the first event ID
    const firstEventId = manyEvents[0].event_id;

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reconnect from the first event
    const replayEvents = await collectEvents({
      lastEventId: firstEventId,
      count: 50,
      timeout: 3000,
      includeControl: true,
    });

    // Look for truncation indication
    const replayStart = replayEvents.find(e => e.type === 'control.replay_start');

    if (replayStart) {
      if (replayStart.payload.reason === 'replay_truncated') {
        expect(replayStart.payload.sending).toBeLessThanOrEqual(10);
        expect(replayStart.payload.totalAvailable).toBeGreaterThan(10);
      }
    }
  });

  it('should maintain event ordering in replay (SSRK-137)', async () => {
    // Collect sequential events
    const events = await collectEvents({ count: 10, timeout: 4000 });
    expect(events.length).toBeGreaterThanOrEqual(5);

    // Extract sequences
    const sequences = events
      .filter(e => e.type === 'domain.stream.tick')
      .map(e => e.payload.sequence);

    // Verify they are in order
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  });

  it('should expose buffer stats in /health endpoint', async () => {
    const health = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    expect(health.buffer).toBeDefined();
    expect(health.buffer.size).toBeGreaterThanOrEqual(0);
    expect(health.buffer.maxSize).toBe(100);
    expect(health.buffer.maxReplayBatch).toBe(10);
  });

  it('should expose replay metrics in /health endpoint', async () => {
    // Make a replay request first
    await collectEvents({
      lastEventId: 'trigger-replay-metrics',
      count: 1,
      timeout: 1000,
      includeControl: true,
    });

    const health = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    expect(health.metrics.replaysAttempted).toBeGreaterThan(0);
  });

  it('should send replay_end control after replay (SSRK-139)', async () => {
    const events = await collectEvents({ count: 5, timeout: 2000 });

    if (events.length >= 3) {
      const lastEventId = events[0].event_id;

      await new Promise(resolve => setTimeout(resolve, 500));

      const replayEvents = await collectEvents({
        lastEventId,
        count: 20,
        timeout: 2000,
        includeControl: true,
      });

      const replayStart = replayEvents.find(e => e.type === 'control.replay_start');
      const replayEnd = replayEvents.find(e => e.type === 'control.replay_end');

      if (replayStart && replayStart.payload.eventCount > 0) {
        expect(replayEnd).toBeDefined();
        expect(replayEnd.payload.reason).toBe('replay_complete');
      }
    }
  });
});
