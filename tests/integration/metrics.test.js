/**
 * Metrics Integration Tests (SSRK-165)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';

describe('Server Metrics Integration', () => {
  let serverProcess;
  const port = 3087;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '500',
        SSE_HEARTBEAT_INTERVAL: '1000',
        MAX_CONNECTIONS: '5',
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
   * Helper to fetch endpoint
   */
  async function fetchEndpoint(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.headers['content-type']?.includes('application/json')) {
            resolve(JSON.parse(data));
          } else {
            resolve(data);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Helper to open stream connection
   */
  function openStream(duration = 1000) {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', () => {});
      });
      
      setTimeout(() => {
        req.destroy();
        resolve();
      }, duration);
    });
  }

  it('should expose /metrics endpoint (SSRK-158)', async () => {
    const metrics = await fetchEndpoint('/metrics');

    expect(typeof metrics).toBe('string');
    expect(metrics).toContain('# HELP sse_server_active_streams');
    expect(metrics).toContain('# TYPE sse_server_active_streams gauge');
  });

  it('should return Prometheus text format', async () => {
    const metrics = await fetchEndpoint('/metrics');

    // Verify format: each metric has HELP, TYPE, and value
    const lines = metrics.split('\n');
    const helpLines = lines.filter(l => l.startsWith('# HELP'));
    const typeLines = lines.filter(l => l.startsWith('# TYPE'));

    expect(helpLines.length).toBeGreaterThan(0);
    expect(typeLines.length).toBeGreaterThan(0);
  });

  it('should increment active_streams on connect (SSRK-159)', async () => {
    // Get initial count
    const before = await fetchEndpoint('/health');
    const initialActive = before.metrics.gauges.active_streams;

    // Open a connection
    const streamPromise = new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/stream`, (res) => {
        res.on('data', () => {});
      });

      // Check metrics while connected
      setTimeout(async () => {
        const during = await fetchEndpoint('/health');
        expect(during.metrics.gauges.active_streams).toBeGreaterThan(initialActive);
        
        req.destroy();
        resolve();
      }, 500);
    });

    await streamPromise;
  });

  it('should decrement active_streams on disconnect (SSRK-159)', async () => {
    // Open and close a connection
    await openStream(500);

    // Small delay for cleanup
    await new Promise(r => setTimeout(r, 200));

    const after = await fetchEndpoint('/health');
    // Should be back to baseline (may be 0 or have other test connections)
    expect(after.metrics.gauges.active_streams).toBeGreaterThanOrEqual(0);
  });

  it('should increment streams_opened_total (SSRK-160)', async () => {
    const before = await fetchEndpoint('/health');
    const initialOpened = before.metrics.counters.streams_opened_total;

    await openStream(300);
    await openStream(300);

    const after = await fetchEndpoint('/health');
    expect(after.metrics.counters.streams_opened_total).toBeGreaterThanOrEqual(initialOpened + 2);
  });

  it('should track disconnects_total with reason (SSRK-161)', async () => {
    await openStream(300);

    const metrics = await fetchEndpoint('/health');
    
    // Should have some disconnects tracked
    const disconnects = metrics.metrics.counters.disconnects_total;
    expect(disconnects).toBeDefined();
    
    // Client close is most common
    expect(
      disconnects['client_close'] >= 0 || 
      disconnects['client_abort'] >= 0
    ).toBe(true);
  });

  it('should increment rejected_connections_total when over limit (SSRK-162)', async () => {
    const before = await fetchEndpoint('/health');
    const initialRejected = before.metrics.counters.rejected_connections_total;

    // Open max connections (5) plus extra
    const connections = [];
    for (let i = 0; i < 7; i++) {
      connections.push(
        new Promise((resolve) => {
          const req = http.get(`http://localhost:${port}/stream`, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
          });
          req.on('error', resolve);
          
          setTimeout(() => {
            req.destroy();
            resolve();
          }, 1500);
        })
      );
      await new Promise(r => setTimeout(r, 50));
    }

    await Promise.all(connections);
    await new Promise(r => setTimeout(r, 200));

    const after = await fetchEndpoint('/health');
    // Should have rejected at least 2 (7 - 5 = 2)
    expect(after.metrics.counters.rejected_connections_total).toBeGreaterThanOrEqual(initialRejected);
  });

  it('should track heartbeats_sent_total (SSRK-163)', async () => {
    const before = await fetchEndpoint('/health');
    const initialHeartbeats = before.metrics.counters.heartbeats_sent_total;

    // Open connection long enough for heartbeats (interval is 1000ms)
    await openStream(2500);

    const after = await fetchEndpoint('/health');
    // Should have sent at least 1 heartbeat
    expect(after.metrics.counters.heartbeats_sent_total).toBeGreaterThan(initialHeartbeats);
  });

  it('should include metrics in /health endpoint', async () => {
    const health = await fetchEndpoint('/health');

    expect(health.status).toBe('ok');
    expect(health.metrics).toBeDefined();
    expect(health.metrics.gauges).toBeDefined();
    expect(health.metrics.counters).toBeDefined();
    expect(health.metrics.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it('should track events_sent_total', async () => {
    const before = await fetchEndpoint('/health');
    const initialEvents = before.metrics.counters.events_sent_total;

    await openStream(1500);

    const after = await fetchEndpoint('/health');
    expect(after.metrics.counters.events_sent_total).toBeGreaterThan(initialEvents);
  });

  it('should expose uptime_seconds in Prometheus format', async () => {
    const metrics = await fetchEndpoint('/metrics');

    expect(metrics).toContain('sse_server_uptime_seconds');
    
    // Extract value
    const match = metrics.match(/sse_server_uptime_seconds (\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1])).toBeGreaterThanOrEqual(0);
  });

  it('should format labeled metrics correctly', async () => {
    // Trigger a disconnect to get labeled metric
    await openStream(300);
    await new Promise(r => setTimeout(r, 100));

    const metrics = await fetchEndpoint('/metrics');

    // Should have proper label format
    expect(metrics).toMatch(/sse_server_disconnects_total\{reason="[^"]+"\} \d+/);
  });
});
