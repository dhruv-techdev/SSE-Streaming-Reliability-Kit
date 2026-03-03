/**
 * Scenario: Delayed/Bursty Events (SSRK-196)
 * Validates client stability under jitter and lag
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'delayed-bursty-events',
  description: 'Validates client handles delayed and bursty events without crashing',
  timeout: 30000,
  tags: ['stability', 'lag', 'burst'],

  config: {
    client: {
      autoReconnect: true,
      enableLivenessCheck: true,
      livenessTimeoutMs: 5000,
      livenessGracePeriodMs: 1000,
    },
    server: {
      // Fast tick to generate bursty events
      tickInterval: 50,
      heartbeatInterval: 2000,
    },
  },

  steps: [
    // Connect
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },

    // Let a burst of events come through
    { type: StepType.WAIT, ms: 500 },
    { type: StepType.WAIT_EVENTS, count: 5, timeout: 3000 },

    // Pause events briefly (simulating network jitter)
    { type: StepType.PAUSE_EVENTS },
    { type: StepType.WAIT, ms: 1000 },
    { type: StepType.RESUME_EVENTS },

    // More events should flow after resume (no reconnect needed - heartbeats kept connection alive)
    { type: StepType.WAIT_EVENTS, count: 5, timeout: 5000 },

    // Verify stability
    { type: StepType.ASSERT_STATE, state: 'open' },
    {
      type: StepType.ASSERT_STATS,
      stats: {
        eventsReceived: { min: 10 },
      },
    },
  ],

  expected: {
    finalState: 'open',
    minEventsReceived: 10,
  },
});
