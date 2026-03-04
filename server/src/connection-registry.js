/**
 * Connection Registry (SSRK-75, SSRK-76, SSRK-77)
 * Tracks connected clients, handles cleanup, prevents memory leaks
 */
import { DisconnectReason } from '../../shared/src/index.js';

class ConnectionRegistry {
  constructor(options = {}) {
    this.connections = new Map();
    this.maxConnections = options.maxConnections || 1000;
    this.onConnectionChange = options.onConnectionChange || (() => {});

    // Stats
    this.stats = {
      totalConnections: 0,
      totalDisconnections: 0,
      rejectedConnections: 0,
    };
  }

  /**
   * Register a new connection (ST-01)
   * @param {string} id - Unique connection ID
   * @param {Object} connection - Connection details
   * @returns {{ success: boolean, reason?: string }}
   */
  register(id, connection) {
    // Check max connections (ST-06)
    if (this.connections.size >= this.maxConnections) {
      this.stats.rejectedConnections++;
      this.log('REJECT', id, { reason: DisconnectReason.OVERLOAD_REJECT });
      return { success: false, reason: DisconnectReason.OVERLOAD_REJECT };
    }

    const entry = {
      id,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      state: 'open',
      ...connection,
      timers: new Set(),
      cleanup: null,
    };

    this.connections.set(id, entry);
    this.stats.totalConnections++;
    this.log('CONNECT', id, { total: this.connections.size });
    this.onConnectionChange('connect', id, this.connections.size);

    return { success: true };
  }

  /**
   * Get a connection by ID
   */
  get(id) {
    return this.connections.get(id);
  }

  /**
   * Check if connection exists
   */
  has(id) {
    return this.connections.has(id);
  }

  /**
   * Register a timer for cleanup tracking
   */
  addTimer(id, timer) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.timers.add(timer);
    }
  }

  /**
   * Set the cleanup function for a connection (ST-03)
   */
  setCleanup(id, cleanupFn) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.cleanup = cleanupFn;
    }
  }

  /**
   * Update last activity time
   */
  touch(id) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastActivityAt = Date.now();
    }
  }

  /**
   * Remove connection and cleanup resources (ST-02, ST-03)
   * @param {string} id - Connection ID
   * @param {string} reason - Disconnect reason from taxonomy
   */
  unregister(id, reason = DisconnectReason.CLIENT_CLOSE) {
    const conn = this.connections.get(id);
    if (!conn) return false;

    // Mark as closing
    conn.state = 'closing';

    // Clear all timers (ST-02)
    for (const timer of conn.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    conn.timers.clear();

    // Call cleanup function (ST-03)
    if (typeof conn.cleanup === 'function') {
      try {
        conn.cleanup(reason);
      } catch (err) {
        this.log('ERROR', id, { error: err.message });
      }
    }

    // Remove from registry
    this.connections.delete(id);
    this.stats.totalDisconnections++;

    const duration = Date.now() - conn.connectedAt;
    this.log('DISCONNECT', id, { reason, duration, total: this.connections.size });
    this.onConnectionChange('disconnect', id, this.connections.size);

    return true;
  }

  /**
   * Get current connection count
   */
  get size() {
    return this.connections.size;
  }

  /**
   * Get all connection IDs
   */
  get ids() {
    return Array.from(this.connections.keys());
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.connections.size,
      maxConnections: this.maxConnections,
    };
  }

  /**
   * Close all connections (ST-05: graceful shutdown)
   * @param {string} reason - Disconnect reason
   */
  closeAll(reason = DisconnectReason.SERVER_SHUTDOWN) {
    this.log('SHUTDOWN', 'all', { count: this.connections.size, reason });

    for (const id of this.connections.keys()) {
      this.unregister(id, reason);
    }
  }

  /**
   * Internal logging (ST-07)
   */
  log(event, connectionId, data = {}) {
    const entry = {
      ts: new Date().toISOString(),
      event,
      connectionId,
      ...data,
    };

    // Avoid logging sensitive data
    delete entry.request;
    delete entry.response;

    console.log(`[REGISTRY] [${event}] ${connectionId}`, JSON.stringify(data));
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get or create the connection registry
 */
export function getRegistry(options) {
  if (!registryInstance) {
    registryInstance = new ConnectionRegistry(options);
  }
  return registryInstance;
}

/**
 * Create a non-singleton registry instance
 * Useful for isolated tests and explicit composition.
 */
export function createRegistry(options) {
  return new ConnectionRegistry(options);
}

/**
 * Reset registry (for testing)
 */
export function resetRegistry() {
  if (registryInstance) {
    registryInstance.closeAll();
  }
  registryInstance = null;
}

export { ConnectionRegistry };
