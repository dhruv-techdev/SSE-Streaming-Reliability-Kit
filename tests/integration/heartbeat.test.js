/**
 * Heartbeat Integration Tests (SSRK-119)
 * Tests that heartbeat is emitted on open stream
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { parseSSEChunk, decodeSSE } from '../../shared/src/index.js';

describe('Server Heartbeat Integration', () => {
  let serverProcess;
  const port = 3094;

  beforeAll(async () => {
    // Start server with short heartbeat interval for testing
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_HEARTBEAT_INTERVAL: '2000', // 2 second heartbeat for faster testing
        SSE_TICK_INTERVAL: '5000', // Slow ticks so heartbeats are visible
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

  it('should receive at least 1 heartbeat within expected time (SSRK-119)', async () => {
    const events = [];
    let heartbeatReceived = false;

    await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope) {
                events.push(envelope);
                
                if (envelope.type === 'system.heartbeat') {
                  heartbeatReceived = true;
                  req.destroy();
                  resolve();
                }
              }
            }
          }
        });
      });

      req.on('error', reject);

      // Timeout after 5 seconds (should receive heartbeat within 2s + buffer)
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 5000);
    });

    expect(heartbeatReceived).toBe(true);
    
    // Find the heartbeat event
    const heartbeat = events.find(e => e.type === 'system.heartbeat');
    expect(heartbeat).toBeDefined();
    expect(heartbeat.payload).toHaveProperty('server_time');
    expect(heartbeat.payload).toHaveProperty('interval_ms');
  });

  it('should include correct heartbeat payload (SSRK-113)', async () => {
    let heartbeat = null;

    await new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope && envelope.type === 'system.heartbeat') {
                heartbeat = envelope;
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
      }, 5000);
    });

    expect(heartbeat).not.toBeNull();
    expect(heartbeat.event_id).toBeDefined();
    expect(heartbeat.type).toBe('system.heartbeat');
    expect(heartbeat.ts).toBeDefined();
    expect(heartbeat.payload.server_time).toBeDefined();
    expect(heartbeat.payload.interval_ms).toBe(2000);
    expect(heartbeat.payload.connection_id).toBeDefined();
  });

  it('should include correct SSE headers (SSRK-117)', async () => {
    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        resolve(res);
        req.destroy();
      });
      req.on('error', reject);
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
    expect(response.headers['x-accel-buffering']).toBe('no');
  });

  it('should report heartbeat metrics in /health (SSRK-118)', async () => {
    // First, make a connection to generate heartbeats
    const streamReq = http.get(`http://localhost:${port}/stream`);
    
    // Wait for at least one heartbeat
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    streamReq.destroy();

    // Check health endpoint
    const health = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    expect(health.metrics).toBeDefined();
    expect(health.metrics.heartbeatsSent).toBeGreaterThan(0);
  });

  it('should report heartbeat config in /info', async () => {
    const info = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/info`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    expect(info.config.heartbeatInterval).toBe(2000);
  });

  it('should send heartbeats consistently over time', { timeout: 7000 }, async () => {
    const heartbeats = [];

    await new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const blocks = raw.split('\n\n').filter(Boolean);
          
          for (const block of blocks) {
            const parsed = parseSSEChunk(block + '\n\n');
            if (parsed.data) {
              const { envelope } = decodeSSE(parsed.data);
              if (envelope && envelope.type === 'system.heartbeat') {
                heartbeats.push({
                  timestamp: Date.now(),
                  envelope,
                });
              }
            }
          }
        });
      });

      // Collect heartbeats for 5 seconds (should get at least 2)
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 5000);
    });

    // Should have received at least 2 heartbeats in 5 seconds with 2s interval
    expect(heartbeats.length).toBeGreaterThanOrEqual(2);

    // Verify consistent timing (within reasonable tolerance)
    if (heartbeats.length >= 2) {
      const gap = heartbeats[1].timestamp - heartbeats[0].timestamp;
      // Should be approximately 2000ms (allow 500ms tolerance)
      expect(gap).toBeGreaterThan(1500);
      expect(gap).toBeLessThan(2500);
    }
  });
});
