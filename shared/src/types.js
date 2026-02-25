/**
 * SSE Event Envelope Schema
 * 
 * REQUIRED FIELDS:
 * - event_id: Unique identifier for the event (UUIDv7 format)
 * - type: Event type (string, lowercase, dot-notation for domain events)
 * - ts: ISO 8601 timestamp when event was created
 * - payload: Event data (object, can be empty {})
 * 
 * OPTIONAL FIELDS:
 * - stream_id: Identifies the stream/channel
 * - correlation_id: Links related events together
 * - sequence: Monotonic counter within a stream
 * - retry: Client retry interval in ms
 */

// Reserved event types (SSRK-57, SSRK-113)
export const ReservedEventTypes = {
  HEARTBEAT: 'system.heartbeat',
  CONTROL_OPEN: 'control.open',
  CONTROL_CLOSE: 'control.close',
  CONTROL_RECONNECT: 'control.reconnect',
  ERROR: 'system.error',
  ACK: 'system.ack',
};

// List of all reserved prefixes - domain events cannot use these
export const RESERVED_PREFIXES = ['system.', 'control.'];

/**
 * Heartbeat event payload schema (SSRK-113)
 * 
 * The heartbeat event is used to:
 * 1. Keep connections alive through proxies/load balancers
 * 2. Allow clients to detect connection liveness
 * 
 * Payload fields (all optional):
 * - server_time: Server timestamp for clock sync
 * - interval_ms: Current heartbeat interval (informational)
 * - connection_id: Server's identifier for this connection
 */
export const HeartbeatPayloadSchema = {
  server_time: 'string (ISO 8601)',
  interval_ms: 'number',
  connection_id: 'string',
};

/**
 * Validates that a type is not using reserved prefixes
 * Domain events should use: domain.<entity>.<action>
 * Example: domain.user.created, domain.order.updated
 */
export function isDomainEventType(type) {
  return !RESERVED_PREFIXES.some(prefix => type.startsWith(prefix));
}

/**
 * Check if event type is a heartbeat
 */
export function isHeartbeatEvent(type) {
  return type === ReservedEventTypes.HEARTBEAT;
}

/**
 * @typedef {Object} HeartbeatPayload
 * @property {string} [server_time] - Server timestamp (ISO 8601)
 * @property {number} [interval_ms] - Heartbeat interval in ms
 * @property {string} [connection_id] - Connection identifier
 */

/**
 * @typedef {Object} EventEnvelope
 * @property {string} event_id - UUIDv7 format identifier
 * @property {string} type - Event type
 * @property {string} ts - ISO 8601 timestamp
 * @property {Object} payload - Event data
 * @property {string} [stream_id] - Stream identifier
 * @property {string} [correlation_id] - Correlation identifier
 * @property {number} [sequence] - Monotonic sequence number
 * @property {number} [retry] - Retry interval in ms
 */
