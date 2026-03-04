/**
 * Scenario: Server Idle Timeout (SSRK-194)
 * Validates heartbeat/liveness detection when server stops sending heartbeats
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'server-idle-timeout',
  description: 'Validates client detects liveness failure when heartbeats stop',
  timeout: 30000,
  tags: ['liveness', 'heartbeat', 'timeout'],

  config: {
    client: {
      autoReconnect: true,
      enableLivenessCheck: true,
      livenessTimeoutMs: 2000,
      livenessGracePeriodMs: 500,
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 3,
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 1000,
    },
  },

  steps: [
    // Connect and verify liveness is working
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 2, timeout: 5000 },

    // Wait for at least one heartbeat so liveness monitor is primed
    { type: StepType.WAIT, ms: 1500 },

    // Stop heartbeats via server API (server stays running)
    { type: StepType.STOP_HEARTBEATS },

    // Wait for liveness failure to be detected
    { type: StepType.WAIT_LIVENESS_FAILURE, timeout: 10000 },

    // Client should reconnect
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },

    // Resume heartbeats and verify recovery
    { type: StepType.RESUME_HEARTBEATS },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENT_TYPE, eventType: 'control.replay_start', timeout: 5000 },

    // Verify final state
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    minLivenessFailures: 1,
    minReconnectCount: 1,
  },
});
