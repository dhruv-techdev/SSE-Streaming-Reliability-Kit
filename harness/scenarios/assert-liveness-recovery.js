/**
 * Scenario: Assert Liveness Recovery (SSRK-205)
 * Validates heartbeat-miss triggers recovery
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'assert-liveness-recovery',
  description: 'Validates liveness failure detected and reconnect attempted',
  timeout: 30000,
  tags: ['liveness', 'heartbeat', 'recovery'],

  config: {
    client: {
      autoReconnect: true,
      enableLivenessCheck: true,
      livenessTimeoutMs: 2000,
      livenessGracePeriodMs: 500,
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 5,
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 1000,
    },
  },

  steps: [
    // Connect and verify working
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 2, timeout: 5000 },

    // Wait for at least one heartbeat so liveness monitor is primed
    { type: StepType.WAIT, ms: 1500 },

    // Stop heartbeats via server API (server stays running)
    { type: StepType.STOP_HEARTBEATS },

    // Wait for liveness failure
    { type: StepType.WAIT_LIVENESS_FAILURE, timeout: 10000 },

    // Resume heartbeats so reconnected client gets heartbeats
    { type: StepType.RESUME_HEARTBEATS },

    // Wait for recovery (liveness failure auto-triggers reconnect)
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },

    // Assert liveness failure and reconnect occurred (SSRK-205)
    { type: StepType.ASSERT_LIVENESS_FAILURE, reconnectAttempted: true },

    // Verify recovery via replay handshake on reconnect
    { type: StepType.WAIT_EVENT_TYPE, eventType: 'control.replay_start', timeout: 5000 },
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    minLivenessFailures: 1,
    minReconnectCount: 1,
  },
});
