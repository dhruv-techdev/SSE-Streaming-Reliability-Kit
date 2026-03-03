/**
 * Scenario: Assert Resume Behavior (SSRK-203)
 * Validates Last-Event-ID + replay - resume success and events continued
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'assert-resume-behavior',
  description: 'Validates resume success and events continued from expected point',
  timeout: 30000,
  tags: ['resume', 'replay', 'last-event-id'],

  config: {
    client: {
      autoReconnect: true,
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 5,
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 5000,
      maxBufferSize: 100, // Large buffer to ensure replay works
    },
  },

  steps: [
    // Connect and receive some events
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 5, timeout: 5000 },

    // Force disconnect
    { type: StepType.DROP_CONNECTION },

    // Wait for reconnect
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },

    // Wait for replay to complete
    { type: StepType.WAIT_EVENT_TYPE, eventType: 'control.replay_start', timeout: 5000 },

    // Assert resume succeeded (SSRK-203)
    { type: StepType.ASSERT_RESUME_SUCCESS },

    // Wait for more events
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },

    // Verify state
    { type: StepType.ASSERT_STATE, state: 'open' },
  ],

  expected: {
    finalState: 'open',
    resumeSucceeded: true,
    minEventsReceived: 8,
    minReconnectCount: 1,
  },
});
