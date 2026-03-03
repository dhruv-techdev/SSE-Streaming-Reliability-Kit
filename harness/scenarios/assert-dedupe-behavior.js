/**
 * Scenario: Assert Dedupe Behavior (SSRK-204)
 * Validates no double-processing - duplicates detected and dropped
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'assert-dedupe-behavior',
  description: 'Validates duplicates are detected/dropped and handler not called twice',
  timeout: 30000,
  tags: ['dedupe', 'idempotency', 'duplicate'],

  config: {
    client: {
      autoReconnect: true,
      enableDedupe: true,
      dedupeMaxSize: 1000,
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 5,
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 5000,
      maxBufferSize: 100,
    },
  },

  steps: [
    // Connect and receive events
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 5, timeout: 5000 },

    // Force disconnect to trigger replay (may include already-seen events)
    { type: StepType.DROP_CONNECTION },
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },

    // Wait for replay
    { type: StepType.WAIT_EVENT_TYPE, eventType: 'control.replay_start', timeout: 5000 },

    // Receive more events
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },

    // Assert no duplicate events were processed (SSRK-204)
    { type: StepType.ASSERT_NO_DUPLICATES },

    // Verify final state
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    minEventsReceived: 8,
  },
});
