import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { spawn } from 'child_process';
import { parseSSEChunk, decodeSSE } from '../../shared/src/index.js';

describe('SSE Stream Integration', () => {
  let serverProcess;
  const port = 3099; // Use different port for tests

  beforeAll(async () => {
    // Start server
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    // Wait for server to start
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

  it('should return correct headers on /stream', async () => {
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
  });

  it('should stream events with valid envelope format', async () => {
    const events = await new Promise((resolve, reject) => {
      const collected = [];
      
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', (chunk) => {
          const raw = chunk.toString();
          const parsed = parseSSEChunk(raw);
          if (parsed.data) {
            const { envelope } = decodeSSE(parsed.data);
            if (envelope) collected.push(envelope);
          }
          
          if (collected.length >= 3) {
            req.destroy();
            resolve(collected);
          }
        });
      });
      
      req.on('error', reject);
      setTimeout(() => {
        req.destroy();
        resolve(collected);
      }, 10000);
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    
    // Verify first event is control.open
    expect(events[0].type).toBe('control.open');
    
    // Verify all events have required fields
    for (const event of events) {
      expect(event).toHaveProperty('event_id');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('ts');
      expect(event).toHaveProperty('payload');
    }
  });

  it('should return health status', async () => {
    const response = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    expect(response.status).toBe('ok');
    expect(response).toHaveProperty('timestamp');
    expect(response).toHaveProperty('connections');
  });
});
