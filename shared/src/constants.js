/**
 * SSE Protocol Constants (SSRK-114, SSRK-121)
 */

// Default configuration values
export const Defaults = {
  // Heartbeat interval - keep connection alive
  // Safe default for most proxies (NGINX default timeout is 60s)
  HEARTBEAT_INTERVAL_MS: 30000,
  
  // Client timeout - should be > heartbeat interval
  CLIENT_TIMEOUT_MS: 45000,
  
  // Liveness timeout - detect missed heartbeats (SSRK-121)
  // Should be slightly > heartbeat interval to allow for network jitter
  // Default: heartbeat interval + 15 second grace period
  LIVENESS_TIMEOUT_MS: 45000,
  
  // Grace period before starting liveness checks (SSRK-124)
  // Prevents false positives on startup
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
  
  // Liveness detection (SSRK-123)
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
