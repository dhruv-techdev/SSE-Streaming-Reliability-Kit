/**
 * Retry Policy (US-09, US-10)
 * Configurable exponential backoff with jitter and time cap
 */

/**
 * Default retry policy configuration
 */
export const DEFAULT_RETRY_POLICY = {
  baseDelayMs: 1000, // Initial delay: 1 second
  maxDelayMs: 30000, // Maximum delay: 30 seconds
  maxAttempts: 10, // Maximum retry attempts (0 = unlimited)
  maxRetryTimeMs: 0, // Maximum total retry time (0 = unlimited) (SSRK-107)
  jitterPct: 0.2, // 20% jitter (±10%)
  backoffMultiplier: 2, // Exponential multiplier
};

/**
 * Retry Policy Class
 */
export class RetryPolicy {
  /**
   * Create a retry policy
   * @param {Object} config - Policy configuration
   */
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_RETRY_POLICY,
      ...config,
    };

    this._validate();
  }

  /**
   * Validate configuration
   */
  _validate() {
    const { baseDelayMs, maxDelayMs, maxAttempts, maxRetryTimeMs, jitterPct, backoffMultiplier } =
      this.config;

    if (baseDelayMs < 0) throw new Error('baseDelayMs must be >= 0');
    if (maxDelayMs < baseDelayMs) throw new Error('maxDelayMs must be >= baseDelayMs');
    if (maxAttempts < 0) throw new Error('maxAttempts must be >= 0');
    if (maxRetryTimeMs < 0) throw new Error('maxRetryTimeMs must be >= 0');
    if (jitterPct < 0 || jitterPct > 1) throw new Error('jitterPct must be between 0 and 1');
    if (backoffMultiplier < 1) throw new Error('backoffMultiplier must be >= 1');
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds (without jitter)
   */
  calculateBackoff(attempt) {
    const { baseDelayMs, maxDelayMs, backoffMultiplier } = this.config;
    const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
    return Math.min(exponentialDelay, maxDelayMs);
  }

  /**
   * Add jitter to delay
   * @param {number} delay - Base delay in milliseconds
   * @returns {number} Delay with jitter applied
   */
  addJitter(delay) {
    const { jitterPct } = this.config;
    if (jitterPct === 0) return delay;

    const jitterRange = delay * jitterPct;
    const jitter = (Math.random() - 0.5) * jitterRange;
    return Math.max(0, Math.round(delay + jitter));
  }

  /**
   * Get delay for a specific attempt
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Final delay in milliseconds
   */
  getDelay(attempt) {
    const baseDelay = this.calculateBackoff(attempt);
    return this.addJitter(baseDelay);
  }

  /**
   * Check if retry should be attempted based on attempt count (SSRK-106)
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {boolean} Whether to retry
   */
  shouldRetryByAttempts(attempt) {
    const { maxAttempts } = this.config;
    if (maxAttempts === 0) return true; // Unlimited
    return attempt < maxAttempts;
  }

  /**
   * Check if retry should be attempted based on elapsed time (SSRK-107)
   * @param {number} elapsedMs - Time elapsed since first failure
   * @returns {boolean} Whether to retry
   */
  shouldRetryByTime(elapsedMs) {
    const { maxRetryTimeMs } = this.config;
    if (maxRetryTimeMs === 0) return true; // Unlimited
    return elapsedMs < maxRetryTimeMs;
  }

  /**
   * Check if retry should be attempted (combines attempts + time) (SSRK-106, SSRK-107)
   * @param {number} attempt - Current attempt number (0-based)
   * @param {number} elapsedMs - Time elapsed since first failure
   * @returns {{ shouldRetry: boolean, reason: string|null }}
   */
  shouldRetry(attempt, elapsedMs = 0) {
    if (!this.shouldRetryByAttempts(attempt)) {
      return { shouldRetry: false, reason: 'max_attempts_reached' };
    }
    if (!this.shouldRetryByTime(elapsedMs)) {
      return { shouldRetry: false, reason: 'max_retry_time_exceeded' };
    }
    return { shouldRetry: true, reason: null };
  }

  /**
   * Get retry info for an attempt
   * @param {number} attempt - Current attempt number (0-based)
   * @param {number} elapsedMs - Time elapsed since first failure
   * @returns {Object} Retry info
   */
  getRetryInfo(attempt, elapsedMs = 0) {
    const { shouldRetry, reason } = this.shouldRetry(attempt, elapsedMs);

    return {
      shouldRetry,
      stopReason: reason,
      delay: this.getDelay(attempt),
      attempt,
      maxAttempts: this.config.maxAttempts,
      maxRetryTimeMs: this.config.maxRetryTimeMs,
      elapsedMs,
      isLastAttempt: this.config.maxAttempts > 0 && attempt >= this.config.maxAttempts - 1,
    };
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Create a new policy with modified config
   */
  with(overrides) {
    return new RetryPolicy({
      ...this.config,
      ...overrides,
    });
  }
}

/**
 * Preset policies for common scenarios
 */
export const RetryPolicies = {
  default: () => new RetryPolicy(),

  aggressive: () =>
    new RetryPolicy({
      baseDelayMs: 500,
      maxDelayMs: 10000,
      maxAttempts: 20,
      jitterPct: 0.3,
    }),

  conservative: () =>
    new RetryPolicy({
      baseDelayMs: 2000,
      maxDelayMs: 60000,
      maxAttempts: 5,
      jitterPct: 0.2,
    }),

  // Time-capped: try for max 5 minutes (SSRK-107)
  timeCapped: () =>
    new RetryPolicy({
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      maxAttempts: 0, // Unlimited attempts
      maxRetryTimeMs: 300000, // But stop after 5 minutes
      jitterPct: 0.25,
    }),

  // Both caps: max 10 attempts OR 2 minutes
  balanced: () =>
    new RetryPolicy({
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      maxAttempts: 10,
      maxRetryTimeMs: 120000,
      jitterPct: 0.2,
    }),

  none: () =>
    new RetryPolicy({
      maxAttempts: 1, // Only one attempt, no retries
    }),

  persistent: () =>
    new RetryPolicy({
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      maxAttempts: 0,
      maxRetryTimeMs: 0,
      jitterPct: 0.25,
    }),
};

/**
 * Create a retry policy
 */
export function createRetryPolicy(config) {
  return new RetryPolicy(config);
}

export default RetryPolicy;
