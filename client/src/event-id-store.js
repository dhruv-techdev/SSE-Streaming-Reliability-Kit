/**
 * Event ID Store (SSRK-128, SSRK-129)
 * Tracks and optionally persists lastEventId for resume on reconnect
 */

/**
 * Storage interface for persisting lastEventId
 * @typedef {Object} StorageAdapter
 * @property {function(string): string|null} get - Get value by key
 * @property {function(string, string): void} set - Set value by key
 * @property {function(string): void} remove - Remove value by key
 */

/**
 * In-memory storage adapter (default)
 */
export class MemoryStorage {
  constructor() {
    this._data = new Map();
  }

  get(key) {
    return this._data.get(key) || null;
  }

  set(key, value) {
    this._data.set(key, value);
  }

  remove(key) {
    this._data.delete(key);
  }

  clear() {
    this._data.clear();
  }
}

/**
 * File-based storage adapter for Node.js (SSRK-129)
 */
export class FileStorage {
  constructor(filePath) {
    this._filePath = filePath;
    this._data = new Map();
    this._loaded = false;
  }

  _ensureLoaded() {
    if (this._loaded) return;

    try {
      // Dynamic import for Node.js fs
      const fs = require('fs');
      if (fs.existsSync(this._filePath)) {
        const content = fs.readFileSync(this._filePath, 'utf8');
        const parsed = JSON.parse(content);
        this._data = new Map(Object.entries(parsed));
      }
    } catch (err) {
      // File doesn't exist or invalid JSON - start fresh
      this._data = new Map();
    }
    this._loaded = true;
  }

  _save() {
    try {
      const fs = require('fs');
      const obj = Object.fromEntries(this._data);
      fs.writeFileSync(this._filePath, JSON.stringify(obj, null, 2));
    } catch (err) {
      console.error('[FileStorage] Failed to save:', err.message);
    }
  }

  get(key) {
    this._ensureLoaded();
    return this._data.get(key) || null;
  }

  set(key, value) {
    this._ensureLoaded();
    this._data.set(key, value);
    this._save();
  }

  remove(key) {
    this._ensureLoaded();
    this._data.delete(key);
    this._save();
  }

  clear() {
    this._data.clear();
    this._save();
  }
}

/**
 * LocalStorage adapter for browsers (SSRK-129)
 */
export class LocalStorageAdapter {
  constructor(prefix = 'sse_') {
    this._prefix = prefix;
  }

  _key(key) {
    return `${this._prefix}${key}`;
  }

  get(key) {
    try {
      return localStorage.getItem(this._key(key));
    } catch (err) {
      return null;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(this._key(key), value);
    } catch (err) {
      console.error('[LocalStorage] Failed to save:', err.message);
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(this._key(key));
    } catch (err) {
      // Ignore
    }
  }
}

/**
 * Event ID Store Class (SSRK-128, SSRK-129)
 * Maintains the resume pointer with optional persistence
 */
export class EventIdStore {
  /**
   * Create an event ID store
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Stream identifier for storage key
    this.streamId = options.streamId || 'default';

    // Storage adapter (SSRK-129)
    this._storage = options.storage || new MemoryStorage();

    // Storage key
    this._storageKey = options.storageKey || `lastEventId_${this.streamId}`;

    // In-memory cache
    this._lastEventId = null;

    // Whether to persist (SSRK-129)
    this._persist = options.persist !== false;

    // Load from storage if persisting
    if (this._persist) {
      this._loadFromStorage();
    }

    // Debug
    this._debug = options.debug || false;
  }

  /**
   * Load lastEventId from storage
   */
  _loadFromStorage() {
    const stored = this._storage.get(this._storageKey);
    if (stored) {
      this._lastEventId = stored;
      if (this._debug) {
        console.log(`[EVENT-ID-STORE] Loaded from storage: ${stored}`);
      }
    }
  }

  /**
   * Save lastEventId to storage
   */
  _saveToStorage() {
    if (!this._persist || !this._lastEventId) return;

    this._storage.set(this._storageKey, this._lastEventId);

    if (this._debug) {
      console.log(`[EVENT-ID-STORE] Saved to storage: ${this._lastEventId}`);
    }
  }

  /**
   * Update lastEventId after processing an event (SSRK-128)
   * Only updates for non-heartbeat events
   * @param {Object} envelope - The processed event envelope
   * @returns {boolean} Whether the ID was updated
   */
  updateFromEvent(envelope) {
    if (!envelope || !envelope.event_id) return false;

    // Skip heartbeat events - don't update resume pointer for them (SSRK-128)
    if (envelope.type === 'system.heartbeat') {
      return false;
    }

    this._lastEventId = envelope.event_id;
    this._saveToStorage();

    if (this._debug) {
      console.log(`[EVENT-ID-STORE] Updated: ${this._lastEventId} (type: ${envelope.type})`);
    }

    return true;
  }

  /**
   * Get current lastEventId (SSRK-128)
   * @returns {string|null}
   */
  get() {
    return this._lastEventId;
  }

  /**
   * Set lastEventId directly
   * @param {string} eventId
   */
  set(eventId) {
    this._lastEventId = eventId;
    this._saveToStorage();
  }

  /**
   * Clear stored lastEventId
   */
  clear() {
    this._lastEventId = null;
    this._storage.remove(this._storageKey);

    if (this._debug) {
      console.log(`[EVENT-ID-STORE] Cleared`);
    }
  }

  /**
   * Check if we have a lastEventId for resume
   * @returns {boolean}
   */
  hasResumePoint() {
    return this._lastEventId !== null;
  }

  /**
   * Get storage adapter
   */
  get storage() {
    return this._storage;
  }

  /**
   * Enable/disable debug
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

/**
 * Create an event ID store
 */
export function createEventIdStore(options) {
  return new EventIdStore(options);
}

export default EventIdStore;
