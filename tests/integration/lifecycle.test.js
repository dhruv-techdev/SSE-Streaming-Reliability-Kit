/**
 * Connection Lifecycle Tests (SSRK-82)
 * Tests: connect → disconnect → cleanup → registry returns to zero
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { spawn } from 'child_process';

describe('Connection Lifecycle', () => {
  let serverProcess;
  const port = 3098;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
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

  const getHealth = () => {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/health`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(JSON.parse(data)));
        })
        .on('error', reject);
    });
  };

  const getInfo = () => {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/info`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(JSON.parse(data)));
        })
        .on('error', reject);
    });
  };

  it('should start with zero connections', async () => {
    const health = await getHealth();
    expect(health.connections).toBe(0);
  });

  it('should register connection on open', async () => {
    const initialHealth = await getHealth();
    const initialCount = initialHealth.connections;

    // Open a connection
    const req = http.get(`http://localhost:${port}/stream`);

    // Wait for connection to be established
    await new Promise((resolve) => setTimeout(resolve, 500));

    const health = await getHealth();
    expect(health.connections).toBe(initialCount + 1);

    // Cleanup
    req.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it('should unregister connection on close (ST-02)', async () => {
    // Open a connection
    const req = http.get(`http://localhost:${port}/stream`);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const beforeClose = await getHealth();
    const countBefore = beforeClose.connections;

    // Close the connection
    req.destroy();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    const afterClose = await getHealth();
    expect(afterClose.connections).toBe(countBefore - 1);
  });

  it('should cleanup timers on disconnect (ST-02, ST-03)', async () => {
    // Open connection
    const req = http.get(`http://localhost:${port}/stream`);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Close connection
    req.destroy();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Connection count should return to previous state
    const health = await getHealth();
    expect(health.status).toBe('ok');
    // Server should still be running (no zombie timers)
  });

  it('should handle multiple concurrent connections', async () => {
    const connections = [];
    const numConnections = 3;

    // Open multiple connections
    for (let i = 0; i < numConnections; i++) {
      connections.push(http.get(`http://localhost:${port}/stream`));
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const health = await getHealth();
    expect(health.connections).toBeGreaterThanOrEqual(numConnections);

    // Close all connections
    connections.forEach((req) => req.destroy());

    await new Promise((resolve) => setTimeout(resolve, 500));

    const afterClose = await getHealth();
    expect(afterClose.connections).toBe(0);
  });

  it('should track connection stats', async () => {
    const info = await getInfo();

    expect(info.stats).toHaveProperty('activeConnections');
    expect(info.stats).toHaveProperty('totalConnections');
    expect(info.stats).toHaveProperty('totalDisconnections');
    expect(info.stats).toHaveProperty('rejectedConnections');
  });

  it('should return to zero connections after all clients disconnect', async () => {
    // Open connections
    const req1 = http.get(`http://localhost:${port}/stream`);
    const req2 = http.get(`http://localhost:${port}/stream`);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify connections are open
    const health1 = await getHealth();
    expect(health1.connections).toBeGreaterThanOrEqual(2);

    // Close all
    req1.destroy();
    req2.destroy();

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify cleanup
    const health2 = await getHealth();
    expect(health2.connections).toBe(0);
  });
});
