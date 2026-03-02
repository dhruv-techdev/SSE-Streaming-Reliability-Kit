/**
 * Scenario: Cannot Resume (SSRK-198)
 * Validates explicit cannot-resume behavior and fallback
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'cannot-resume',
  description: 'Validates cannot-resume handling when buffer is expired',
  timeout: 45000,
  tags: ['resume', 'cannot-resume', 'fallback'],
  
  config: {
    client: {
      autoReconnect: true,
      cannotResumeFallback: 'start_fresh',
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 5,
      },
    },
    server: {
      tickInterval: 100,
      heartbeatInterval: 5000,
      // Small buffer to force expiration
      maxBufferSize: 10,
    },
  },

  steps: [
    // Connect and receive many events to fill buffer
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 5, timeout: 5000 },
    
    // Disconnect
    { type: StepType.DISCONNECT },
    { type: StepType.WAIT, ms: 500 },
    
    // Let server generate more events (overwriting buffer)
    { type: StepType.WAIT, ms: 3000 },
    
    // Reconnect with old Last-Event-ID (should trigger cannot-resume)
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    
    // Wait for cannot-resume or events
    { type: StepType.WAIT, ms: 2000 },
    
    // Should receive fresh events anyway (fallback: start_fresh)
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },
    
    // Verify final state
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    minEventsReceived: 8,
  },
});
