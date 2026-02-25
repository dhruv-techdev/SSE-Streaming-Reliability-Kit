import { generateEventId, isValidEventId } from './event-id.js';
import { validateEvent } from './schema.js';
import { ReservedEventTypes } from './types.js';

/**
 * Creates a new event envelope
 * @param {string} type - Event type
 * @param {Object} payload - Event payload
 * @param {Object} [options] - Optional fields
 * @returns {Object} Event envelope
 */
export function createEnvelope(type, payload = {}, options = {}) {
  const envelope = {
    event_id: options.event_id || generateEventId(),
    type,
    ts: options.ts || new Date().toISOString(),
    payload,
  };

  if (options.stream_id) envelope.stream_id = options.stream_id;
  if (options.correlation_id) envelope.correlation_id = options.correlation_id;
  if (options.sequence !== undefined) envelope.sequence = options.sequence;
  if (options.retry !== undefined) envelope.retry = options.retry;

  return envelope;
}

/**
 * Creates a heartbeat event (SSRK-113)
 * 
 * Heartbeat envelope includes:
 * - type: 'system.heartbeat'
 * - payload: { server_time, interval_ms, connection_id }
 * 
 * @param {Object} [options] - Optional fields
 * @param {number} [options.interval_ms] - Current heartbeat interval
 * @param {string} [options.connection_id] - Connection identifier
 * @returns {Object} Heartbeat event envelope
 */
export function createHeartbeat(options = {}) {
  const payload = {
    server_time: new Date().toISOString(),
  };
  
  // Include interval if provided (informational for client)
  if (options.interval_ms !== undefined) {
    payload.interval_ms = options.interval_ms;
  }
  
  // Include connection_id if provided
  if (options.connection_id) {
    payload.connection_id = options.connection_id;
  }

  return createEnvelope(ReservedEventTypes.HEARTBEAT, payload, options);
}

/**
 * Creates an error event
 * @param {string} message - Error message
 * @param {string} [code] - Error code
 * @param {Object} [options] - Optional fields
 * @returns {Object} Error event envelope
 */
export function createError(message, code = 'UNKNOWN_ERROR', options = {}) {
  return createEnvelope(ReservedEventTypes.ERROR, { message, code }, options);
}

/**
 * Creates a control event
 * @param {string} controlType - Control event type (open, close, reconnect)
 * @param {Object} [payload] - Optional payload
 * @param {Object} [options] - Optional fields
 * @returns {Object} Control event envelope
 */
export function createControl(controlType, payload = {}, options = {}) {
  const typeMap = {
    open: ReservedEventTypes.CONTROL_OPEN,
    close: ReservedEventTypes.CONTROL_CLOSE,
    reconnect: ReservedEventTypes.CONTROL_RECONNECT,
  };
  const type = typeMap[controlType] || `control.${controlType}`;
  return createEnvelope(type, payload, options);
}

/**
 * Creates a domain event
 * @param {string} entity - Domain entity (e.g., 'user', 'order')
 * @param {string} action - Action (e.g., 'created', 'updated')
 * @param {Object} payload - Event payload
 * @param {Object} [options] - Optional fields
 * @returns {Object} Domain event envelope
 */
export function createDomainEvent(entity, action, payload, options = {}) {
  const type = `domain.${entity}.${action}`;
  return createEnvelope(type, payload, options);
}

/**
 * Encodes an envelope to SSE format
 * @param {Object} envelope - Event envelope
 * @returns {string} SSE formatted string
 */
export function encodeSSE(envelope) {
  const lines = [];
  
  lines.push(`id: ${envelope.event_id}`);
  lines.push(`event: ${envelope.type}`);
  
  if (envelope.retry !== undefined) {
    lines.push(`retry: ${envelope.retry}`);
  }
  
  lines.push(`data: ${JSON.stringify(envelope)}`);
  
  return lines.join('\n') + '\n\n';
}

/**
 * Decodes SSE data field to envelope
 * @param {string} data - JSON string from SSE data field
 * @returns {{ envelope: Object|null, error: string|null }}
 */
export function decodeSSE(data) {
  try {
    const envelope = JSON.parse(data);
    const validation = validateEvent(envelope);
    
    if (!validation.valid) {
      return {
        envelope: null,
        error: `Invalid envelope: ${JSON.stringify(validation.errors)}`,
      };
    }
    
    return { envelope, error: null };
  } catch (err) {
    return { envelope: null, error: `Parse error: ${err.message}` };
  }
}

/**
 * Parses raw SSE text into structured event
 * @param {string} raw - Raw SSE text chunk
 * @returns {{ id: string|null, event: string|null, data: string|null, retry: number|null }}
 */
export function parseSSEChunk(raw) {
  const result = { id: null, event: null, data: null, retry: null };
  
  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.startsWith('id: ')) {
      result.id = line.slice(4);
    } else if (line.startsWith('event: ')) {
      result.event = line.slice(7);
    } else if (line.startsWith('data: ')) {
      result.data = line.slice(6);
    } else if (line.startsWith('retry: ')) {
      result.retry = parseInt(line.slice(7), 10);
    }
  }
  
  return result;
}
