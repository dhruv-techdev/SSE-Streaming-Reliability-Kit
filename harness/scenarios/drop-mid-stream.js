/**
 * Scenario: Drop Mid-Stream (SSRK-193)
 * Validates reconnect + resume path in a common failure case
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'drop-mid-stream',
  description: 'Validates client reconnects and resumes after network drop',
  timeout: 30000,
  tags: ['reconnect', 'resume', 'network'],
  
  config: {
    client: {
      autoReconnect: true,
      retryPolicy: {
        baseDelayMs: 500,
        maxDelayMs: 2000,
        maxAttempts: 5,
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 5000,
    },
  },

  steps: [
    // Connect and wait for initial events
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },
    
    // Force disconnect by restarting server
    { type: StepType.DROP_CONNECTION },
    
    // Wait for client to reconnect
    { type: StepType.WAIT_RECONNECT, timeout: 10000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    
    // Should receive more events after reconnect
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },
    
    // Verify state
    { type: StepType.ASSERT_STATE, state: 'open' },
    { 
      type: StepType.ASSERT_STATS, 
      stats: { 
        reconnectCount: { min: 1 },
        eventsReceived: { min: 6 },
      } 
    },
  ],

  expected: {
    finalState: 'open',
    minEventsReceived: 6,
    minReconnectCount: 1,
  },
});
