/**
 * Assertion API (SSRK-200)
 * Common assertions for scenario validation
 */

/**
 * Assertion result
 */
export class AssertionResult {
  constructor(passed, message, details = {}) {
    this.passed = passed;
    this.message = message;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  static pass(message, details = {}) {
    return new AssertionResult(true, message, details);
  }

  static fail(message, details = {}) {
    return new AssertionResult(false, message, details);
  }
}

/**
 * Assertion Error for immediate failures
 */
export class AssertionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AssertionError';
    this.details = details;
  }
}

/**
 * Assertions class - fluent API for scenario assertions
 */
export class Assertions {
  constructor(context) {
    this.context = context;
    this.results = [];
  }

  /**
   * Record assertion result
   */
  _record(result) {
    this.results.push(result);
    if (!result.passed) {
      throw new AssertionError(result.message, result.details);
    }
    return this;
  }

  // ==================== State Assertions ====================

  /**
   * Assert connection state
   */
  state(expected) {
    const actual = this.context.connector?.getState();
    const passed = actual === expected;
    
    return this._record(
      passed
        ? AssertionResult.pass(`State is ${expected}`)
        : AssertionResult.fail(
            `Expected state ${expected}, got ${actual}`,
            { expected, actual }
          )
    );
  }

  /**
   * Assert connection is open
   */
  isConnected() {
    const connected = this.context.connector?.connected;
    
    return this._record(
      connected
        ? AssertionResult.pass('Client is connected')
        : AssertionResult.fail('Expected client to be connected')
    );
  }

  /**
   * Assert connection is closed
   */
  isClosed() {
    const state = this.context.connector?.getState();
    const closed = state === 'closed' || state === 'idle';
    
    return this._record(
      closed
        ? AssertionResult.pass('Client is closed')
        : AssertionResult.fail(`Expected client to be closed, got "${state}"`)
    );
  }

  // ==================== Reconnect Assertions (SSRK-202) ====================

