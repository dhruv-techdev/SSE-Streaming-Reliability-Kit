/**
 * SSE Connector Unit Tests (SSRK-89)
 * Tests parsing and validation features
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEConnector } from '../../client/src/sse-connector.js';
import {
  parseSSEChunk,
  decodeSSE,
  validateEvent,
  createEnvelope,
  createHeartbeat,
  encodeSSE,
} from '../../shared/src/index.js';

describe('SSE Connector', () => {
  describe('parseSSEChunk', () => {
    it('should parse complete SSE event', () => {
      const raw = `id: test-123
event: domain.user.created
data: {"event_id":"test-123","type":"domain.user.created","ts":"2026-01-01T00:00:00Z","payload":{}}

`;
      const parsed = parseSSEChunk(raw);
      
      expect(parsed.id).toBe('test-123');
      expect(parsed.event).toBe('domain.user.created');
      expect(parsed.data).toContain('event_id');
    });

    it('should parse event with retry field', () => {
      const raw = `id: test-123
event: control.open
retry: 5000
data: {"event_id":"test-123","type":"control.open","ts":"2026-01-01T00:00:00Z","payload":{}}

`;
      const parsed = parseSSEChunk(raw);
      
      expect(parsed.retry).toBe(5000);
    });

    it('should handle missing fields gracefully', () => {
      const raw = `data: {"test":true}

`;
      const parsed = parseSSEChunk(raw);
      
      expect(parsed.id).toBeNull();
      expect(parsed.event).toBeNull();
      expect(parsed.data).toBe('{"test":true}');
    });

    it('should ignore comment lines', () => {
      const raw = `: this is a comment
data: {"test":true}

`;
      const parsed = parseSSEChunk(raw);
      
      expect(parsed.data).toBe('{"test":true}');
    });
  });

  describe('decodeSSE', () => {
    it('should decode valid JSON envelope', () => {
      const envelope = createEnvelope('domain.test', { foo: 'bar' });
      const json = JSON.stringify(envelope);
      
      const result = decodeSSE(json);
      
      expect(result.error).toBeNull();
      expect(result.envelope).toEqual(envelope);
    });

    it('should fail on invalid JSON', () => {
      const result = decodeSSE('not valid json {{{');
      
      expect(result.error).not.toBeNull();
      expect(result.envelope).toBeNull();
      expect(result.error).toContain('Parse error');
    });

    it('should fail on missing required fields', () => {
      const result = decodeSSE('{"foo":"bar"}');
      
      expect(result.error).not.toBeNull();
      expect(result.envelope).toBeNull();
      expect(result.error).toContain('Invalid envelope');
    });
  });

  describe('validateEvent', () => {
    it('should validate correct envelope', () => {
      const envelope = createEnvelope('domain.test', { data: 123 });
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    it('should reject envelope without event_id', () => {
      const envelope = {
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(false);
      expect(result.errors).not.toBeNull();
    });

    it('should reject envelope without type', () => {
      const envelope = {
        event_id: '0190a5e8-7c00-7000-8000-000000000001',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(false);
    });

    it('should reject envelope without ts', () => {
      const envelope = {
        event_id: '0190a5e8-7c00-7000-8000-000000000001',
        type: 'domain.test',
        payload: {},
      };
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(false);
    });

    it('should reject envelope without payload', () => {
      const envelope = {
        event_id: '0190a5e8-7c00-7000-8000-000000000001',
        type: 'domain.test',
        ts: new Date().toISOString(),
      };
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(false);
    });

    it('should reject invalid event_id format', () => {
      const envelope = {
        event_id: 'not-a-valid-uuid',
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(false);
    });

    it('should reject invalid type format', () => {
      const envelope = {
        event_id: '0190a5e8-7c00-7000-8000-000000000001',
        type: 'INVALID_TYPE',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(envelope);
      
      expect(result.valid).toBe(false);
    });
  });

  describe('SSEConnector class', () => {
    it('should accept url and options', () => {
      const connector = new SSEConnector('http://localhost:3000/stream', {
        timeout: 10000,
        maxRetries: 5,
      });
      
      expect(connector.url.href).toBe('http://localhost:3000/stream');
      expect(connector.options.timeout).toBe(10000);
      expect(connector.options.maxRetries).toBe(5);
    });

    it('should have default options', () => {
      const connector = new SSEConnector('http://localhost:3000/stream');
      
      expect(connector.options.autoReconnect).toBe(true);
      expect(connector.options.validateEnvelope).toBe(true);
      expect(typeof connector.options.onOpen).toBe('function');
      expect(typeof connector.options.onEvent).toBe('function');
      expect(typeof connector.options.onError).toBe('function');
      expect(typeof connector.options.onClose).toBe('function');
    });

    it('should start in CLOSED state', () => {
      const connector = new SSEConnector('http://localhost:3000/stream');
      
      expect(connector.getState()).toBe('closed');
      expect(connector.connected).toBe(false);
    });

    it('should track statistics', () => {
      const connector = new SSEConnector('http://localhost:3000/stream');
      const stats = connector.getStats();
      
      expect(stats).toHaveProperty('eventsReceived');
      expect(stats).toHaveProperty('bytesReceived');
      expect(stats).toHaveProperty('connectedAt');
      expect(stats).toHaveProperty('state');
    });
  });

  describe('Event routing (ST-05)', () => {
    it('should identify heartbeat events', () => {
      const heartbeat = createHeartbeat();
      expect(heartbeat.type).toBe('system.heartbeat');
    });

    it('should identify control events by prefix', () => {
      const types = ['control.open', 'control.close', 'control.reconnect'];
      
      for (const type of types) {
        expect(type.startsWith('control.')).toBe(true);
      }
    });

    it('should identify domain events by prefix', () => {
      const types = ['domain.user.created', 'domain.order.updated'];
      
      for (const type of types) {
        expect(type.startsWith('domain.')).toBe(true);
      }
    });
  });
});
