// Types and constants
export { 
  ReservedEventTypes, 
  RESERVED_PREFIXES, 
  isDomainEventType,
  isHeartbeatEvent,
  HeartbeatPayloadSchema,
} from './types.js';

// Protocol constants
export {
  Defaults,
  ConfigKeys,
  SSEHeaders,
  DisconnectReason,
  CannotResumeReason,
  ClientState,
  ServerStreamState,
} from './constants.js';

// Event ID generation
export { generateEventId, extractTimestamp, isValidEventId } from './event-id.js';

// Schema and validation
export { eventEnvelopeSchema, validateEvent } from './schema.js';

// Envelope helpers
export {
  createEnvelope,
  createHeartbeat,
  createError,
  createControl,
  createDomainEvent,
  encodeSSE,
  decodeSSE,
  parseSSEChunk,
} from './envelope.js';

// Structured logging (SSRK-174)
export {
  Logger,
  createLogger,
  LogLevel,
  LogComponent,
  LogEvent,
} from './logger.js';
