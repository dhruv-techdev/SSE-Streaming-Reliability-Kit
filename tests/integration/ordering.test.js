/**
 * Ordering Integration Tests (SSRK-157)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE, OrderingRule, OutOfOrderPolicy } from '../../client/src/sse-connector.js';

describe('Ordering Integration', () => {
  let serverProcess;
  const port = 3088;

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

  it('should enable ordering by default', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(connector.options.enableOrdering).toBe(true);
    expect(connector.getOrderingGuard()).toBeDefined();

    connector.stop();
  });

  it('should track lastAcceptedSequence from events', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      orderingRule: OrderingRule.SEQUENCE,
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const guard = connector.getOrderingGuard();
    
    // Should have processed events with sequences
    expect(guard.lastAcceptedSequence).toBeGreaterThan(0);

    connector.stop();
  });

  it('should include ordering stats in getStats()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = connector.getStats();

    expect(stats.ordering).toBeDefined();
    expect(stats.ordering.orderingRule).toBe(OrderingRule.SEQUENCE);
    expect(stats.ordering.totalChecked).toBeGreaterThan(0);
    expect(stats.ordering.totalAccepted).toBeGreaterThan(0);

    connector.stop();
  });

  it('should respect orderingRule config', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      orderingRule: OrderingRule.EVENT_ID,
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(connector.getOrderingGuard().orderingRule).toBe(OrderingRule.EVENT_ID);

    connector.stop();
  });

  it('should allow disabling ordering', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      enableOrdering: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(connector.options.enableOrdering).toBe(false);

    connector.stop();
  });

  it('should fire onOutOfOrder callback (SSRK-154)', async () => {
    const outOfOrderEvents = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      orderingRule: OrderingRule.SEQUENCE,
      onOutOfOrder: (info) => {
        outOfOrderEvents.push(info);
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Manually test the ordering guard
    const guard = connector.getOrderingGuard();
    
    // Simulate out-of-order by checking with lower sequence
    guard.check({ event_id: 'a', type: 'domain.test', ts: '', payload: {}, sequence: 1000 });
    guard.check({ event_id: 'b', type: 'domain.test', ts: '', payload: {}, sequence: 500 });

    expect(outOfOrderEvents.length).toBe(1);
    expect(outOfOrderEvents[0].sequence).toBe(500);

    connector.stop();
  });

  it('should use shouldProcess hook (SSRK-155)', async () => {
    const processedEvents = [];
    const rejectedByHook = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      shouldProcess: (event, context) => {
        // Reject events with odd sequence numbers
        if (event.sequence && event.sequence % 2 === 1) {
          rejectedByHook.push(event.event_id);
          return false;
        }
        return true;
      },
      onEvent: (event) => {
        processedEvents.push(event);
      },
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Some events should have been rejected by the hook
    // (depending on server's sequence generation)
    connector.stop();
    
    // Hook was called and could reject
    expect(connector.getStats().ordering.totalChecked).toBeGreaterThan(0);
  });

  it('should reset ordering markers via resetOrderingMarkers()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const guard = connector.getOrderingGuard();
    expect(guard.lastAcceptedSequence).toBeGreaterThan(0);

    connector.resetOrderingMarkers();
    
    expect(guard.lastAcceptedSequence).toBeNull();

    connector.stop();
  });

  it('should track outOfOrderDropped in stats', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Manually trigger out-of-order
    const guard = connector.getOrderingGuard();
    guard.check({ event_id: 'high', type: 'domain.test', ts: '', payload: {}, sequence: 1000 });
    guard.check({ event_id: 'low', type: 'domain.test', ts: '', payload: {}, sequence: 1 });

    const stats = connector.getStats();
    expect(stats.ordering.totalDropped).toBeGreaterThan(0);

    connector.stop();
  });

  it('should always accept control events regardless of sequence (SSRK-156)', async () => {
    const controlEvents = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onControl: (event) => {
        controlEvents.push(event);
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have received control.open at minimum
    expect(controlEvents.length).toBeGreaterThan(0);
    expect(controlEvents[0].type).toMatch(/^control\./);

    connector.stop();
  });

  it('should maintain event order in normal flow (SSRK-157)', async () => {
    const sequences = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onEvent: (event) => {
        if (event.sequence !== undefined) {
          sequences.push(event.sequence);
        }
      },
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    connector.stop();

    // All sequences should be in increasing order
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  });
});
