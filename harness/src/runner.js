/**
 * Scenario Runner (SSRK-191, SSRK-199, SSRK-201)
 * Executes fault injection scenarios with timeouts and fail-fast
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { StepType } from './scenario.js';
import { createAssertions, AssertionError } from './assertions.js';
import { connectSSE } from '../../client/src/sse-connector.js';

/**
 * Scenario execution result
 */
export const ResultStatus = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
};

/**
 * Default timeouts (SSRK-199, SSRK-201)
 */
export const DEFAULT_TIMEOUTS = {
  SCENARIO_TIMEOUT: 30000,      // Max time for entire scenario
  STEP_TIMEOUT: 10000,          // Max time for single step
  SERVER_START_TIMEOUT: 5000,   // Max time to start server
  GLOBAL_TIMEOUT: 300000,       // Max time for all scenarios (5 min)
};

/**
 * Scenario Runner Class
 */
export class ScenarioRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serverPort: options.serverPort || 3099,
      serverStartTimeout: options.serverStartTimeout || DEFAULT_TIMEOUTS.SERVER_START_TIMEOUT,
      globalTimeout: options.globalTimeout || DEFAULT_TIMEOUTS.GLOBAL_TIMEOUT,
      failFast: options.failFast || false,  // SSRK-199: Stop on first failure
      debug: options.debug || false,
    };

    this.serverProcess = null;
    this.connector = null;
    this.events = [];
    this.controlEvents = [];
    this.errors = [];
    this.duplicatesDropped = 0;
    this.cannotResumeReceived = false;
    this.cannotResumePayload = null;
    this.livenessFailures = 0;
    this.assertions = null;
    
    // Global timeout tracking (SSRK-199)
    this._globalStartTime = null;
    this._aborted = false;
  }

  /**
   * Check global timeout (SSRK-199)
   */
  _checkGlobalTimeout() {
    if (!this._globalStartTime) return false;
    const elapsed = Date.now() - this._globalStartTime;
    return elapsed > this.options.globalTimeout;
  }

  /**
   * Run multiple scenarios (SSRK-199, SSRK-207)
   */
  async runAll(scenarios, options = {}) {
    const results = [];
    this._globalStartTime = Date.now();
    this._aborted = false;

    for (const scenario of scenarios) {
      // Check global timeout (SSRK-199)
      if (this._checkGlobalTimeout()) {
        results.push({
          name: scenario.name,
          status: ResultStatus.TIMEOUT,
          duration: 0,
          steps: [],
          events: [],
          errors: ['Global timeout exceeded'],
          stats: null,
          message: `Global timeout of ${this.options.globalTimeout}ms exceeded`,
        });
        this._aborted = true;
        break;
      }

      // Run scenario
      const result = await this.run(scenario);
      results.push(result);

      // Fail-fast: stop on first failure (SSRK-199)
      if (this.options.failFast && result.status !== ResultStatus.PASSED) {
        this._aborted = true;
        break;
      }
    }

    return {
      results,
      aborted: this._aborted,
      duration: Date.now() - this._globalStartTime,
    };
  }

  /**
   * Run a scenario
   */
  async run(scenario) {
    const startTime = Date.now();
    
    // Apply timeout (SSRK-199, SSRK-201)
    const timeout = scenario.timeout || DEFAULT_TIMEOUTS.SCENARIO_TIMEOUT;
    
    const result = {
      name: scenario.name,
      status: ResultStatus.PASSED,
      duration: 0,
      steps: [],
      events: [],
      errors: [],
      stats: null,
      message: '',
      assertions: [],
    };

    try {
      // Set up timeout (SSRK-201)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Scenario timeout after ${timeout}ms`));
        }, timeout);
      });

      // Run scenario with timeout
      await Promise.race([
        this._executeScenario(scenario, result),
        timeoutPromise,
      ]);

      // Validate expected outcomes
      this._validateExpected(scenario, result);

    } catch (err) {
      if (err.message.includes('timeout')) {
        result.status = ResultStatus.TIMEOUT;
      } else if (err instanceof AssertionError) {
        result.status = ResultStatus.FAILED;
      } else {
        result.status = ResultStatus.ERROR;
      }
      result.message = err.message;
      result.errors.push(err.message);
    } finally {
      // Cleanup
      await this._cleanup();
      
      result.duration = Date.now() - startTime;
      result.events = [...this.events];
      result.stats = this.connector?.getStats() || null;
      result.assertions = this.assertions?.getResults() || [];
    }

    return result;
  }

  /**
   * Execute scenario steps
   */
  async _executeScenario(scenario, result) {
    // Reset state
    this.events = [];
    this.controlEvents = [];
    this.errors = [];
    this.duplicatesDropped = 0;
    this.cannotResumeReceived = false;
    this.cannotResumePayload = null;
    this.livenessFailures = 0;
    
    // Create assertions context
    this.assertions = createAssertions(this);

    // Start server if needed
    const serverConfig = {
      ...scenario.config.server,
      port: this.options.serverPort,
    };
    await this._startServer(serverConfig);

    // Execute each step with individual timeout (SSRK-201)
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepTimeout = step.timeout || DEFAULT_TIMEOUTS.STEP_TIMEOUT;
      
      const stepResult = {
        index: i,
        type: step.type,
        status: 'passed',
        message: '',
        duration: 0,
      };

      const stepStart = Date.now();

      try {
        // Step with timeout (SSRK-201)
        await Promise.race([
          this._executeStep(step, scenario),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Step timeout after ${stepTimeout}ms`)), stepTimeout);
          }),
        ]);
        
        stepResult.duration = Date.now() - stepStart;
        
        if (this.options.debug) {
          console.log(`  ✓ Step ${i}: ${step.type} (${stepResult.duration}ms)`);
        }
      } catch (err) {
        stepResult.status = 'failed';
        stepResult.message = err.message;
        stepResult.duration = Date.now() - stepStart;
        result.status = ResultStatus.FAILED;
        result.message = `Step ${i} (${step.type}) failed: ${err.message}`;
        
        if (this.options.debug) {
          console.log(`  ✗ Step ${i}: ${step.type} - ${err.message}`);
        }
      }

      result.steps.push(stepResult);
      
      // Fail-fast on step failure (SSRK-199)
      if (stepResult.status === 'failed') {
        break;
      }
    }
  }

  /**
   * Execute a single step
   */
  async _executeStep(step, scenario) {
    switch (step.type) {
      case StepType.CONNECT:
        await this._stepConnect(step, scenario);
        break;

      case StepType.DISCONNECT:
        await this._stepDisconnect(step);
        break;

      case StepType.WAIT_CONNECTED:
        await this._stepWaitConnected(step);
        break;

      case StepType.WAIT_EVENTS:
        await this._stepWaitEvents(step);
        break;

      case StepType.WAIT_EVENT_TYPE:
        await this._stepWaitEventType(step);
        break;

      case StepType.DROP_CONNECTION:
        await this._stepDropConnection(step);
        break;

      case StepType.PAUSE_EVENTS:
        await this._stepPauseEvents(step);
        break;

      case StepType.RESUME_EVENTS:
        await this._stepResumeEvents(step);
        break;

      case StepType.INJECT_DUPLICATE:
        await this._stepInjectDuplicate(step);
        break;

      case StepType.DELAY_EVENTS:
        await this._stepDelayEvents(step);
        break;

      case StepType.RESTART_SERVER:
        await this._stepRestartServer(step, scenario);
        break;

      case StepType.STOP_HEARTBEATS:
        await this._stepStopHeartbeats(step);
        break;

      case StepType.RESUME_HEARTBEATS:
        await this._stepResumeHeartbeats(step);
        break;

      case StepType.WAIT:
        await this._stepWait(step);
        break;

      case StepType.WAIT_RECONNECT:
        await this._stepWaitReconnect(step);
        break;

      case StepType.WAIT_LIVENESS_FAILURE:
        await this._stepWaitLivenessFailure(step);
        break;

      case StepType.WAIT_GIVE_UP:
        await this._stepWaitGiveUp(step);
        break;

      case StepType.ASSERT_STATE:
        await this._stepAssertState(step);
        break;

      case StepType.ASSERT_STATS:
        await this._stepAssertStats(step);
        break;

      case StepType.ASSERT_EVENTS_RECEIVED:
        await this._stepAssertEventsReceived(step);
        break;

      case StepType.ASSERT_DUPLICATES_DROPPED:
        await this._stepAssertDuplicatesDropped(step);
        break;

      case StepType.ASSERT_CANNOT_RESUME:
        await this._stepAssertCannotResume(step);
        break;

      case StepType.ASSERT_RECONNECTS:
        await this._stepAssertReconnects(step);
        break;

      case StepType.ASSERT_GIVEN_UP:
        await this._stepAssertGivenUp(step);
        break;

      case StepType.ASSERT_RESUME_SUCCESS:
        await this._stepAssertResumeSuccess(step);
        break;

      case StepType.ASSERT_LIVENESS_FAILURE:
        await this._stepAssertLivenessFailure(step);
        break;

      case StepType.ASSERT_NO_DUPLICATES:
        await this._stepAssertNoDuplicates(step);
        break;

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // ==================== Step Implementations ====================

  async _stepConnect(step, scenario) {
    const clientConfig = {
      autoReconnect: true,
      enableLivenessCheck: true,
      livenessTimeoutMs: 2000,
      livenessGracePeriodMs: 500,
      ...scenario.config.client,
      ...step.config,
      onEvent: (event) => {
        this.events.push(event);
        this.emit('event', event);
      },
      onControl: (event) => {
        this.controlEvents.push(event);
        if (event.type === 'control.cannot_resume') {
          this.cannotResumeReceived = true;
          this.cannotResumePayload = event.payload;
        }
        this.emit('control', event);
      },
      onError: (err) => {
        this.errors.push(err);
        this.emit('error', err);
      },
      onDuplicate: () => {
        this.duplicatesDropped++;
        this.emit('duplicate');
      },
      onLivenessFailure: () => {
        this.livenessFailures++;
        this.emit('liveness_failure');
      },
    };

    this.connector = connectSSE(
      `http://localhost:${this.options.serverPort}/stream`,
      clientConfig
    );
  }

  async _stepDisconnect(step) {
    if (this.connector) {
      this.connector.stop();
    }
  }

  async _stepWaitConnected(step) {
    const timeout = step.timeout || 5000;
    const start = Date.now();

    while (!this.connector?.connected) {
      if (Date.now() - start > timeout) {
        throw new Error('Timeout waiting for connection');
      }
      await this._sleep(100);
    }
  }

  async _stepWaitEvents(step) {
    const count = step.count || 1;
    const timeout = step.timeout || 10000;
    const start = Date.now();
    const initialCount = this.events.length;

    while (this.events.length - initialCount < count) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for ${count} events (got ${this.events.length - initialCount})`);
      }
      await this._sleep(100);
    }
  }

  async _stepWaitEventType(step) {
    const eventType = step.eventType;
    const timeout = step.timeout || 10000;
    const start = Date.now();

    while (!this.events.some(e => e.type === eventType) && 
           !this.controlEvents.some(e => e.type === eventType)) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for event type: ${eventType}`);
      }
      await this._sleep(100);
    }
  }

  async _stepDropConnection(step) {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await this._sleep(100);
      await this._startServer({ port: this.options.serverPort });
    }
  }

  async _stepPauseEvents(step) {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGSTOP');
    }
  }

  async _stepResumeEvents(step) {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGCONT');
    }
  }

  async _stepInjectDuplicate(step) {
    // Placeholder - needs server support
  }

  async _stepDelayEvents(step) {
    const delayMs = step.delayMs || 1000;
    await this._sleep(delayMs);
  }

  async _stepRestartServer(step, scenario) {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await this._sleep(500);
    }
    
    await this._startServer({
      ...scenario.config.server,
      port: this.options.serverPort,
    });
  }

  async _stepStopHeartbeats(step) {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await this._sleep(200);
    }
    
    await this._startServer({
      port: this.options.serverPort,
      heartbeatInterval: 999999,
    });
  }

  async _stepResumeHeartbeats(step) {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await this._sleep(200);
    }
    
    await this._startServer({
      port: this.options.serverPort,
      heartbeatInterval: 1000,
    });
  }

  async _stepWait(step) {
    const ms = step.ms || 1000;
    await this._sleep(ms);
  }

  async _stepWaitReconnect(step) {
    const timeout = step.timeout || 10000;
    const start = Date.now();
    const initialCount = this.connector?.stats.reconnectCount || 0;

    while ((this.connector?.stats.reconnectCount || 0) <= initialCount) {
      if (Date.now() - start > timeout) {
        throw new Error('Timeout waiting for reconnect');
      }
      await this._sleep(100);
    }
  }

  async _stepWaitLivenessFailure(step) {
    const timeout = step.timeout || 10000;
    const start = Date.now();
    const initialCount = this.livenessFailures;

    while (this.livenessFailures <= initialCount) {
      if (Date.now() - start > timeout) {
        throw new Error('Timeout waiting for liveness failure');
      }
      await this._sleep(100);
    }
  }

  async _stepWaitGiveUp(step) {
    const timeout = step.timeout || 30000;
    const start = Date.now();

    while (!this.connector?.hasGivenUp) {
      if (Date.now() - start > timeout) {
        throw new Error('Timeout waiting for give-up');
      }
      await this._sleep(100);
    }
  }

  // ==================== Assertion Steps (SSRK-200) ====================

  async _stepAssertState(step) {
    this.assertions.state(step.state);
  }

  async _stepAssertStats(step) {
    const stats = this.connector?.getStats();
    
    for (const [key, expected] of Object.entries(step.stats)) {
      const actual = stats[key];
      
      if (typeof expected === 'object') {
        if (expected.min !== undefined) {
          this.assertions.statMin(key, expected.min);
        }
        if (expected.max !== undefined) {
          this.assertions.statMax(key, expected.max);
        }
      } else {
        this.assertions.stat(key, expected);
      }
    }
  }

  async _stepAssertEventsReceived(step) {
    if (step.min !== undefined) {
      this.assertions.minEvents(step.min);
    }
    if (step.max !== undefined) {
      this.assertions.maxEvents(step.max);
    }
    if (step.count !== undefined) {
      this.assertions.eventsReceived(step.count);
    }
  }

  async _stepAssertDuplicatesDropped(step) {
    if (step.count !== undefined) {
      this.assertions.duplicatesDropped(step.count);
    }
    if (step.min !== undefined) {
      this.assertions.minDuplicatesDropped(step.min);
    }
  }

  async _stepAssertCannotResume(step) {
    this.assertions.cannotResumeReceived();
  }

  async _stepAssertReconnects(step) {
    if (step.count !== undefined) {
      this.assertions.reconnectCount(step.count);
    }
    if (step.min !== undefined) {
      this.assertions.minReconnects(step.min);
    }
    if (step.max !== undefined) {
      this.assertions.maxReconnects(step.max);
    }
  }

  async _stepAssertGivenUp(step) {
    this.assertions.hasGivenUp();
    if (step.noFurtherRetries) {
      this.assertions.noFurtherRetries();
    }
  }

  async _stepAssertResumeSuccess(step) {
    this.assertions.resumeSucceeded();
  }

  async _stepAssertLivenessFailure(step) {
    this.assertions.livenessFailureOccurred();
    if (step.reconnectAttempted) {
      this.assertions.reconnectAfterLiveness();
    }
  }

  async _stepAssertNoDuplicates(step) {
    this.assertions.noDuplicatesProcessed();
  }

  /**
   * Validate expected outcomes
   */
  _validateExpected(scenario, result) {
    const expected = scenario.expected;
    
    if (!expected || Object.keys(expected).length === 0) {
      return;
    }

    try {
      if (expected.finalState) {
        this.assertions.state(expected.finalState);
      }

      if (expected.minEventsReceived !== undefined) {
        this.assertions.minEvents(expected.minEventsReceived);
      }

      if (expected.reconnectCount !== undefined) {
        this.assertions.reconnectCount(expected.reconnectCount);
      }

      if (expected.minReconnectCount !== undefined) {
        this.assertions.minReconnects(expected.minReconnectCount);
      }

      if (expected.maxReconnectCount !== undefined) {
        this.assertions.maxReconnects(expected.maxReconnectCount);
      }

      if (expected.duplicatesDropped !== undefined) {
        this.assertions.duplicatesDropped(expected.duplicatesDropped);
      }

      if (expected.cannotResumeReceived) {
        this.assertions.cannotResumeReceived();
      }

      if (expected.livenessFailures !== undefined) {
        this.assertions.livenessFailures(expected.livenessFailures);
      }

      if (expected.minLivenessFailures !== undefined) {
        this.assertions.custom(
          `At least ${expected.minLivenessFailures} liveness failures`,
          (ctx) => ctx.livenessFailures >= expected.minLivenessFailures
        );
      }

      if (expected.hasGivenUp) {
        this.assertions.hasGivenUp();
      }

      if (expected.resumeSucceeded) {
        this.assertions.resumeSucceeded();
      }

    } catch (err) {
      result.status = ResultStatus.FAILED;
      result.errors.push(err.message);
    }
  }

  /**
   * Start test server
   */
  async _startServer(config = {}) {
    const env = {
      ...process.env,
      PORT: config.port || this.options.serverPort,
      NODE_ENV: 'test',
      SSE_TICK_INTERVAL: String(config.tickInterval || 200),
      SSE_HEARTBEAT_INTERVAL: String(config.heartbeatInterval || 1000),
      SSE_MAX_BUFFER_SIZE: String(config.maxBufferSize || 100),
      MAX_CONNECTIONS: String(config.maxConnections || 10),
    };

    this.serverProcess = spawn('node', ['server/src/server.js'], {
      env,
      stdio: 'pipe',
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server start timeout'));
      }, this.options.serverStartTimeout);

      this.serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('SSE Streaming')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Cleanup resources
   */
  async _cleanup() {
    if (this.connector) {
      this.connector.stop();
      this.connector = null;
    }

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }

    await this._sleep(200);
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a scenario runner
 */
export function createRunner(options) {
  return new ScenarioRunner(options);
}

export default { ScenarioRunner, createRunner, ResultStatus, DEFAULT_TIMEOUTS };
