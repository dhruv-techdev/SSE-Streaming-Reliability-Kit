/**
 * Replay Buffer (SSRK-135, SSRK-136, SSRK-137, SSRK-138)
 * Bounded in-memory buffer for event replay on reconnect
 */

/**
 * Replay Buffer Class
 * Stores the last N events per stream for replay
 */
export class ReplayBuffer {
  /**
   * Create a replay buffer
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Max events to store (SSRK-135)
    this.maxSize = options.maxSize || 1000;
    
    // Max events to replay in one batch (SSRK-138)
    this.maxReplayBatch = options.maxReplayBatch || 100;
    
    // TTL for events in ms (optional, 0 = no expiry)
    this.ttlMs = options.ttlMs || 0;
    
    // Debug logging
    this._debug = options.debug || false;
    
    // Event storage - array for ordering (SSRK-137)
    this._events = [];
    
    // Index by event_id for fast lookup
    this._eventIndex = new Map();
    
    // Stats
    this._stats = {
      totalAdded: 0,
      totalEvicted: 0,
      totalReplays: 0,
      totalReplayEvents: 0,
      replayExceeded: 0,
    };
  }

  /**
   * Add an event to the buffer (SSRK-135)
   * @param {Object} event - Event envelope
   * @returns {boolean} Whether event was added
   */
  add(event) {
    if (!event || !event.event_id) {
      return false;
    }

    // Don't add duplicates
    if (this._eventIndex.has(event.event_id)) {
      return false;
    }

    // Add to buffer with timestamp
    const entry = {
      event,
      bufferedAt: Date.now(),
    };

    this._events.push(entry);
    this._eventIndex.set(event.event_id, this._events.length - 1);
    this._stats.totalAdded++;

    // Evict oldest if over max size (SSRK-135)
    if (this._events.length > this.maxSize) {
      this._evictOldest();
    }

    if (this._debug) {
      console.log(`[REPLAY-BUFFER] Added: ${event.event_id} (size: ${this._events.length})`);
    }

    return true;
  }

  /**
   * Evict the oldest event
   */
  _evictOldest() {
    const evicted = this._events.shift();
    if (evicted) {
      this._eventIndex.delete(evicted.event.event_id);
      this._stats.totalEvicted++;
      
      // Rebuild index (indices shifted)
      this._rebuildIndex();
      
      if (this._debug) {
        console.log(`[REPLAY-BUFFER] Evicted: ${evicted.event.event_id}`);
      }
    }
  }

  /**
   * Rebuild the index after eviction
   */
  _rebuildIndex() {
    this._eventIndex.clear();
    this._events.forEach((entry, index) => {
      this._eventIndex.set(entry.event.event_id, index);
    });
  }

  /**
   * Find events after a given event_id (SSRK-136)
   * 
   * Ordering rule (SSRK-137):
   * Events are returned in buffer order (insertion order),
   * which corresponds to the order they were originally sent.
   * 
   * @param {string} lastEventId - The last event ID the client received
   * @returns {{ found: boolean, events: Array, truncated: boolean, reason?: string }}
   */
  getEventsAfter(lastEventId) {
    // If no lastEventId, return empty (client starts fresh)
    if (!lastEventId) {
      return {
        found: true,
        events: [],
        truncated: false,
      };
    }

    // Check if TTL cleanup is needed
    if (this.ttlMs > 0) {
      this._cleanupExpired();
    }

    // Find the index of the last event (SSRK-136)
    const index = this._eventIndex.get(lastEventId);

    // Event not found - too old or never existed
    if (index === undefined) {
      if (this._debug) {
        console.log(`[REPLAY-BUFFER] Event not found: ${lastEventId}`);
      }
      return {
        found: false,
        events: [],
        truncated: false,
        reason: 'event_not_found',
      };
    }

    // Get all events after this one (SSRK-136, SSRK-137)
    const eventsAfter = this._events.slice(index + 1);
    
    // Check if we need to truncate (SSRK-138)
    let truncated = false;
    let replayEvents = eventsAfter.map(e => e.event);
    
    if (replayEvents.length > this.maxReplayBatch) {
      this._stats.replayExceeded++;
      truncated = true;
      replayEvents = replayEvents.slice(0, this.maxReplayBatch);
      
      if (this._debug) {
        console.log(`[REPLAY-BUFFER] Replay truncated: ${eventsAfter.length} → ${this.maxReplayBatch}`);
      }
    }

    this._stats.totalReplays++;
    this._stats.totalReplayEvents += replayEvents.length;

    if (this._debug) {
      console.log(`[REPLAY-BUFFER] Replay: ${replayEvents.length} events after ${lastEventId}`);
    }

    return {
      found: true,
      events: replayEvents,
      truncated,
      totalAvailable: eventsAfter.length,
    };
  }

  /**
   * Check if an event exists in the buffer
   * @param {string} eventId
   * @returns {boolean}
   */
  has(eventId) {
    return this._eventIndex.has(eventId);
  }

  /**
   * Get a specific event by ID
   * @param {string} eventId
   * @returns {Object|null}
   */
  get(eventId) {
    const index = this._eventIndex.get(eventId);
    if (index === undefined) return null;
    return this._events[index]?.event || null;
  }

  /**
   * Cleanup expired events (when TTL is set)
   */
  _cleanupExpired() {
    if (this.ttlMs <= 0) return;

    const now = Date.now();
    const cutoff = now - this.ttlMs;
    
    let removed = 0;
    while (this._events.length > 0 && this._events[0].bufferedAt < cutoff) {
      const evicted = this._events.shift();
      this._eventIndex.delete(evicted.event.event_id);
      removed++;
    }

    if (removed > 0) {
      this._rebuildIndex();
      this._stats.totalEvicted += removed;
      
      if (this._debug) {
        console.log(`[REPLAY-BUFFER] TTL cleanup: removed ${removed} expired events`);
      }
    }
  }

  /**
   * Clear all events
   */
  clear() {
    this._events = [];
    this._eventIndex.clear();
    
    if (this._debug) {
      console.log(`[REPLAY-BUFFER] Cleared`);
    }
  }

  /**
   * Get current buffer size
   */
  get size() {
    return this._events.length;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      size: this._events.length,
      maxSize: this.maxSize,
      maxReplayBatch: this.maxReplayBatch,
      ttlMs: this.ttlMs,
      ...this._stats,
    };
  }

  /**
   * Get the oldest event ID in buffer
   */
  get oldestEventId() {
    return this._events[0]?.event.event_id || null;
  }

  /**
   * Get the newest event ID in buffer
   */
  get newestEventId() {
    return this._events[this._events.length - 1]?.event.event_id || null;
  }

  /**
   * Enable/disable debug
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

/**
 * Create a replay buffer
 */
export function createReplayBuffer(options) {
  return new ReplayBuffer(options);
}

export default ReplayBuffer;
