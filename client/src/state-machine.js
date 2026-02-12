/**
 * Client State Machine (US-08)
 * Manages connection states and transitions with validation
 */

/**
 * Client Connection States (SSRK-90)
 * 
 * State Diagram:
 * 
 *     ┌─────────┐
 *     │  IDLE   │ ◄─────────────────────────────┐
 *     └────┬────┘                               │
 *          │ connect()                          │
 *          ▼                                    │
 *   ┌──────────────┐                            │
 *   │  CONNECTING  │                            │
 *   └──────┬───────┘                            │
 *          │                                    │
 *     ┌────┴────┐                               │
 *     │         │                               │
 *  success    error                             │
 *     │         │                               │
 *     ▼         ▼                               │
 * ┌──────┐  ┌───────┐    retry < max            │
 * │ OPEN │  │ ERROR │ ──────────────┐           │
 * └──┬───┘  └───┬───┘               │           │
 *    │          │                   ▼           │
 *    │     retry >= max      ┌──────────┐       │
 *    │          │            │ RETRYING │───────┤
 *    │          │            └──────────┘       │
 *    │          │              success          │
 *    │          ▼                               │
 *    │     ┌────────┐                           │
 *    └────►│ CLOSED │◄──────────────────────────┘
 *  stop()  └────────┘        stop() from any state
 */

export const ConnectionState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  ERROR: 'error',
  RETRYING: 'retrying',
  CLOSED: 'closed',
};

/**
 * Valid state transitions (SSRK-90)
 */
const VALID_TRANSITIONS = {
  [ConnectionState.IDLE]: [ConnectionState.CONNECTING, ConnectionState.CLOSED],
  [ConnectionState.CONNECTING]: [ConnectionState.OPEN, ConnectionState.ERROR, ConnectionState.CLOSED],
  [ConnectionState.OPEN]: [ConnectionState.ERROR, ConnectionState.CLOSED],
  [ConnectionState.ERROR]: [ConnectionState.RETRYING, ConnectionState.CLOSED],
  [ConnectionState.RETRYING]: [ConnectionState.CONNECTING, ConnectionState.CLOSED],
  [ConnectionState.CLOSED]: [ConnectionState.IDLE], // Can restart from closed
};

/**
 * Transition reasons
 */
export const TransitionReason = {
  // User actions
  USER_CONNECT: 'user_connect',
  USER_STOP: 'user_stop',
  USER_RESTART: 'user_restart',
  
  // Connection events
  CONNECTION_SUCCESS: 'connection_success',
  CONNECTION_ERROR: 'connection_error',
  CONNECTION_TIMEOUT: 'connection_timeout',
  
  // Server events
  SERVER_CLOSE: 'server_close',
  SERVER_ERROR: 'server_error',
  
  // Network events
  NETWORK_ERROR: 'network_error',
  
  // Internal
  RETRY_SCHEDULED: 'retry_scheduled',
  RETRY_EXHAUSTED: 'retry_exhausted',
  PARSE_ERROR: 'parse_error',
};

/**
 * State Machine Class (SSRK-91)
 */
export class StateMachine {
  /**
   * Create a new state machine
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    this._state = ConnectionState.IDLE;
    this._previousState = null;
    this._stateHistory = [];
    this._maxHistorySize = options.maxHistorySize || 50;
    
    // Callbacks (SSRK-92)
    this._onStateChange = options.onStateChange || null;
    this._debug = options.debug || false;
    
    // Stats
    this._stats = {
      transitionCount: 0,
      stateEnteredAt: Date.now(),
      timeInState: {},
    };
    
    this._recordStateTime(this._state);
  }

  /**
   * Get current state
   */
  get state() {
    return this._state;
  }

  /**
   * Get previous state
   */
  get previousState() {
    return this._previousState;
  }

  /**
   * Check if in a specific state
   */
  is(state) {
    return this._state === state;
  }

  /**
   * Check if transition to target state is valid
   */
  canTransitionTo(targetState) {
    const allowed = VALID_TRANSITIONS[this._state] || [];
    return allowed.includes(targetState);
  }

