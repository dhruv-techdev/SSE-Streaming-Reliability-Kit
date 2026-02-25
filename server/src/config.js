/**
 * Server Configuration (SSRK-114)
 * Reads from .env with sensible defaults
 */
import dotenv from 'dotenv';
import { Defaults } from '../../shared/src/index.js';

dotenv.config();

export const config = {
  // Server settings
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',

  // SSE settings
  sse: {
    // Tick interval for demo events (ms)
    tickInterval: parseInt(process.env.SSE_TICK_INTERVAL, 10) || 2000,
    
    // Heartbeat interval - keep connection alive (SSRK-114)
    // Safe default for most proxies (NGINX default timeout is 60s)
    // Can be tuned per environment via SSE_HEARTBEAT_INTERVAL
    heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL, 10) || Defaults.HEARTBEAT_INTERVAL_MS,
    
    // Client retry timeout suggestion (ms)
    retryTimeout: parseInt(process.env.SSE_RETRY_TIMEOUT, 10) || Defaults.RETRY_INTERVAL_MS,
    
    // Maximum events to buffer for replay
    maxBufferSize: parseInt(process.env.SSE_MAX_BUFFER_SIZE, 10) || Defaults.MAX_REPLAY_EVENTS,
  },

  // Connection limits
  connections: {
    maxConcurrent: parseInt(process.env.MAX_CONNECTIONS, 10) || 1000,
  },

  // Shutdown settings
  shutdown: {
    gracePeriodMs: parseInt(process.env.SHUTDOWN_GRACE_PERIOD, 10) || 5000,
  },

  // Logging
  log: {
    level: process.env.LOG_LEVEL || 'info',
    heartbeats: process.env.LOG_HEARTBEATS === 'true', // SSRK-118
  },
};

// Log config in development
if (config.nodeEnv === 'development') {
  console.log('Server config:', JSON.stringify(config, null, 2));
}
