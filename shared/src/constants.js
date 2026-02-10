/**
 * SSE Protocol Constants
 */

// Default configuration values
export const Defaults = {
  HEARTBEAT_INTERVAL_MS: 30000,
  CLIENT_TIMEOUT_MS: 45000,
  RETRY_INTERVAL_MS: 3000,
  MAX_RETRY_ATTEMPTS: 10,
  MAX_REPLAY_EVENTS: 1000,
};

// Required response headers for SSE
export const SSEHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable NGINX buffering
};

/**
 * Disconnect/Error Reason Taxonomy (SSRK-64)
 * Used for observability and debugging
 */
export const DisconnectReason = {
  // Client-initiated
  CLIENT_CLOSE: 'client_close',           // Client called close()
  CLIENT_ABORT: 'client_abort',           // Client navigated away
  CLIENT_TIMEOUT: 'client_timeout',       // Client didn't receive data in time
  
  // Server-initiated
  SERVER_SHUTDOWN: 'server_shutdown',     // Graceful server shutdown
  SERVER_RESTART: 'server_restart',       // Server restarting
  SERVER_ERROR: 'server_error',           // Unhandled server error
  
  // Connection issues
  IDLE_TIMEOUT: 'idle_timeout',           // No activity for too long
  NETWORK_ERROR: 'network_error',         // Network failure
  
  // Policy/limits
  OVERLOAD_REJECT: 'overload_reject',     // Server too busy
  RATE_LIMITED: 'rate_limited',           // Too many requests
  AUTH_EXPIRED: 'auth_expired',           // Authentication expired
  STREAM_ENDED: 'stream_ended',           // Stream completed normally
  
  // Data issues
  PARSE_ERROR: 'parse_error',             // Malformed data
  INVALID_EVENT: 'invalid_event',         // Event validation failed
};

/**
 * Client Connection States (SSRK-65)
 */
export const ClientState = {
  CONNECTING: 'connecting',   // Initial connection attempt
  OPEN: 'open',               // Connected and receiving events
  RETRYING: 'retrying',       // Disconnected, attempting reconnect
  CLOSED: 'closed',           // Permanently closed
};

/**
 * Server Stream States (SSRK-65)
 */
export const ServerStreamState = {
  INITIALIZING: 'initializing', // Setting up stream
  STREAMING: 'streaming',       // Actively sending events
  PAUSED: 'paused',             // Temporarily paused (backpressure)
  DRAINING: 'draining',         // Sending final events before close
  CLOSED: 'closed',             // Stream ended
};
