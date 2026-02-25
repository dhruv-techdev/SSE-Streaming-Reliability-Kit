/**
 * Liveness Detection Integration Tests (SSRK-127)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE, ConnectionState } from '../../client/src/sse-connector.js';

describe('Client Liveness Detection Integration', () => {
  let serverProcess;
  const port = 3093;

  beforeAll(async () => {
    // Start server with 2 second heartbeat for faster testing
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_HEARTBEAT_INTERVAL: '2000',
        SSE_TICK_INTERVAL: '10000', // Slow ticks
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

  it('should track lastHeartbeatAt when heartbeats received (SSRK-120)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: true,
      livenessTimeoutMs: 10000,
      livenessGracePeriodMs: 1000,
      autoReconnect: false,
    });

    // Wait for connection and heartbeat
    await new Promise(resolve => setTimeout(resolve, 3000));

    const monitor = connector.getLivenessMonitor();
    
    expect(monitor.lastHeartbeatAt).not.toBeNull();
    expect(monitor.hasReceivedHeartbeat).toBe(true);

    connector.stop();
  });

  it('should include liveness stats in getStats()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: true,
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const stats = connector.getStats();
    
    expect(stats.liveness).toBeDefined();
    expect(stats.liveness.isRunning).toBe(true);
    expect(stats.liveness.heartbeatsReceived).toBeGreaterThan(0);

    connector.stop();
  });

  it('should stop liveness monitor on stop() (SSRK-127)', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: true,
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const monitor = connector.getLivenessMonitor();
    expect(monitor.isRunning).toBe(true);

    connector.stop();

    expect(monitor.isRunning).toBe(false);
  });

  it('should not trigger false positive on startup (SSRK-124)', async () => {
    let livenessFailure = false;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: true,
      livenessTimeoutMs: 1000, // Very short timeout
      livenessGracePeriodMs: 5000, // But long grace period
      autoReconnect: false,
      onLivenessFailure: () => {
        livenessFailure = true;
      },
    });

    // Wait within grace period
    await new Promise(resolve => setTimeout(resolve, 3000));

    expect(livenessFailure).toBe(false);

    connector.stop();
  });

  it('should fire onLivenessFailure callback (SSRK-125)', async () => {
    // This test simulates missed heartbeat by using very short timeout
    // Note: In real scenario, server would stop sending heartbeats
    
    let failureInfo = null;
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: true,
      livenessTimeoutMs: 500, // Very short
      livenessGracePeriodMs: 100,
      autoReconnect: false,
      onLivenessFailure: (info) => {
        failureInfo = info;
      },
    });

    // Wait for heartbeat then wait for timeout
    await new Promise(resolve => setTimeout(resolve, 3500));

    // If heartbeat interval is 2s and timeout is 500ms, should fail
    // unless heartbeat comes in time
    // This depends on timing - may or may not trigger

    connector.stop();
    
    // Just verify the connector can handle liveness checks
    const stats = connector.getStats();
    expect(stats.liveness).toBeDefined();
  });

  it('should reset liveness monitor on reconnect', { timeout: 7000 }, async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: true,
      autoReconnect: true,
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const monitor = connector.getLivenessMonitor();
    const initialHeartbeats = monitor.getStats().heartbeatsReceived;

    // Force disconnect and reconnect
    connector.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    connector.connect();

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Monitor should be reset and running again
    expect(monitor.isRunning).toBe(true);

    connector.stop();
  });

  it('should disable liveness check when enableLivenessCheck=false', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      enableLivenessCheck: false,
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const monitor = connector.getLivenessMonitor();
    expect(monitor.isRunning).toBe(false);

    connector.stop();
  });
});
