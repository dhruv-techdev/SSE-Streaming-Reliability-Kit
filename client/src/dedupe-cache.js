/**
 * Dedupe Cache (SSRK-146, SSRK-147, SSRK-148, SSRK-149, SSRK-150)
 * Bounded cache to detect and ignore duplicate events
 */

/**
 * Default configuration (SSRK-149)
 */
export const DEDUPE_DEFAULTS = {
  // Maximum number of event IDs to cache
  MAX_SIZE: 1000,
  
  // TTL for cached IDs in ms (0 = no expiry, rely on size limit)
  TTL_MS: 0,
  
  // Whether to track duplicates for telemetry
  TRACK_DUPLICATES: true,
};

/**
 * Dedupe Cache Class
 * Uses event_id as the dedupe key (SSRK-146)
 */
export class DedupeCache {
  /**
   * Create a dedupe cache
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Configuration (SSRK-149)
    this.maxSize = options.maxSize || DEDUPE_DEFAULTS.MAX_SIZE;
    this.ttlMs = options.ttlMs || DEDUPE_DEFAULTS.TTL_MS;
    this.trackDuplicates = options.trackDuplicates !== false;
    
    // Callbacks (SSRK-150)
    this.onDuplicate = options.onDuplicate || null;
    
    // Debug
    this._debug = options.debug || false;
    
    // Cache storage - Map for O(1) lookup
    // Key: event_id, Value: { addedAt: timestamp }
    this._cache = new Map();
    
    // Insertion order tracking for LRU eviction
    this._insertionOrder = [];
    
    // Stats (SSRK-150)
    this._stats = {
      totalChecked: 0,
      totalAdded: 0,
      totalDuplicates: 0,
      totalEvicted: 0,
      duplicatesByType: {},
    };
  }

  /**
   * Check if an event is a duplicate and add to cache if not (SSRK-146)
   * 
   * Dedupe strategy:
   * - Key: event_id (unique identifier)
   * - If event_id exists in cache → duplicate
   * - If event_id not in cache → add and return false
   * 
   * @param {Object} envelope - Event envelope
   * @returns {boolean} True if duplicate, false if new
   */
  isDuplicate(envelope) {
    if (!envelope || !envelope.event_id) {
      return false; // Can't dedupe without event_id
    }

    const eventId = envelope.event_id;
    const eventType = envelope.type;
    
    this._stats.totalChecked++;

    // Skip heartbeats and control events from cache (SSRK-148)
    if (this._shouldSkipCache(eventType)) {
      return false;
    }

    // Clean expired entries if TTL is set
    if (this.ttlMs > 0) {
      this._cleanupExpired();
    }

    // Check if duplicate
    if (this._cache.has(eventId)) {
      this._handleDuplicate(envelope);
      return true;
    }

    // Not a duplicate - add to cache
    this._addToCache(eventId);
    
    return false;
  }

  /**
   * Check if event type should skip cache (SSRK-148)
   * Heartbeats and control events don't pollute the cache
   */
  _shouldSkipCache(eventType) {
    if (!eventType) return false;
    
    // Skip heartbeats (SSRK-148)
    if (eventType === 'system.heartbeat') {
      return true;
    }
    
    // Skip control events (SSRK-148)
    if (eventType.startsWith('control.')) {
      return true;
    }
    
    // Skip system events
    if (eventType.startsWith('system.')) {
      return true;
    }
    
    return false;
  }

  /**
   * Handle duplicate detection (SSRK-150)
   */
  _handleDuplicate(envelope) {
    this._stats.totalDuplicates++;
    
    // Track by type (SSRK-150)
    if (this.trackDuplicates) {
      const type = envelope.type || 'unknown';
      this._stats.duplicatesByType[type] = (this._stats.duplicatesByType[type] || 0) + 1;
    }
    
    if (this._debug) {
      console.log(`[DEDUPE] Duplicate detected: ${envelope.event_id} (type: ${envelope.type})`);
    }
    
    // Fire callback (SSRK-150)
    if (this.onDuplicate) {
      this.onDuplicate({
        event_id: envelope.event_id,
        type: envelope.type,
        totalDuplicates: this._stats.totalDuplicates,
      });
    }
  }

  /**
   * Add event ID to cache (SSRK-147)
   */
  _addToCache(eventId) {
    // Evict oldest if at max size (SSRK-147)
    if (this._cache.size >= this.maxSize) {
      this._evictOldest();
    }
    
    this._cache.set(eventId, {
      addedAt: Date.now(),
    });
    this._insertionOrder.push(eventId);
    this._stats.totalAdded++;
    
    if (this._debug) {
      console.log(`[DEDUPE] Added: ${eventId} (size: ${this._cache.size})`);
    }
  }

  /**
   * Evict oldest entry (LRU-style) (SSRK-147)
   */
  _evictOldest() {
    while (this._insertionOrder.length > 0 && this._cache.size >= this.maxSize) {
      const oldestId = this._insertionOrder.shift();
      if (this._cache.has(oldestId)) {
        this._cache.delete(oldestId);
        this._stats.totalEvicted++;
        
        if (this._debug) {
          console.log(`[DEDUPE] Evicted: ${oldestId}`);
        }
      }
    }
  }

  /**
   * Cleanup expired entries (when TTL is set)
   */
  _cleanupExpired() {
    if (this.ttlMs <= 0) return;
    
    const now = Date.now();
    const cutoff = now - this.ttlMs;
    
    for (const [eventId, entry] of this._cache.entries()) {
      if (entry.addedAt < cutoff) {
        this._cache.delete(eventId);
        this._stats.totalEvicted++;
      }
    }
    
    // Clean up insertion order
    this._insertionOrder = this._insertionOrder.filter(id => this._cache.has(id));
  }

  /**
   * Check if event ID exists in cache (without adding)
   */
  has(eventId) {
    return this._cache.has(eventId);
  }

  /**
   * Manually add an event ID to cache
   */
  add(eventId) {
    if (!this._cache.has(eventId)) {
      this._addToCache(eventId);
    }
  }

  /**
   * Clear the cache
   */
  clear() {
    this._cache.clear();
    this._insertionOrder = [];
    
    if (this._debug) {
      console.log(`[DEDUPE] Cache cleared`);
    }
  }

  /**
   * Get current cache size
   */
  get size() {
    return this._cache.size;
  }

  /**
   * Get statistics (SSRK-150)
   */
  getStats() {
    return {
      size: this._cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      ...this._stats,
    };
  }

  /**
   * Get duplicate rate
   */
  get duplicateRate() {
    if (this._stats.totalChecked === 0) return 0;
    return this._stats.totalDuplicates / this._stats.totalChecked;
  }

  /**
   * Enable/disable debug
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

/**
 * Create a dedupe cache
 */
export function createDedupeCache(options) {
  return new DedupeCache(options);
}

export default DedupeCache;
