import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  sse: {
    heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL, 10) || 30000,
    retryTimeout: parseInt(process.env.SSE_RETRY_TIMEOUT, 10) || 3000,
  },
};
