/**
 * Scenario Runner (SSRK-191)
 * Executes fault injection scenarios
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { StepType } from './scenario.js';
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
 * Scenario Runner Class
 */
export class ScenarioRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serverPort: options.serverPort || 3099,
      serverStartTimeout: options.serverStartTimeout || 5000,
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
  }

  /**
   * Run a scenario
   */
  async run(scenario) {
    const startTime = Date.now();
    const result = {
      name: scenario.name,
      status: ResultStatus.PASSED,
      duration: 0,
      steps: [],
      events: [],
      errors: [],
      stats: null,
      message: '',
    };

    try {
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Scenario timeout after ${scenario.timeout}ms`));
        }, scenario.timeout);
      });

      // Run scenario with timeout
      await Promise.race([
        this._executeScenario(scenario, result),
        timeoutPromise,
      ]);

      // Validate expected outcomes
      this._validateExpected(scenario, result);

    } catch (err) {
      result.status = err.message.includes('timeout') 
        ? ResultStatus.TIMEOUT 
        : ResultStatus.ERROR;
      result.message = err.message;
      result.errors.push(err.message);
    } finally {
      // Cleanup
      await this._cleanup();
      
      result.duration = Date.now() - startTime;
      result.events = [...this.events];
      result.stats = this.connector?.getStats() || null;
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

    // Start server if needed
    const serverConfig = {
      ...scenario.config.server,
      port: this.options.serverPort,
    };
    await this._startServer(serverConfig);

    // Execute each step
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepResult = {
        index: i,
        type: step.type,
        status: 'passed',
        message: '',
      };

      try {
        await this._executeStep(step, scenario);
        
        if (this.options.debug) {
          console.log(`  ✓ Step ${i}: ${step.type}`);
        }
      } catch (err) {
        stepResult.status = 'failed';
        stepResult.message = err.message;
        result.status = ResultStatus.FAILED;
        result.message = `Step ${i} (${step.type}) failed: ${err.message}`;
        
        if (this.options.debug) {
          console.log(`  ✗ Step ${i}: ${step.type} - ${err.message}`);
        }
      }

      result.steps.push(stepResult);
      
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

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // Step implementations

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
    // Kill the server connection by restarting with a brief stop
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await this._sleep(100);
      await this._startServer({ port: this.options.serverPort });
    }
  }

  async _stepPauseEvents(step) {
    // Signal server to pause (via env or control endpoint)
    // For now, just stop the server temporarily
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
    // Inject a duplicate by storing an event and re-emitting it
    if (this.events.length > 0) {
      const lastEvent = this.events[this.events.length - 1];
      // The dedupe cache will handle this when we receive the same event_id
      // For simulation, we need server-side support
      // This is a placeholder - real implementation needs server endpoint
    }
  }

  async _stepDelayEvents(step) {
    const delayMs = step.delayMs || 1000;
    // Would need server-side support to delay events
    // For now, just wait
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
    // Would need server-side support
    // For testing, we restart server with very long heartbeat interval
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

  async _stepAssertState(step) {
    const expectedState = step.state;
    const actualState = this.connector?.getState();

    if (actualState !== expectedState) {
      throw new Error(`Expected state ${expectedState}, got ${actualState}`);
    }
  }

  async _stepAssertStats(step) {
    const stats = this.connector?.getStats();
    
    for (const [key, expected] of Object.entries(step.stats)) {
      const actual = stats[key];
      
      if (typeof expected === 'object') {
        if (expected.min !== undefined && actual < expected.min) {
          throw new Error(`Expected ${key} >= ${expected.min}, got ${actual}`);
        }
        if (expected.max !== undefined && actual > expected.max) {
          throw new Error(`Expected ${key} <= ${expected.max}, got ${actual}`);
        }
      } else if (actual !== expected) {
        throw new Error(`Expected ${key} = ${expected}, got ${actual}`);
      }
    }
  }

  async _stepAssertEventsReceived(step) {
    const min = step.min || 0;
    const max = step.max;

    if (this.events.length < min) {
      throw new Error(`Expected at least ${min} events, got ${this.events.length}`);
    }

    if (max !== undefined && this.events.length > max) {
      throw new Error(`Expected at most ${max} events, got ${this.events.length}`);
    }
  }

  async _stepAssertDuplicatesDropped(step) {
    const expected = step.count;

    if (this.duplicatesDropped !== expected) {
      throw new Error(`Expected ${expected} duplicates dropped, got ${this.duplicatesDropped}`);
    }
  }

  async _stepAssertCannotResume(step) {
    if (!this.cannotResumeReceived) {
      throw new Error('Expected cannot-resume event but none received');
    }

    if (step.reason && this.cannotResumePayload?.code !== step.reason) {
      throw new Error(`Expected cannot-resume reason ${step.reason}, got ${this.cannotResumePayload?.code}`);
    }
  }

  /**
   * Validate expected outcomes
   */
  _validateExpected(scenario, result) {
    const expected = scenario.expected;
    
    if (!expected || Object.keys(expected).length === 0) {
      return;
    }

    const stats = this.connector?.getStats();

    if (expected.finalState && stats?.state !== expected.finalState) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected final state ${expected.finalState}, got ${stats?.state}`);
    }

    if (expected.minEventsReceived !== undefined && this.events.length < expected.minEventsReceived) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected at least ${expected.minEventsReceived} events, got ${this.events.length}`);
    }

    if (expected.reconnectCount !== undefined && stats?.reconnectCount !== expected.reconnectCount) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected ${expected.reconnectCount} reconnects, got ${stats?.reconnectCount}`);
    }

    if (expected.minReconnectCount !== undefined && (stats?.reconnectCount || 0) < expected.minReconnectCount) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected at least ${expected.minReconnectCount} reconnects, got ${stats?.reconnectCount}`);
    }

    if (expected.duplicatesDropped !== undefined && this.duplicatesDropped !== expected.duplicatesDropped) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected ${expected.duplicatesDropped} duplicates dropped, got ${this.duplicatesDropped}`);
    }

    if (expected.cannotResumeReceived && !this.cannotResumeReceived) {
      result.status = ResultStatus.FAILED;
      result.errors.push('Expected cannot-resume event but none received');
    }

    if (expected.livenessFailures !== undefined && this.livenessFailures !== expected.livenessFailures) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected ${expected.livenessFailures} liveness failures, got ${this.livenessFailures}`);
    }

    if (expected.minLivenessFailures !== undefined && this.livenessFailures < expected.minLivenessFailures) {
      result.status = ResultStatus.FAILED;
      result.errors.push(`Expected at least ${expected.minLivenessFailures} liveness failures, got ${this.livenessFailures}`);
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

    // Wait for server to start
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

export default { ScenarioRunner, createRunner, ResultStatus };