  /**
   * Assert reconnect count
   */
  reconnectCount(expected) {
    const actual = this.context.connector?.stats.reconnectCount || 0;
    const passed = actual === expected;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Reconnect count is ${expected}`)
        : AssertionResult.fail(
            `Expected ${expected} reconnects, got ${actual}`,
            { expected, actual }
          )
    );
  }

  /**
   * Assert minimum reconnect count
   */
  minReconnects(min) {
    const actual = this.context.connector?.stats.reconnectCount || 0;
    const passed = actual >= min;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Reconnect count ${actual} >= ${min}`)
        : AssertionResult.fail(
            `Expected at least ${min} reconnects, got ${actual}`,
            { min, actual }
          )
    );
  }

  /**
   * Assert maximum reconnect count
   */
  maxReconnects(max) {
    const actual = this.context.connector?.stats.reconnectCount || 0;
    const passed = actual <= max;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Reconnect count ${actual} <= ${max}`)
        : AssertionResult.fail(
            `Expected at most ${max} reconnects, got ${actual}`,
            { max, actual }
          )
    );
  }

  /**
   * Assert client has given up (SSRK-202)
   */
  hasGivenUp() {
    const givenUp = this.context.connector?.hasGivenUp;
    
    return this._record(
      givenUp
        ? AssertionResult.pass('Client has given up reconnecting')
        : AssertionResult.fail('Expected client to have given up')
    );
  }

  /**
   * Assert client has NOT given up (SSRK-202)
   */
  hasNotGivenUp() {
    const givenUp = this.context.connector?.hasGivenUp;
    
    return this._record(
      !givenUp
        ? AssertionResult.pass('Client has not given up')
        : AssertionResult.fail('Expected client to not have given up')
    );
  }

  /**
   * Assert no further retries after give-up (SSRK-202)
   */
  noFurtherRetries() {
    const manager = this.context.connector?.getReconnectManager();
    const hasGivenUp = manager?.hasGivenUp;
    const pendingRetry = manager?.pendingRetryTimer !== null;
    
    const passed = hasGivenUp && !pendingRetry;
    
    return this._record(
      passed
        ? AssertionResult.pass('No further retries pending')
        : AssertionResult.fail(
            'Expected no further retries',
            { hasGivenUp, pendingRetry }
          )
    );
  }

  // ==================== Resume Assertions (SSRK-203) ====================

  /**
   * Assert resume was attempted
   */
  resumeAttempted() {
    const attempts = this.context.connector?.stats.resumeAttempts || 0;
    const passed = attempts > 0;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Resume was attempted (${attempts} times)`)
        : AssertionResult.fail('Expected resume to be attempted')
    );
  }

  /**
   * Assert resume succeeded (SSRK-203)
   */
  resumeSucceeded() {
    const successes = this.context.connector?.stats.resumeSuccesses || 0;
    const passed = successes > 0;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Resume succeeded (${successes} times)`)
        : AssertionResult.fail('Expected resume to succeed')
    );
  }

  /**
   * Assert resume failed
   */
  resumeFailed() {
    const failures = this.context.connector?.stats.resumeFailures || 0;
    const passed = failures > 0;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Resume failed (${failures} times)`)
        : AssertionResult.fail('Expected resume to fail')
    );
  }

  /**
   * Assert cannot-resume was received (SSRK-203)
   */
  cannotResumeReceived() {
    const received = this.context.cannotResumeReceived;
    
    return this._record(
      received
        ? AssertionResult.pass('Cannot-resume signal received')
        : AssertionResult.fail('Expected cannot-resume signal')
    );
  }

  /**
   * Assert events continued from expected point (SSRK-203)
   */
  eventsResumedFrom(expectedSequence) {
    const events = this.context.events;
    if (events.length === 0) {
      return this._record(
        AssertionResult.fail('No events received to verify resume point')
      );
    }

    const firstSeq = events[0].sequence;
    const passed = firstSeq >= expectedSequence;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Events resumed from sequence ${firstSeq}`)
        : AssertionResult.fail(
            `Expected events from sequence ${expectedSequence}, got ${firstSeq}`,
            { expected: expectedSequence, actual: firstSeq }
          )
    );
  }

  // ==================== Dedupe Assertions (SSRK-204) ====================

  /**
   * Assert duplicates were dropped (SSRK-204)
   */
  duplicatesDropped(expected) {
    const actual = this.context.duplicatesDropped || 0;
    const passed = actual === expected;
    
    return this._record(
      passed
        ? AssertionResult.pass(`${expected} duplicates dropped`)
        : AssertionResult.fail(
            `Expected ${expected} duplicates dropped, got ${actual}`,
            { expected, actual }
          )
    );
  }

  /**
   * Assert minimum duplicates dropped
   */
  minDuplicatesDropped(min) {
    const actual = this.context.duplicatesDropped || 0;
    const passed = actual >= min;
    
    return this._record(
      passed
        ? AssertionResult.pass(`${actual} duplicates dropped >= ${min}`)
        : AssertionResult.fail(
            `Expected at least ${min} duplicates dropped, got ${actual}`,
            { min, actual }
          )
    );
  }

  /**
   * Assert no duplicates processed (SSRK-204)
   */
  noDuplicatesProcessed() {
    const events = this.context.events;
    const eventIds = events.map(e => e.event_id);
    const uniqueIds = new Set(eventIds);
    
    const passed = eventIds.length === uniqueIds.size;
    
    return this._record(
      passed
        ? AssertionResult.pass('No duplicate events processed')
        : AssertionResult.fail(
            `Duplicate events were processed (${eventIds.length} events, ${uniqueIds.size} unique)`,
            { total: eventIds.length, unique: uniqueIds.size }
          )
    );
  }

  /**
   * Assert dedupe counter increased (SSRK-204)
   */
  dedupeCounterIncreased() {
    const stats = this.context.connector?.getDedupeCache()?.getStats();
    const passed = stats?.totalDuplicates > 0;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Dedupe counter: ${stats.totalDuplicates}`)
        : AssertionResult.fail('Expected dedupe counter to increase')
    );
  }

  // ==================== Liveness Assertions (SSRK-205) ====================

  /**
   * Assert liveness failure occurred (SSRK-205)
   */
  livenessFailureOccurred() {
    const failures = this.context.livenessFailures || 0;
    const passed = failures > 0;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Liveness failure occurred (${failures} times)`)
        : AssertionResult.fail('Expected liveness failure to occur')
    );
  }

  /**
   * Assert liveness failure count
   */
  livenessFailures(expected) {
    const actual = this.context.livenessFailures || 0;
    const passed = actual === expected;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Liveness failures: ${expected}`)
        : AssertionResult.fail(
            `Expected ${expected} liveness failures, got ${actual}`,
            { expected, actual }
          )
    );
  }

  /**
   * Assert reconnect was attempted after liveness failure (SSRK-205)
   */
  reconnectAfterLiveness() {
    const failures = this.context.livenessFailures || 0;
    const reconnects = this.context.connector?.stats.reconnectCount || 0;
    
    const passed = failures > 0 && reconnects > 0;
    
    return this._record(
      passed
        ? AssertionResult.pass('Reconnect attempted after liveness failure')
        : AssertionResult.fail(
            'Expected reconnect after liveness failure',
            { livenessFailures: failures, reconnects }
          )
    );
  }

  // ==================== Events Assertions ====================

  /**
   * Assert events received count
   */
  eventsReceived(expected) {
    const actual = this.context.events.length;
    const passed = actual === expected;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Received ${expected} events`)
        : AssertionResult.fail(
            `Expected ${expected} events, got ${actual}`,
            { expected, actual }
          )
    );
  }

  /**
   * Assert minimum events received
   */
  minEvents(min) {
    const actual = this.context.events.length;
    const passed = actual >= min;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Received ${actual} events >= ${min}`)
        : AssertionResult.fail(
            `Expected at least ${min} events, got ${actual}`,
            { min, actual }
          )
    );
  }

  /**
   * Assert maximum events received
   */
  maxEvents(max) {
    const actual = this.context.events.length;
    const passed = actual <= max;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Received ${actual} events <= ${max}`)
        : AssertionResult.fail(
            `Expected at most ${max} events, got ${actual}`,
            { max, actual }
          )
    );
  }

  /**
   * Assert event type was received
   */
  receivedEventType(eventType) {
    const found = this.context.events.some(e => e.type === eventType) ||
                  this.context.controlEvents.some(e => e.type === eventType);
    
    return this._record(
      found
        ? AssertionResult.pass(`Received event type: ${eventType}`)
        : AssertionResult.fail(`Expected event type "${eventType}" not received`)
    );
  }

  // ==================== Stats Assertions ====================

  /**
   * Assert a stats value
   */
  stat(name, expected) {
    const stats = this.context.connector?.getStats();
    const actual = stats?.[name];
    const passed = actual === expected;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Stat ${name} = ${expected}`)
        : AssertionResult.fail(
            `Expected ${name} = ${expected}, got ${actual}`,
            { name, expected, actual }
          )
    );
  }

  /**
   * Assert a stats value is at least min
   */
  statMin(name, min) {
    const stats = this.context.connector?.getStats();
    const actual = stats?.[name] || 0;
    const passed = actual >= min;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Stat ${name} ${actual} >= ${min}`)
        : AssertionResult.fail(
            `Expected ${name} >= ${min}, got ${actual}`,
            { name, min, actual }
          )
    );
  }

  /**
   * Assert a stats value is at most max
   */
  statMax(name, max) {
    const stats = this.context.connector?.getStats();
    const actual = stats?.[name] || 0;
    const passed = actual <= max;
    
    return this._record(
      passed
        ? AssertionResult.pass(`Stat ${name} ${actual} <= ${max}`)
        : AssertionResult.fail(
            `Expected ${name} <= ${max}, got ${actual}`,
            { name, max, actual }
          )
    );
  }

  // ==================== Custom Assertions ====================

  /**
   * Custom assertion with predicate
   */
  custom(description, predicate) {
    const passed = predicate(this.context);
    
    return this._record(
      passed
        ? AssertionResult.pass(description)
        : AssertionResult.fail(`Custom assertion failed: ${description}`)
    );
  }

  /**
   * Get all assertion results
   */
  getResults() {
    return [...this.results];
  }

  /**
   * Get summary of assertions
   */
  getSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    
    return {
      total: this.results.length,
      passed,
      failed,
      allPassed: failed === 0,
    };
  }
}

/**
 * Create assertions instance
 */
export function createAssertions(context) {
  return new Assertions(context);
}

export default { Assertions, AssertionResult, AssertionError, createAssertions };
