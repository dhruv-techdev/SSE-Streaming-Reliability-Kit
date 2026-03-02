/**
 * Scenario: Server Restart (SSRK-195)
 * Validates recovery across backend restarts
 */
import { defineScenario, StepType } from '../src/scenario.js';

export default defineScenario({
  name: 'server-restart',
  description: 'Validates client recovers when server restarts',
  timeout: 45000,
  tags: ['reconnect', 'restart', 'recovery'],
  
  config: {
    client: {
      autoReconnect: true,
      retryPolicy: {
        baseDelayMs: 500,
        maxDelayMs: 3000,
        maxAttempts: 10,
      },
    },
    server: {
      tickInterval: 200,
      heartbeatInterval: 5000,
    },
  },

  steps: [
    // Connect and get some events
    { type: StepType.CONNECT },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },
    
    // Full server restart
    { type: StepType.RESTART_SERVER },
    
    // Wait for reconnection
    { type: StepType.WAIT_RECONNECT, timeout: 15000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    
    // Verify events continue flowing
    { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },
    
    // Second restart to verify repeated recovery
    { type: StepType.RESTART_SERVER },
    { type: StepType.WAIT_RECONNECT, timeout: 15000 },
    { type: StepType.WAIT_CONNECTED, timeout: 5000 },
    { type: StepType.WAIT_EVENTS, count: 2, timeout: 5000 },
    
    // Final state check
    { type: StepType.ASSERT_STATE, state: 'open' },
    {
      type: StepType.ASSERT_STATS,
      stats: {
        reconnectCount: { min: 2 },
      },
    },
  ],

  expected: {
    finalState: 'open',
    minReconnectCount: 2,
    minEventsReceived: 8,
  },
});
