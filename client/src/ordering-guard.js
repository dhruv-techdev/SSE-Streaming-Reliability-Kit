/**
 * Ordering Guard (SSRK-152, SSRK-153, SSRK-154, SSRK-155, SSRK-156)
 * Enforces event ordering and idempotency rules
 */

/**
 * Ordering rule options (SSRK-152)
 * Defines what "in order" means
 */
export const OrderingRule = {
  // Order by sequence number (monotonically increasing)
  // Events with sequence <= last accepted are out-of-order
  SEQUENCE: 'sequence',

  // Order by event_id (UUIDv7 is time-sortable)
  // Events with event_id < last accepted are out-of-order
  EVENT_ID: 'event_id',

  // Order by timestamp (ts field)
  // Events with ts < last accepted are out-of-order
  TIMESTAMP: 'timestamp',

  // No ordering enforcement (accept all)
  NONE: 'none',
};

/**
 * Out-of-order handling policy (SSRK-154)
 */
export const OutOfOrderPolicy = {
  // Drop out-of-order events silently
  DROP: 'drop',

  // Drop and emit callback
  DROP_WITH_CALLBACK: 'drop_with_callback',

  // Accept anyway (log only)
  ACCEPT: 'accept',

  // Buffer for reordering (not implemented - complex)
  // BUFFER: 'buffer',
};

/**
 * Ordering Guard Class
 */
export class OrderingGuard {
  /**
   * Create an ordering guard
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Ordering rule (SSRK-152)
    this.orderingRule = options.orderingRule || OrderingRule.SEQUENCE;

    // Out-of-order policy (SSRK-154)
    this.outOfOrderPolicy = options.outOfOrderPolicy || OutOfOrderPolicy.DROP_WITH_CALLBACK;

    // Callbacks (SSRK-154)
    this.onOutOfOrder = options.onOutOfOrder || null;

    // Idempotency guardrail hook (SSRK-155)
    this.shouldProcess = options.shouldProcess || null;

    // Debug
    this._debug = options.debug || false;

    // Last accepted markers (SSRK-153)
    this._lastAcceptedSequence = null;
    this._lastAcceptedEventId = null;
    this._lastAcceptedTimestamp = null;

    // Stats
    this._stats = {
      totalChecked: 0,
      totalAccepted: 0,
      totalDropped: 0,
      outOfOrderByType: {},
    };
  }

  /**
   * Check if event should be processed (SSRK-153, SSRK-154, SSRK-155, SSRK-156)
   *
   * @param {Object} envelope - Event envelope
   * @returns {{ accept: boolean, reason?: string }}
   */
  check(envelope) {
    if (!envelope) {
      return { accept: false, reason: 'null_envelope' };
    }

    this._stats.totalChecked++;

    // Control events don't affect ordering (SSRK-156)
    if (this._isControlEvent(envelope.type)) {
      this._stats.totalAccepted++;
      return { accept: true, reason: 'control_event' };
    }

    // System events don't affect ordering (SSRK-156)
    if (this._isSystemEvent(envelope.type)) {
      this._stats.totalAccepted++;
      return { accept: true, reason: 'system_event' };
    }

    // Check custom guardrail hook first (SSRK-155)
    if (this.shouldProcess) {
      const context = {
        lastAcceptedSequence: this._lastAcceptedSequence,
        lastAcceptedEventId: this._lastAcceptedEventId,
        lastAcceptedTimestamp: this._lastAcceptedTimestamp,
      };

      const hookResult = this.shouldProcess(envelope, context);

      if (hookResult === false) {
        this._stats.totalDropped++;
        return { accept: false, reason: 'rejected_by_hook' };
      }

      // If hook returns true or undefined, continue with normal checks
    }

    // No ordering enforcement
    if (this.orderingRule === OrderingRule.NONE) {
      this._updateMarkers(envelope);
      this._stats.totalAccepted++;
      return { accept: true };
    }

    // Check ordering based on rule (SSRK-152)
    const orderCheck = this._checkOrdering(envelope);

    if (!orderCheck.inOrder) {
      return this._handleOutOfOrder(envelope, orderCheck.reason);
    }

    // In order - update markers and accept
    this._updateMarkers(envelope);
    this._stats.totalAccepted++;

    return { accept: true };
  }

  /**
   * Check if event type is a control event (SSRK-156)
   */
  _isControlEvent(type) {
    return type && type.startsWith('control.');
  }

  /**
   * Check if event type is a system event (SSRK-156)
   */
  _isSystemEvent(type) {
    return type && type.startsWith('system.');
  }

  /**
   * Check ordering based on configured rule (SSRK-152)
   */
  _checkOrdering(envelope) {
    switch (this.orderingRule) {
      case OrderingRule.SEQUENCE:
        return this._checkSequenceOrdering(envelope);

      case OrderingRule.EVENT_ID:
        return this._checkEventIdOrdering(envelope);

      case OrderingRule.TIMESTAMP:
        return this._checkTimestampOrdering(envelope);

      default:
        return { inOrder: true };
    }
  }

