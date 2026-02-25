import { describe, it, expect } from 'vitest';
import {
  SSEHeaders,
  Defaults,
  DisconnectReason,
  ClientState,
  ServerStreamState,
  createHeartbeat,
  createControl,
  createError,
  encodeSSE,
  validateEvent,
} from '../../shared/src/index.js';

describe('SSE Protocol Compliance', () => {
  describe('ST-01: Endpoint Contract', () => {
    it('should have required SSE headers defined', () => {
      expect(SSEHeaders['Content-Type']).toBe('text/event-stream');
      expect(SSEHeaders['Cache-Control']).toBe('no-cache');
      expect(SSEHeaders['Connection']).toBe('keep-alive');
      expect(SSEHeaders['X-Accel-Buffering']).toBe('no');
    });

    it('should encode event with id, event, and data fields', () => {
      const event = createControl('open', { test: true });
      const sse = encodeSSE(event);
      
      expect(sse).toContain('id: ');
      expect(sse).toContain('event: control.open');
      expect(sse).toContain('data: ');
    });

    it('should include retry field when specified', () => {
      const event = createControl('open', {}, { retry: 5000 });
      const sse = encodeSSE(event);
      
      expect(sse).toContain('retry: 5000');
    });
  });

  describe('ST-03: Heartbeat Behavior', () => {
    it('should have default heartbeat interval of 30 seconds', () => {
      expect(Defaults.HEARTBEAT_INTERVAL_MS).toBe(30000);
    });

    it('should have client timeout greater than heartbeat interval', () => {
      expect(Defaults.CLIENT_TIMEOUT_MS).toBeGreaterThan(Defaults.HEARTBEAT_INTERVAL_MS);
    });

    it('should create valid heartbeat event', () => {
      const heartbeat = createHeartbeat();
      const result = validateEvent(heartbeat);
      
      expect(result.valid).toBe(true);
      expect(heartbeat.type).toBe('system.heartbeat');
      expect(heartbeat.payload).toHaveProperty('server_time');
    });
  });

  describe('ST-04: Resume Semantics', () => {
    it('should have max replay events limit defined', () => {
      expect(Defaults.MAX_REPLAY_EVENTS).toBe(1000);
    });

    it('should create valid reconnect control event', () => {
      const reconnect = createControl('reconnect', {
        reason: 'events_expired',
        resume_from: 'event-123',
      });
      const result = validateEvent(reconnect);
      
      expect(result.valid).toBe(true);
      expect(reconnect.type).toBe('control.reconnect');
    });
  });

  describe('ST-05: Disconnect/Error Taxonomy', () => {
    it('should define all disconnect reasons', () => {
      expect(DisconnectReason.CLIENT_CLOSE).toBe('client_close');
      expect(DisconnectReason.CLIENT_ABORT).toBe('client_abort');
      expect(DisconnectReason.CLIENT_TIMEOUT).toBe('client_timeout');
      expect(DisconnectReason.SERVER_SHUTDOWN).toBe('server_shutdown');
      expect(DisconnectReason.SERVER_ERROR).toBe('server_error');
      expect(DisconnectReason.IDLE_TIMEOUT).toBe('idle_timeout');
      expect(DisconnectReason.NETWORK_ERROR).toBe('network_error');
      expect(DisconnectReason.OVERLOAD_REJECT).toBe('overload_reject');
      expect(DisconnectReason.RATE_LIMITED).toBe('rate_limited');
      expect(DisconnectReason.PARSE_ERROR).toBe('parse_error');
    });

    it('should create valid error event with taxonomy code', () => {
      const error = createError('Too many requests', DisconnectReason.RATE_LIMITED);
      const result = validateEvent(error);
      
      expect(result.valid).toBe(true);
      expect(error.payload.code).toBe('rate_limited');
    });
  });

  describe('ST-06: State Machines', () => {
    it('should define all client states', () => {
      expect(ClientState.CONNECTING).toBe('connecting');
      expect(ClientState.OPEN).toBe('open');
      expect(ClientState.RETRYING).toBe('retrying');
      expect(ClientState.CLOSED).toBe('closed');
    });

    it('should define all server stream states', () => {
      expect(ServerStreamState.INITIALIZING).toBe('initializing');
      expect(ServerStreamState.STREAMING).toBe('streaming');
      expect(ServerStreamState.PAUSED).toBe('paused');
      expect(ServerStreamState.DRAINING).toBe('draining');
      expect(ServerStreamState.CLOSED).toBe('closed');
    });
  });

  describe('Default Configuration', () => {
    it('should have sensible defaults', () => {
      expect(Defaults.HEARTBEAT_INTERVAL_MS).toBe(30000);
      expect(Defaults.CLIENT_TIMEOUT_MS).toBe(45000);
      expect(Defaults.RETRY_INTERVAL_MS).toBe(3000);
      expect(Defaults.MAX_RETRY_ATTEMPTS).toBe(10);
      expect(Defaults.MAX_REPLAY_EVENTS).toBe(1000);
    });
  });
});
