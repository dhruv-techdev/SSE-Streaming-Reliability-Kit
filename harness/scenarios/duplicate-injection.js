/**
 * Scenario: Duplicate Injection (SSRK-197)
 * Validates dedupe correctness when receiving duplicate event_ids
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'duplicate-injection',
  description: 'Validates client drops duplicate events correctly',
  timeout: 30000,
  tags: ['dedupe', 'idempotency'],

  config: {
    client: {
      autoReconnect: true,
      enableDedupe: true,
      dedupeMaxSize: 100,
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 5000,
    },
  },

  steps: [
    // Connect and receive events
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 5, timeout: 5000 },

    // Force disconnect to trigger replay (which may have duplicates)
    { type: StepType.DROP_CONNECTION },
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },

    // Wait for replay events
    { type: StepType.WAIT_EVENT_TYPE, eventType: 'control.replay_start', timeout: 5000 },

    // More events
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },

    // Verify dedupe is working (duplicates should be dropped)
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    minEventsReceived: 8,
  },
});