  /**
   * Transition to a new state (SSRK-91, SSRK-92)
   * @param {string} targetState - Target state
   * @param {string} reason - Reason for transition
   * @param {Object} metadata - Additional data
   * @returns {boolean} Whether transition succeeded
   */
  transition(targetState, reason, metadata = {}) {
    // Validate transition
    if (!this.canTransitionTo(targetState)) {
      if (this._debug) {
        console.log(`[STATE] Invalid transition: ${this._state} → ${targetState}`);
      }
      return false;
    }

    const previousState = this._state;
    const timestamp = Date.now();
    
    // Update state time tracking
    this._recordStateTime(previousState, timestamp);
    
    // Perform transition
    this._previousState = previousState;
    this._state = targetState;
    this._stats.transitionCount++;
    this._stats.stateEnteredAt = timestamp;

    // Record in history
    const historyEntry = {
      from: previousState,
      to: targetState,
      reason,
      metadata,
      timestamp,
    };
    this._stateHistory.push(historyEntry);
    
    // Trim history if needed
    if (this._stateHistory.length > this._maxHistorySize) {
      this._stateHistory.shift();
    }

    // Log if debug enabled (SSRK-95)
    if (this._debug) {
      console.log(`[STATE] ${previousState} → ${targetState} (${reason})`, metadata);
    }

    // Emit state change event (SSRK-92)
    if (this._onStateChange) {
      this._onStateChange({
        previous: previousState,
        current: targetState,
        reason,
        metadata,
        timestamp,
      });
    }

    return true;
  }

  /**
   * Record time spent in a state
   */
  _recordStateTime(state, endTime = null) {
    if (!this._stats.timeInState[state]) {
      this._stats.timeInState[state] = 0;
    }
    
    if (endTime && this._stats.stateEnteredAt) {
      this._stats.timeInState[state] += endTime - this._stats.stateEnteredAt;
    }
  }

  /**
   * Convenience methods for common transitions
   */
  
  connect() {
    return this.transition(ConnectionState.CONNECTING, TransitionReason.USER_CONNECT);
  }

  connected() {
    return this.transition(ConnectionState.OPEN, TransitionReason.CONNECTION_SUCCESS);
  }

  error(reason = TransitionReason.CONNECTION_ERROR, metadata = {}) {
    return this.transition(ConnectionState.ERROR, reason, metadata);
  }

  retry() {
    return this.transition(ConnectionState.RETRYING, TransitionReason.RETRY_SCHEDULED);
  }

  retrying() {
    return this.transition(ConnectionState.CONNECTING, TransitionReason.RETRY_SCHEDULED);
  }

  close(reason = TransitionReason.USER_STOP) {
    return this.transition(ConnectionState.CLOSED, reason);
  }

  reset() {
    if (this._state === ConnectionState.CLOSED) {
      return this.transition(ConnectionState.IDLE, TransitionReason.USER_RESTART);
    }
    return false;
  }

  /**
   * Force close from any state (SSRK-94)
   */
  forceClose(reason = TransitionReason.USER_STOP) {
    // Override normal transition rules for stop()
    const previousState = this._state;
    
    if (this._state === ConnectionState.CLOSED) {
      return true; // Already closed
    }

    this._previousState = previousState;
    this._state = ConnectionState.CLOSED;
    this._stats.transitionCount++;
    this._recordStateTime(previousState, Date.now());

    if (this._debug) {
      console.log(`[STATE] ${previousState} → closed (forced: ${reason})`);
    }

    if (this._onStateChange) {
      this._onStateChange({
        previous: previousState,
        current: ConnectionState.CLOSED,
        reason,
        metadata: { forced: true },
        timestamp: Date.now(),
      });
    }

    return true;
  }

  /**
   * Get state history
   */
  getHistory() {
    return [...this._stateHistory];
  }

  /**
   * Get statistics
   */
  getStats() {
    // Update current state time
    const now = Date.now();
    const currentStateTime = now - this._stats.stateEnteredAt;
    
    return {
      currentState: this._state,
      transitionCount: this._stats.transitionCount,
      currentStateDuration: currentStateTime,
      timeInState: {
        ...this._stats.timeInState,
        [this._state]: (this._stats.timeInState[this._state] || 0) + currentStateTime,
      },
    };
  }

  /**
   * Set debug mode (SSRK-95)
   */
  setDebug(enabled) {
    this._debug = enabled;
  }

  /**
   * Set state change callback
   */
  setOnStateChange(callback) {
    this._onStateChange = callback;
  }
}

/**
 * Create a new state machine
 */
export function createStateMachine(options) {
  return new StateMachine(options);
}

export default StateMachine;
