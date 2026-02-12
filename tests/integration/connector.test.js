/**
 * SSE Connector Integration Tests (Updated for US-08)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE, ConnectionState } from '../../client/src/sse-connector.js';

describe('SSE Connector Integration', () => {
  let serverProcess;
  const port = 3097;

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

  it('should transition to OPEN state on successful connect', async () => {
    const states = [];
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      onStateChange: ({ current }) => states.push(current),
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(connector.getState()).toBe(ConnectionState.OPEN);
    expect(states).toContain(ConnectionState.CONNECTING);
    expect(states).toContain(ConnectionState.OPEN);

    connector.stop();
  });

  it('should transition to CLOSED on stop()', async () => {
    const states = [];
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      onStateChange: ({ current }) => states.push(current),
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    
    connector.stop();

    expect(connector.getState()).toBe(ConnectionState.CLOSED);
    expect(states).toContain(ConnectionState.CLOSED);
  });

  it('should fire onStateChange callback on transitions', async () => {
    const transitions = [];
    
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      onStateChange: (event) => {
        transitions.push({
          from: event.previous,
          to: event.current,
          reason: event.reason,
        });
      },
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    connector.stop();

    // Should have: IDLE→CONNECTING, CONNECTING→OPEN, OPEN→CLOSED (forced)
    expect(transitions.length).toBeGreaterThanOrEqual(2);
    expect(transitions[0].from).toBe(ConnectionState.IDLE);
    expect(transitions[0].to).toBe(ConnectionState.CONNECTING);
  });

  it('should track state statistics', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const stats = connector.getStats();
    
    expect(stats.stateMachine).toBeDefined();
    expect(stats.stateMachine.transitionCount).toBeGreaterThanOrEqual(2);
    expect(stats.stateMachine.timeInState).toBeDefined();

    connector.stop();
  });

  it('should prevent state changes after stop()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    
    connector.stop();
    
    expect(connector.stopped).toBe(true);
    expect(connector.getState()).toBe(ConnectionState.CLOSED);

    // Trying to connect again should work (reset)
    connector.connect();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    expect(connector.getState()).toBe(ConnectionState.OPEN);
    
    connector.stop();
  });

  it('should receive events with state tracking', async () => {
    const events = [];
    const { promise, resolve } = Promise.withResolvers();

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      onEvent: (envelope) => {
        events.push({
          type: envelope.type,
          state: connector.getState(),
        });
        if (events.length >= 2) resolve();
      },
      autoReconnect: false,
    });

    await promise;

    // All events should be received in OPEN state
    const openStateEvents = events.filter(e => e.state === ConnectionState.OPEN);
    expect(openStateEvents.length).toBe(events.length);

    connector.stop();
  });

  it('should provide state history via getStateMachine()', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    
    const sm = connector.getStateMachine();
    const history = sm.getHistory();

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].from).toBe(ConnectionState.IDLE);
    
    connector.stop();
  });
});
