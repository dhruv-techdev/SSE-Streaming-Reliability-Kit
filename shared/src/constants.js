/**
 * SSE Protocol Constants (SSRK-114, SSRK-121, SSRK-140)
 */

// Default configuration values
export const Defaults = {
  // Heartbeat interval - keep connection alive
  HEARTBEAT_INTERVAL_MS: 30000,
  
  // Client timeout - should be > heartbeat interval
  CLIENT_TIMEOUT_MS: 45000,
  
  // Liveness timeout - detect missed heartbeats
  LIVENESS_TIMEOUT_MS: 45000,
  
  // Grace period before starting liveness checks
  LIVENESS_GRACE_PERIOD_MS: 5000,
  
  // Client retry interval suggestion
  RETRY_INTERVAL_MS: 3000,
  
  // Max retry attempts
  MAX_RETRY_ATTEMPTS: 10,
  
  // Max events to buffer for replay
  MAX_REPLAY_EVENTS: 1000,
};

// Environment variable names for configuration
export const ConfigKeys = {
  HEARTBEAT_INTERVAL_MS: 'SSE_HEARTBEAT_INTERVAL',
  LIVENESS_TIMEOUT_MS: 'SSE_LIVENESS_TIMEOUT',
  CLIENT_TIMEOUT_MS: 'SSE_CLIENT_TIMEOUT',
  RETRY_INTERVAL_MS: 'SSE_RETRY_TIMEOUT',
  MAX_CONNECTIONS: 'MAX_CONNECTIONS',
};

// Required response headers for SSE
export const SSEHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * Disconnect/Error Reason Taxonomy
 */
export const DisconnectReason = {
  // Client-initiated
  CLIENT_CLOSE: 'client_close',
  CLIENT_ABORT: 'client_abort',
  CLIENT_TIMEOUT: 'client_timeout',
  
  // Server-initiated
  SERVER_SHUTDOWN: 'server_shutdown',
  SERVER_RESTART: 'server_restart',
  SERVER_ERROR: 'server_error',
  
  // Connection issues
  IDLE_TIMEOUT: 'idle_timeout',
  NETWORK_ERROR: 'network_error',
  
  // Liveness detection
  HEARTBEAT_MISSED: 'heartbeat_missed',
  LIVENESS_TIMEOUT: 'liveness_timeout',
  
  // Policy/limits
  OVERLOAD_REJECT: 'overload_reject',
  RATE_LIMITED: 'rate_limited',
  AUTH_EXPIRED: 'auth_expired',
  STREAM_ENDED: 'stream_ended',
  
  // Data issues
  PARSE_ERROR: 'parse_error',
  INVALID_EVENT: 'invalid_event',
};

/**
 * Cannot Resume Reasons (SSRK-140)
 * Documented conditions when resume is not possible
 */
export const CannotResumeReason = {
  // Event ID not found in buffer (expired/evicted)
  EVENT_NOT_FOUND: 'event_not_found',
  
  // Buffer has been cleared or reset
  BUFFER_EXPIRED: 'buffer_expired',
  
  // Replay would exceed max batch size and truncation not allowed
  REPLAY_TOO_LARGE: 'replay_too_large',
  
  // Server does not support resume functionality
  RESUME_DISABLED: 'resume_disabled',
  
  // Event ID format is invalid
  INVALID_EVENT_ID: 'invalid_event_id',
  
  // Stream/channel no longer exists
  STREAM_NOT_FOUND: 'stream_not_found',
  
  // Client requested resume but server has no buffer
  NO_BUFFER: 'no_buffer',
};

/**
 * Client Connection States
 */
export const ClientState = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  RETRYING: 'retrying',
  CLOSED: 'closed',
};

/**
 * Server Stream States
 */
export const ServerStreamState = {
  INITIALIZING: 'initializing',
  STREAMING: 'streaming',
  PAUSED: 'paused',
  DRAINING: 'draining',
  CLOSED: 'closed',
};