  /**
   * Check sequence-based ordering (SSRK-152)
   * Events must have monotonically increasing sequence numbers
   */
  _checkSequenceOrdering(envelope) {
    const sequence = envelope.sequence;

    // No sequence - can't enforce ordering
    if (sequence === undefined || sequence === null) {
      return { inOrder: true, reason: 'no_sequence' };
    }

    // First event - always accept
    if (this._lastAcceptedSequence === null) {
      return { inOrder: true };
    }

    // Check if sequence is greater than last accepted
    if (sequence <= this._lastAcceptedSequence) {
      return {
        inOrder: false,
        reason: 'sequence_not_increasing',
        expected: this._lastAcceptedSequence + 1,
        received: sequence,
      };
    }

    return { inOrder: true };
  }

  /**
   * Check event_id-based ordering (SSRK-152)
   * UUIDv7 event_ids are time-sortable, so string comparison works
   */
  _checkEventIdOrdering(envelope) {
    const eventId = envelope.event_id;

    if (!eventId) {
      return { inOrder: true, reason: 'no_event_id' };
    }

    if (this._lastAcceptedEventId === null) {
      return { inOrder: true };
    }

    // String comparison works for UUIDv7 (time-ordered)
    if (eventId <= this._lastAcceptedEventId) {
      return {
        inOrder: false,
        reason: 'event_id_not_increasing',
        lastAccepted: this._lastAcceptedEventId,
        received: eventId,
      };
    }

    return { inOrder: true };
  }

  /**
   * Check timestamp-based ordering (SSRK-152)
   */
  _checkTimestampOrdering(envelope) {
    const ts = envelope.ts;

    if (!ts) {
      return { inOrder: true, reason: 'no_timestamp' };
    }

    if (this._lastAcceptedTimestamp === null) {
      return { inOrder: true };
    }

    const eventTime = new Date(ts).getTime();
    const lastTime = new Date(this._lastAcceptedTimestamp).getTime();

    if (eventTime < lastTime) {
      return {
        inOrder: false,
        reason: 'timestamp_not_increasing',
        lastAccepted: this._lastAcceptedTimestamp,
        received: ts,
      };
    }

    return { inOrder: true };
  }

  /**
   * Handle out-of-order event (SSRK-154)
   */
  _handleOutOfOrder(envelope, reason) {
    this._stats.totalDropped++;

    // Track by type
    const type = envelope.type || 'unknown';
    this._stats.outOfOrderByType[type] = (this._stats.outOfOrderByType[type] || 0) + 1;

    if (this._debug) {
      console.log(`[ORDERING] Out-of-order: ${envelope.event_id} (${reason})`);
    }

    // Fire callback (SSRK-154)
    if (this.outOfOrderPolicy === OutOfOrderPolicy.DROP_WITH_CALLBACK && this.onOutOfOrder) {
      this.onOutOfOrder({
        event_id: envelope.event_id,
        type: envelope.type,
        sequence: envelope.sequence,
        ts: envelope.ts,
        reason,
        lastAcceptedSequence: this._lastAcceptedSequence,
        lastAcceptedEventId: this._lastAcceptedEventId,
      });
    }

    // Accept policy - still process but log
    if (this.outOfOrderPolicy === OutOfOrderPolicy.ACCEPT) {
      this._updateMarkers(envelope);
      this._stats.totalAccepted++;
      this._stats.totalDropped--; // Undo the drop count
      return { accept: true, reason: 'accepted_out_of_order' };
    }

    return { accept: false, reason };
  }

  /**
   * Update last accepted markers (SSRK-153)
   */
  _updateMarkers(envelope) {
    if (envelope.sequence !== undefined && envelope.sequence !== null) {
      this._lastAcceptedSequence = envelope.sequence;
    }

    if (envelope.event_id) {
      this._lastAcceptedEventId = envelope.event_id;
    }

    if (envelope.ts !== undefined && envelope.ts !== null) {
      this._lastAcceptedTimestamp = envelope.ts;
    }
  }

  /**
   * Reset markers (for reconnect/fresh start)
   */
  reset() {
    this._lastAcceptedSequence = null;
    this._lastAcceptedEventId = null;
    this._lastAcceptedTimestamp = null;

    if (this._debug) {
      console.log(`[ORDERING] Markers reset`);
    }
  }

  /**
   * Get last accepted sequence
   */
  get lastAcceptedSequence() {
    return this._lastAcceptedSequence;
  }

  /**
   * Get last accepted event ID
   */
  get lastAcceptedEventId() {
    return this._lastAcceptedEventId;
  }

  /**
   * Get last accepted timestamp
   */
  get lastAcceptedTimestamp() {
    return this._lastAcceptedTimestamp;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      orderingRule: this.orderingRule,
      outOfOrderPolicy: this.outOfOrderPolicy,
      lastAcceptedSequence: this._lastAcceptedSequence,
      lastAcceptedEventId: this._lastAcceptedEventId,
      lastAcceptedTimestamp: this._lastAcceptedTimestamp,
      ...this._stats,
    };
  }

  /**
   * Enable/disable debug
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

/**
 * Create an ordering guard
 */
export function createOrderingGuard(options) {
  return new OrderingGuard(options);
}

export default OrderingGuard;
