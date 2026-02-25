import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * JSON Schema for Event Envelope (SSRK-55)
 */
export const eventEnvelopeSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://sse-streaming-reliability-kit/event-envelope.json',
  title: 'SSE Event Envelope',
  description: 'Standard envelope for all SSE events',
  type: 'object',
  required: ['event_id', 'type', 'ts', 'payload'],
  properties: {
    event_id: {
      type: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'UUIDv7 format identifier',
    },
    type: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)*$',
      description: 'Event type in dot-notation (e.g., system.heartbeat, domain.user.created)',
    },
    ts: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp',
    },
    payload: {
      type: 'object',
      description: 'Event data',
    },
    stream_id: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Optional stream/channel identifier',
    },
    correlation_id: {
      type: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      description: 'Optional UUID to link related events',
    },
    sequence: {
      type: 'integer',
      minimum: 0,
      description: 'Optional monotonic counter within a stream',
    },
    retry: {
      type: 'integer',
      minimum: 0,
      maximum: 300000,
      description: 'Optional client retry interval in milliseconds',
    },
  },
  additionalProperties: false,
};

// Create validator instance
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateEnvelope = ajv.compile(eventEnvelopeSchema);

/**
 * Validates an event envelope against the schema
 * @param {Object} event - Event to validate
 * @returns {{ valid: boolean, errors: Array|null }}
 */
export function validateEvent(event) {
  const valid = validateEnvelope(event);
  return {
    valid,
    errors: valid ? null : validateEnvelope.errors,
  };
}
