import { describe, it, expect } from 'vitest';
import {
  createEnvelope,
  createHeartbeat,
  createError,
  createDomainEvent,
  encodeSSE,
  decodeSSE,
  validateEvent,
  isValidEventId,
  generateEventId,
  ReservedEventTypes,
} from '../../shared/src/index.js';

describe('Event Envelope Schema', () => {
  describe('Valid Events', () => {
    it('should validate a minimal valid event', () => {
      const event = createEnvelope('domain.test', {});
      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    it('should validate event with all optional fields', () => {
      const event = createEnvelope('domain.user.created', { userId: '123' }, {
        stream_id: 'users',
        correlation_id: '550e8400-e29b-41d4-a716-446655440000',
        sequence: 42,
        retry: 3000,
      });
      const result = validateEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should validate heartbeat event', () => {
      const event = createHeartbeat();
      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(event.type).toBe(ReservedEventTypes.HEARTBEAT);
    });

    it('should validate error event', () => {
      const event = createError('Something went wrong', 'TEST_ERROR');
      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(event.payload.message).toBe('Something went wrong');
      expect(event.payload.code).toBe('TEST_ERROR');
    });

    it('should validate domain event', () => {
      const event = createDomainEvent('user', 'created', { id: '123' });
      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(event.type).toBe('domain.user.created');
    });
  });

  describe('Invalid Events - Missing Required Fields', () => {
    it('should fail when event_id is missing', () => {
      const event = {
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).not.toBeNull();
    });

    it('should fail when type is missing', () => {
      const event = {
        event_id: generateEventId(),
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should fail when ts is missing', () => {
      const event = {
        event_id: generateEventId(),
        type: 'domain.test',
        payload: {},
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should fail when payload is missing', () => {
      const event = {
        event_id: generateEventId(),
        type: 'domain.test',
        ts: new Date().toISOString(),
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });
  });

  describe('Invalid Events - Wrong Types', () => {
    it('should fail with invalid event_id format', () => {
      const event = {
        event_id: 'not-a-valid-uuid',
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should fail with invalid type format (uppercase)', () => {
      const event = {
        event_id: generateEventId(),
        type: 'Domain.Test',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should fail with invalid type format (spaces)', () => {
      const event = {
        event_id: generateEventId(),
        type: 'domain test',
        ts: new Date().toISOString(),
        payload: {},
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should fail with non-object payload', () => {
      const event = {
        event_id: generateEventId(),
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: 'string payload',
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should fail with additional unknown properties', () => {
      const event = {
        event_id: generateEventId(),
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
        unknown_field: 'should not be here',
      };
      const result = validateEvent(event);
      expect(result.valid).toBe(false);
    });
  });

  describe('Event ID Generation', () => {
    it('should generate valid UUIDv7', () => {
      const id = generateEventId();
      expect(isValidEventId(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateEventId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should generate sortable IDs', async () => {
      const id1 = generateEventId();
      await new Promise((r) => setTimeout(r, 2));
      const id2 = generateEventId();
      expect(id1 < id2).toBe(true);
    });
  });

  describe('SSE Encoding/Decoding', () => {
    it('should encode event to SSE format', () => {
      const event = createEnvelope('domain.test', { foo: 'bar' });
      const sse = encodeSSE(event);
      
      expect(sse).toContain(`id: ${event.event_id}`);
      expect(sse).toContain('event: domain.test');
      expect(sse).toContain('data: ');
      expect(sse).toContain('"foo":"bar"');
      expect(sse.endsWith('\n\n')).toBe(true);
    });

    it('should include retry in SSE if specified', () => {
      const event = createEnvelope('domain.test', {}, { retry: 5000 });
      const sse = encodeSSE(event);
      expect(sse).toContain('retry: 5000');
    });

    it('should decode valid SSE data', () => {
      const event = createEnvelope('domain.test', { foo: 'bar' });
      const json = JSON.stringify(event);
      const result = decodeSSE(json);
      
      expect(result.error).toBeNull();
      expect(result.envelope).toEqual(event);
    });

    it('should fail decoding invalid JSON', () => {
      const result = decodeSSE('not valid json');
      expect(result.error).not.toBeNull();
      expect(result.envelope).toBeNull();
    });

    it('should fail decoding invalid envelope', () => {
      const result = decodeSSE('{"invalid": "envelope"}');
      expect(result.error).not.toBeNull();
      expect(result.envelope).toBeNull();
    });
  });
});
