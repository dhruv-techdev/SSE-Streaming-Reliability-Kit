/**
 * Retry Policy (US-09)
 * Configurable exponential backoff with jitter
 */

/**
 * Default retry policy configuration (SSRK-97)
 */
export const DEFAULT_RETRY_POLICY = {
  baseDelayMs: 1000,        // Initial delay: 1 second
  maxDelayMs: 30000,        // Maximum delay: 30 seconds
  maxAttempts: 10,          // Maximum retry attempts (0 = unlimited)
  jitterPct: 0.2,           // 20% jitter (±10%)
  backoffMultiplier: 2,     // Exponential multiplier
};

/**
 * Retry Policy Class (SSRK-97)
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
    
    // Validate configuration
    this._validate();
  }

  /**
   * Validate configuration
   */
  _validate() {
    const { baseDelayMs, maxDelayMs, maxAttempts, jitterPct, backoffMultiplier } = this.config;
    
    if (baseDelayMs < 0) throw new Error('baseDelayMs must be >= 0');
    if (maxDelayMs < baseDelayMs) throw new Error('maxDelayMs must be >= baseDelayMs');
    if (maxAttempts < 0) throw new Error('maxAttempts must be >= 0');
    if (jitterPct < 0 || jitterPct > 1) throw new Error('jitterPct must be between 0 and 1');
    if (backoffMultiplier < 1) throw new Error('backoffMultiplier must be >= 1');
  }

  /**
   * Calculate exponential backoff delay (SSRK-98)
   * Formula: min(maxDelay, baseDelay * (multiplier ^ attempt))
   * 
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds (without jitter)
   */
  calculateBackoff(attempt) {
    const { baseDelayMs, maxDelayMs, backoffMultiplier } = this.config;
    
    // Exponential calculation
    const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
    
    // Clamp to maxDelayMs
    return Math.min(exponentialDelay, maxDelayMs);
  }

  /**
   * Add jitter to delay (SSRK-99)
   * Jitter helps prevent thundering herd problem
   * 
   * @param {number} delay - Base delay in milliseconds
   * @returns {number} Delay with jitter applied
   */
  addJitter(delay) {
    const { jitterPct } = this.config;
    
    if (jitterPct === 0) return delay;
    
    // Random value between -jitterPct/2 and +jitterPct/2
    const jitterRange = delay * jitterPct;
    const jitter = (Math.random() - 0.5) * jitterRange;
    
    // Ensure delay is at least 0
    return Math.max(0, Math.round(delay + jitter));
  }

  /**
   * Get delay for a specific attempt (SSRK-98, SSRK-99)
   * Combines exponential backoff with jitter
   * 
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Final delay in milliseconds
   */
  getDelay(attempt) {
    const baseDelay = this.calculateBackoff(attempt);
    return this.addJitter(baseDelay);
  }

  /**
   * Check if retry should be attempted (SSRK-97)
   * 
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {boolean} Whether to retry
   */
  shouldRetry(attempt) {
    const { maxAttempts } = this.config;
    
    // maxAttempts = 0 means unlimited retries
    if (maxAttempts === 0) return true;
    
    return attempt < maxAttempts;
  }

  /**
   * Get retry info for an attempt
   * 
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {{ shouldRetry: boolean, delay: number, attempt: number, maxAttempts: number }}
   */
  getRetryInfo(attempt) {
    return {
      shouldRetry: this.shouldRetry(attempt),
      delay: this.getDelay(attempt),
      attempt,
      maxAttempts: this.config.maxAttempts,
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
  // Default policy
  default: () => new RetryPolicy(),
  
  // Aggressive retry (for critical connections)
  aggressive: () => new RetryPolicy({
    baseDelayMs: 500,
    maxDelayMs: 10000,
    maxAttempts: 20,
    jitterPct: 0.3,
  }),
  
  // Conservative retry (for non-critical)
  conservative: () => new RetryPolicy({
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    maxAttempts: 5,
    jitterPct: 0.2,
  }),
  
  // No retry
  none: () => new RetryPolicy({
    maxAttempts: 0,
  }),
  
  // Unlimited retries with long backoff
  persistent: () => new RetryPolicy({
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    maxAttempts: 0, // Unlimited
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
