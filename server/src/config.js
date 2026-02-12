/**
 * Server Configuration (SSRK-73)
 * Reads from .env with sensible defaults
 */
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server settings
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',

  // SSE settings
  sse: {
    tickInterval: parseInt(process.env.SSE_TICK_INTERVAL, 10) || 2000,
    heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL, 10) || 30000,
    retryTimeout: parseInt(process.env.SSE_RETRY_TIMEOUT, 10) || 3000,
    maxBufferSize: parseInt(process.env.SSE_MAX_BUFFER_SIZE, 10) || 1000,
  },

  // Connection limits (ST-06)
  connections: {
    maxConcurrent: parseInt(process.env.MAX_CONNECTIONS, 10) || 1000,
  },

  // Shutdown settings (ST-05)
  shutdown: {
    gracePeriodMs: parseInt(process.env.SHUTDOWN_GRACE_PERIOD, 10) || 5000,
  },

  // Logging
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Log config in development
if (config.nodeEnv === 'development') {
  console.log('Server config:', JSON.stringify(config, null, 2));
}
