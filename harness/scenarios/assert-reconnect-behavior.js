/**
 * Scenario: Assert Reconnect Behavior (SSRK-202)
 * Validates retry limits/circuit breaker - retries stop at maxAttempts
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'assert-reconnect-behavior',
  description: 'Validates retries stop at maxAttempts and no further retries after give-up',
  timeout: 45000,
  tags: ['reconnect', 'circuit-breaker', 'retry-limit'],

  config: {
    client: {
      autoReconnect: true,
      retryPolicy: {
        baseDelayMs: 200,
        maxDelayMs: 500,
        maxAttempts: 3, // Will give up after 3 attempts
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 10000,
    },
  },

  steps: [
    // Connect initially
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 2, timeout: 5000 },

    // Kill server without restart (simulate persistent outage)
    { type: StepType.STOP_SERVER },

    // Wait for client to exhaust retries and give up
    { type: StepType.WAIT_GIVE_UP, timeout: 30000 },

    // Assert client has given up (SSRK-202)
    { type: StepType.ASSERT_GIVEN_UP, noFurtherRetries: true },

    // Verify reconnect count is at max
    {
      type: StepType.ASSERT_RECONNECTS,
      max: 3, // Should not exceed maxAttempts
    },
  ],

  expected: {
    hasGivenUp: true,
    maxReconnectCount: 3,
  },
});
