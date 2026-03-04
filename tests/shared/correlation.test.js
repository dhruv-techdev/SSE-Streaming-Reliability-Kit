/**
 * Correlation ID Tests (SSRK-190)
 */
import { describe, it, expect } from 'vitest';
import {
  generateStreamId,
  isValidStreamId,
  isValidTraceId,
  extractTraceId,
  CorrelationContext,
  createCorrelationContext,
} from '../../shared/src/correlation.js';

describe('Correlation IDs (SSRK-183)', () => {
  describe('generateStreamId (SSRK-184)', () => {
    it('should generate unique stream IDs', () => {
      const id1 = generateStreamId();
      const id2 = generateStreamId();

      expect(id1).not.toBe(id2);
    });

    it('should generate valid format', () => {
      const id = generateStreamId();

      expect(id).toMatch(/^stream-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('isValidStreamId', () => {
    it('should validate correct stream IDs', () => {
      expect(isValidStreamId('stream-abc123-xyz789')).toBe(true);
      expect(isValidStreamId(generateStreamId())).toBe(true);
    });

    it('should reject invalid stream IDs', () => {
      expect(isValidStreamId(null)).toBe(false);
      expect(isValidStreamId('')).toBe(false);
      expect(isValidStreamId('invalid')).toBe(false);
      expect(isValidStreamId('stream-')).toBe(false);
      expect(isValidStreamId('stream-abc')).toBe(false);
    });
  });

  describe('isValidTraceId', () => {
    it('should validate common trace ID formats', () => {
      // W3C trace-id (32 hex)
      expect(isValidTraceId('0af7651916cd43dd8448eb211c80319c')).toBe(true);

      // UUID format
      expect(isValidTraceId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);

      // Custom alphanumeric
      expect(isValidTraceId('trace-abc123')).toBe(true);
    });

    it('should reject invalid trace IDs', () => {
      expect(isValidTraceId(null)).toBe(false);
      expect(isValidTraceId('')).toBe(false);
      expect(isValidTraceId('a'.repeat(200))).toBe(false); // Too long
      expect(isValidTraceId('trace with spaces')).toBe(false);
    });
  });

  describe('extractTraceId (SSRK-187)', () => {
    it('should extract from X-Trace-ID header', () => {
      const request = {
        headers: { 'x-trace-id': 'trace-from-header' },
        query: {},
      };

      expect(extractTraceId(request)).toBe('trace-from-header');
    });

    it('should extract from X-Request-ID header', () => {
      const request = {
        headers: { 'x-request-id': 'request-id-123' },
        query: {},
      };

      expect(extractTraceId(request)).toBe('request-id-123');
    });

    it('should extract from W3C traceparent header', () => {
      const request = {
        headers: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' },
        query: {},
      };

      expect(extractTraceId(request)).toBe('0af7651916cd43dd8448eb211c80319c');
    });

    it('should extract from query param', () => {
      const request = {
        headers: {},
        query: { trace_id: 'trace-from-query' },
      };

      expect(extractTraceId(request)).toBe('trace-from-query');
    });

    it('should prefer header over query', () => {
      const request = {
        headers: { 'x-trace-id': 'header-trace' },
        query: { trace_id: 'query-trace' },
      };

      expect(extractTraceId(request)).toBe('header-trace');
    });

    it('should return null if not found', () => {
      const request = { headers: {}, query: {} };

      expect(extractTraceId(request)).toBeNull();
    });
  });

  describe('CorrelationContext', () => {
    it('should create with stream_id and trace_id', () => {
      const ctx = createCorrelationContext({
        streamId: 'stream-test-123',
        traceId: 'trace-abc',
      });

      expect(ctx.streamId).toBe('stream-test-123');
      expect(ctx.traceId).toBe('trace-abc');
    });

    it('should generate log fields', () => {
      const ctx = createCorrelationContext({
        streamId: 'stream-test',
        traceId: 'trace-test',
      });

      const fields = ctx.toLogFields();

      expect(fields.stream_id).toBe('stream-test');
      expect(fields.trace_id).toBe('trace-test');
    });

    it('should omit missing fields', () => {
      const ctx = createCorrelationContext({ streamId: 'stream-only' });

      const fields = ctx.toLogFields();

      expect(fields.stream_id).toBe('stream-only');
      expect(fields.trace_id).toBeUndefined();
    });

    it('should validate trace_id on set', () => {
      const ctx = createCorrelationContext();

      ctx.setTraceId('valid-trace');
      expect(ctx.traceId).toBe('valid-trace');

      ctx.setTraceId('invalid trace with spaces');
      expect(ctx.traceId).toBe('valid-trace'); // Unchanged
    });
  });
});
