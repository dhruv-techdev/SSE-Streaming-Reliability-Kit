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
    
    // Stop heartbeats (server restarts with very long heartbeat interval)
    { type: StepType.STOP_HEARTBEATS },
    
    // Wait for liveness failure
    { type: StepType.WAIT_LIVENESS_FAILURE, timeout: 10000 },
    
    // Assert liveness failure occurred (SSRK-205)
    { type: StepType.ASSERT_LIVENESS_FAILURE, reconnectAttempted: true },
    
    // Resume heartbeats
    { type: StepType.RESUME_HEARTBEATS },
    
    // Wait for recovery
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    
    // Verify recovery
    { type: StepType.WAIT_EVENTS, count: 2, timeout: 5000 },
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    minLivenessFailures: 1,
    minReconnectCount: 1,
  },
});
