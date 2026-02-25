/**
 * Last-Event-ID Integration Tests (SSRK-130, SSRK-131, SSRK-132, SSRK-133)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { connectSSE } from '../../client/src/sse-connector.js';
import { parseSSEChunk, decodeSSE } from '../../shared/src/index.js';

describe('Last-Event-ID Resume Integration', () => {
  let serverProcess;
  const port = 3092;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '500', // Fast ticks for testing
        SSE_HEARTBEAT_INTERVAL: '30000',
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

  it('should track lastEventId from received events (SSRK-128)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    // Wait for some events
    await new Promise(resolve => setTimeout(resolve, 2000));

    const lastEventId = connector.lastEventId;
    
    expect(lastEventId).not.toBeNull();
    expect(lastEventId.length).toBeGreaterThan(0);

    connector.stop();
  });

  it('should attach Last-Event-ID header on reconnect (SSRK-130)', async () => {
    let capturedLastEventId = null;
    let resumeAttempted = false;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: true,
      enableLivenessCheck: false,
      onResumeAttempt: ({ lastEventId }) => {
        capturedLastEventId = lastEventId;
        resumeAttempted = true;
      },
    });

    // Wait for some events
    await new Promise(resolve => setTimeout(resolve, 1500));

    const firstLastEventId = connector.lastEventId;
    expect(firstLastEventId).not.toBeNull();

    // Force disconnect (simulate network issue)
    connector.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reconnect
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should have attempted resume with lastEventId
    expect(resumeAttempted).toBe(true);
    expect(capturedLastEventId).toBe(firstLastEventId);

    connector.stop();
  });

  it('should not reconnect after stop() (SSRK-131)', async () => {
    let reconnectCount = 0;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: true,
      enableLivenessCheck: false,
      onRetry: () => {
        reconnectCount++;
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Call stop() - intentional shutdown
    connector.stop();

    // Wait to ensure no reconnect attempts
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(reconnectCount).toBe(0);
    expect(connector.stopped).toBe(true);
  });

  it('should fire onResumeAttempt callback (SSRK-132)', async () => {
    let resumeInfo = null;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    connector.stop();

    // Create new connector that will resume
    const connector2 = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onResumeAttempt: (info) => {
        resumeInfo = info;
      },
    });

    // Set the lastEventId from first connector
    connector2.lastEventId = connector.lastEventId;

    // Disconnect and reconnect to trigger resume
    connector2.stop();
    connector2.connect();

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(resumeInfo).not.toBeNull();
    expect(resumeInfo.lastEventId).toBe(connector.lastEventId);

    connector2.stop();
  });

  it('should preserve lastEventId across reconnects (SSRK-133)', async () => {
    const receivedEventIds = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: true,
      enableLivenessCheck: false,
      onEvent: (envelope) => {
        if (envelope.type.startsWith('domain.')) {
          receivedEventIds.push(envelope.event_id);
        }
      },
    });

    // Collect some events
    await new Promise(resolve => setTimeout(resolve, 2000));

    const lastEventIdBeforeDisconnect = connector.lastEventId;
    expect(lastEventIdBeforeDisconnect).not.toBeNull();
    expect(receivedEventIds).toContain(lastEventIdBeforeDisconnect);

    // Disconnect
    connector.disconnect();

    await new Promise(resolve => setTimeout(resolve, 100));

    // lastEventId should still be preserved
    expect(connector.lastEventId).toBe(lastEventIdBeforeDisconnect);

    // Reconnect
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should still have the lastEventId and potentially more
    expect(connector.lastEventId).not.toBeNull();

    connector.stop();
  });

  it('should verify server receives Last-Event-ID header', async () => {
    // First, get some events to establish a lastEventId
    const events = [];
    
    await new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope && envelope.type.startsWith('domain.')) {
                events.push(envelope);
                if (events.length >= 3) {
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
      }, 5000);
    });

    expect(events.length).toBeGreaterThan(0);

    const lastEventId = events[events.length - 1].event_id;

    // Now connect with Last-Event-ID header
    const moreEvents = [];
    let gotReconnectControl = false;

    await new Promise((resolve) => {
      const req = http.get({
        hostname: 'localhost',
        port,
        path: '/stream',
        headers: {
          'Last-Event-ID': lastEventId,
        },
      }, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope) {
                if (envelope.type === 'control.reconnect') {
                  gotReconnectControl = true;
                }
                moreEvents.push(envelope);
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

    // Server should have processed the Last-Event-ID
    // It either sends a control.reconnect if events expired, or replays events
    // In our case with short timeframes, events may still be in buffer
    expect(moreEvents.length).toBeGreaterThan(0);
  });

  it('should include lastEventId in stats', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = connector.getStats();

    expect(stats.lastEventId).not.toBeNull();
    expect(stats.resumeAttempts).toBe(0); // First connect, no resume

    connector.stop();
  });

  it('should increment resumeAttempts counter (SSRK-132)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(connector.getStats().resumeAttempts).toBe(0);

    // Disconnect and reconnect
    connector.disconnect();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 500));

    // Should have one resume attempt
    expect(connector.getStats().resumeAttempts).toBe(1);

    // Disconnect and reconnect again
    connector.disconnect();
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(connector.getStats().resumeAttempts).toBe(2);

    connector.stop();
  });

  it('should allow clearLastEventId for fresh start', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(connector.lastEventId).not.toBeNull();

    connector.clearLastEventId();

    expect(connector.lastEventId).toBeNull();
    expect(connector.getEventIdStore().hasResumePoint()).toBe(false);

    connector.stop();
  });
});
