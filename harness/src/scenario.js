/**
 * Scenario Definition Format (SSRK-192)
 * Standardized format for fault injection scenarios
 */

/**
 * Scenario Step Types
 */
export const StepType = {
  // Connection lifecycle
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  WAIT_CONNECTED: 'wait_connected',
  
  // Event handling
  WAIT_EVENTS: 'wait_events',
  WAIT_EVENT_TYPE: 'wait_event_type',
  
  // Fault injection
  DROP_CONNECTION: 'drop_connection',
  PAUSE_EVENTS: 'pause_events',
  RESUME_EVENTS: 'resume_events',
  INJECT_DUPLICATE: 'inject_duplicate',
  DELAY_EVENTS: 'delay_events',
  
  // Server control
  RESTART_SERVER: 'restart_server',
  STOP_HEARTBEATS: 'stop_heartbeats',
  RESUME_HEARTBEATS: 'resume_heartbeats',
  
  // Timing
  WAIT: 'wait',
  WAIT_RECONNECT: 'wait_reconnect',
  WAIT_LIVENESS_FAILURE: 'wait_liveness_failure',
  
  // Assertions
  ASSERT_STATE: 'assert_state',
  ASSERT_STATS: 'assert_stats',
  ASSERT_EVENTS_RECEIVED: 'assert_events_received',
  ASSERT_DUPLICATES_DROPPED: 'assert_duplicates_dropped',
  ASSERT_CANNOT_RESUME: 'assert_cannot_resume',
};

/**
 * Scenario Definition Schema
 * 
 * {
 *   name: string,           // Unique scenario name
 *   description: string,    // Human-readable description
 *   timeout: number,        // Max execution time (ms)
 *   tags: string[],         // Tags for filtering
 *   config: {               // Client/server configuration overrides
 *     client: { ... },
 *     server: { ... },
 *   },
 *   steps: [                // Ordered steps to execute
 *     { type: StepType, ...params },
 *   ],
 *   expected: {             // Expected outcomes
 *     finalState: string,
 *     minEventsReceived: number,
 *     reconnectCount: number,
 *     ...
 *   },
 * }
 */

/**
 * Validate scenario definition
 */
export function validateScenario(scenario) {
  const errors = [];

  if (!scenario.name || typeof scenario.name !== 'string') {
    errors.push('Scenario must have a name');
  }

  if (!scenario.steps || !Array.isArray(scenario.steps)) {
    errors.push('Scenario must have steps array');
  } else {
    scenario.steps.forEach((step, i) => {
      if (!step.type) {
        errors.push(`Step ${i} must have a type`);
      }
    });
  }

  if (scenario.timeout && typeof scenario.timeout !== 'number') {
    errors.push('Timeout must be a number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a scenario definition
 */
export function defineScenario(definition) {
  const validation = validateScenario(definition);
  
  if (!validation.valid) {
    throw new Error(`Invalid scenario: ${validation.errors.join(', ')}`);
  }

  return {
    name: definition.name,
    description: definition.description || '',
    timeout: definition.timeout || 30000,
    tags: definition.tags || [],
    config: {
      client: definition.config?.client || {},
      server: definition.config?.server || {},
    },
    steps: definition.steps,
    expected: definition.expected || {},
  };
}

export default { StepType, validateScenario, defineScenario };
