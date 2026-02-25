/**
 * SSE Protocol Constants (SSRK-114)
 */

// Default configuration values
export const Defaults = {
  // Heartbeat interval - keep connection alive (SSRK-114)
  // Safe default for most proxies (NGINX default timeout is 60s)
  HEARTBEAT_INTERVAL_MS: 30000,
  
  // Client timeout - should be > heartbeat interval
  CLIENT_TIMEOUT_MS: 45000,
  
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
  CLIENT_TIMEOUT_MS: 'SSE_CLIENT_TIMEOUT',
  RETRY_INTERVAL_MS: 'SSE_RETRY_TIMEOUT',
  MAX_CONNECTIONS: 'MAX_CONNECTIONS',
};

// Required response headers for SSE (SSRK-117)
export const SSEHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable NGINX buffering
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
