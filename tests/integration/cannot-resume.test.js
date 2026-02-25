/**
 * Cannot Resume Integration Tests (SSRK-145)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { connectSSE, CannotResumeFallback } from '../../client/src/sse-connector.js';
import { parseSSEChunk, decodeSSE } from '../../shared/src/index.js';

describe('Cannot Resume Integration', () => {
  let serverProcess;
  const port = 3090;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '200',
        SSE_HEARTBEAT_INTERVAL: '60000',
        SSE_MAX_BUFFER_SIZE: '20', // Small buffer for testing
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

  it('should send control.cannot_resume when event ID not found (SSRK-141)', async () => {
    const events = [];
    
    await new Promise((resolve) => {
      const req = http.get({
        hostname: 'localhost',
        port,
        path: '/stream',
        headers: { 'Last-Event-ID': 'non-existent-event-id-xyz' },
      }, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope) {
                events.push(envelope);
                if (envelope.type === 'control.cannot_resume') {
                  req.destroy();
                  resolve();
                }
              }
            }
          }
        });
      });

      setTimeout(() => {
        req.destroy();
        resolve();
      }, 3000);
    });

    const cannotResume = events.find(e => e.type === 'control.cannot_resume');
    
    expect(cannotResume).toBeDefined();
    expect(cannotResume.payload.code).toBe('event_not_found');
    expect(cannotResume.payload.requestedId).toBe('non-existent-event-id-xyz');
    expect(cannotResume.payload.action).toBe('start_fresh');
  });

  it('should trigger onCannotResume callback (SSRK-142)', async () => {
    let cannotResumeInfo = null;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onCannotResume: (info) => {
        cannotResumeInfo = info;
      },
    });

    // Set a fake lastEventId that doesn't exist
    connector.lastEventId = 'fake-event-id-that-does-not-exist';
    
    // Disconnect and reconnect to trigger resume attempt
    connector.stop();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(cannotResumeInfo).not.toBeNull();
    expect(cannotResumeInfo.lastEventId).toBe('fake-event-id-that-does-not-exist');
    expect(cannotResumeInfo.reason).toBe('event_not_found');

    connector.stop();
  });

  it('should use START_FRESH fallback behavior (SSRK-143)', async () => {
    let cannotResumeTriggered = false;
    let lastEventIdAfterCannotResume = 'not-checked';

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      cannotResumeFallback: CannotResumeFallback.START_FRESH,
      onCannotResume: (info) => {
        cannotResumeTriggered = true;
        // START_FRESH clears lastEventId before this callback fires
        lastEventIdAfterCannotResume = connector.lastEventId;
      },
    });

    connector.lastEventId = 'old-expired-event-id';
    connector.stop();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(cannotResumeTriggered).toBe(true);
    // START_FRESH should clear the lastEventId
    expect(lastEventIdAfterCannotResume).toBeNull();

    connector.stop();
  });

  it('should use CLOSE fallback behavior (SSRK-143)', async () => {
    let cannotResumeTriggered = false;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      cannotResumeFallback: CannotResumeFallback.CLOSE,
      onCannotResume: () => {
        cannotResumeTriggered = true;
      },
    });

    connector.lastEventId = 'another-fake-id';
    connector.stop();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(cannotResumeTriggered).toBe(true);
    expect(connector.stopped).toBe(true);

    connector.stop();
  });

  it('should track cannotResumeCount in stats (SSRK-144)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    connector.lastEventId = 'stats-test-fake-id';
    connector.stop();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = connector.getStats();
    expect(stats.cannotResumeCount).toBe(1);

    connector.stop();
  });

  it('should track cannot-resume metrics on server /health (SSRK-144)', async () => {
    // First trigger a cannot-resume
    await new Promise((resolve) => {
      const req = http.get({
        hostname: 'localhost',
        port,
        path: '/stream',
        headers: { 'Last-Event-ID': 'metrics-test-fake-id' },
      }, (res) => {
        res.on('data', () => {});
      });

      setTimeout(() => {
        req.destroy();
        resolve();
      }, 1000);
    });

    // Check health endpoint
    const health = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    expect(health.metrics.cannotResumeCount).toBeGreaterThan(0);
    expect(health.metrics.cannotResumeReasons).toBeDefined();
    expect(health.metrics.cannotResumeReasons.event_not_found).toBeGreaterThan(0);
  });

  it('should include action suggestion in cannot_resume payload (SSRK-141)', async () => {
    let payload = null;

    await new Promise((resolve) => {
      const req = http.get({
        hostname: 'localhost',
        port,
        path: '/stream',
        headers: { 'Last-Event-ID': 'action-test-fake-id' },
      }, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope && envelope.type === 'control.cannot_resume') {
                payload = envelope.payload;
                req.destroy();
                resolve();
              }
            }
          }
        });
      });

      setTimeout(() => {
        req.destroy();
        resolve();
      }, 2000);
    });

    expect(payload).not.toBeNull();
    expect(payload.action).toBe('start_fresh');
    expect(payload.message).toBeDefined();
    expect(payload.oldestAvailable).toBeDefined();
    expect(payload.newestAvailable).toBeDefined();
  });

  it('should use startFresh() to manually clear and reconnect', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    // Wait for some events
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Set a fake ID
    connector.lastEventId = 'will-be-cleared';
    
    expect(connector.lastEventId).toBe('will-be-cleared');

    connector.stop();
    connector.startFresh();

    await new Promise(resolve => setTimeout(resolve, 1000));

    // lastEventId should be cleared and new events received
    expect(connector.lastEventId).not.toBe('will-be-cleared');

    connector.stop();
  });

  it('should define all CannotResumeReason constants (SSRK-140)', async () => {
    const { CannotResumeReason } = await import('../../shared/src/index.js');

    expect(CannotResumeReason.EVENT_NOT_FOUND).toBe('event_not_found');
    expect(CannotResumeReason.BUFFER_EXPIRED).toBe('buffer_expired');
    expect(CannotResumeReason.REPLAY_TOO_LARGE).toBe('replay_too_large');
    expect(CannotResumeReason.RESUME_DISABLED).toBe('resume_disabled');
    expect(CannotResumeReason.INVALID_EVENT_ID).toBe('invalid_event_id');
    expect(CannotResumeReason.STREAM_NOT_FOUND).toBe('stream_not_found');
    expect(CannotResumeReason.NO_BUFFER).toBe('no_buffer');
  });
});
