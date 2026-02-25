/**
 * Ordering Guard Tests (SSRK-152, SSRK-153, SSRK-154, SSRK-155, SSRK-156, SSRK-157)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OrderingGuard,
  createOrderingGuard,
  OrderingRule,
  OutOfOrderPolicy,
} from '../../client/src/ordering-guard.js';

describe('OrderingGuard', () => {
  describe('Initialization', () => {
    it('should create guard with default options', () => {
      const guard = createOrderingGuard();

      expect(guard.orderingRule).toBe(OrderingRule.SEQUENCE);
      expect(guard.outOfOrderPolicy).toBe(OutOfOrderPolicy.DROP_WITH_CALLBACK);
    });

    it('should accept custom options', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.EVENT_ID,
        outOfOrderPolicy: OutOfOrderPolicy.DROP,
      });

      expect(guard.orderingRule).toBe(OrderingRule.EVENT_ID);
      expect(guard.outOfOrderPolicy).toBe(OutOfOrderPolicy.DROP);
    });
  });

  describe('Ordering rule - SEQUENCE (SSRK-152)', () => {
    let guard;

    beforeEach(() => {
      guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
      });
    });

    it('should accept first event', () => {
      const result = guard.check({
        event_id: 'a',
        type: 'domain.test',
        ts: '',
        payload: {},
        sequence: 1,
      });

      expect(result.accept).toBe(true);
    });

    it('should accept events with increasing sequence (SSRK-157)', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 1 });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        sequence: 2,
      });

      expect(result.accept).toBe(true);
    });

    it('should drop events with same sequence (SSRK-157)', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 5 });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        sequence: 5, // Same as last
      });

      expect(result.accept).toBe(false);
      expect(result.reason).toBe('sequence_not_increasing');
    });

    it('should drop events with lower sequence (SSRK-157)', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        sequence: 5, // Lower than last
      });

      expect(result.accept).toBe(false);
    });

    it('should accept events without sequence', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 1 });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        // No sequence field
      });

      expect(result.accept).toBe(true);
    });
  });

  describe('Ordering rule - EVENT_ID (SSRK-152)', () => {
    let guard;

    beforeEach(() => {
      guard = createOrderingGuard({
        orderingRule: OrderingRule.EVENT_ID,
      });
    });

    it('should accept events with increasing event_id', () => {
      guard.check({ event_id: 'aaa', type: 'domain.a', ts: '', payload: {} });
      
      const result = guard.check({
        event_id: 'bbb', // Greater string
        type: 'domain.b',
        ts: '',
        payload: {},
      });

      expect(result.accept).toBe(true);
    });

    it('should drop events with lower event_id', () => {
      guard.check({ event_id: 'zzz', type: 'domain.a', ts: '', payload: {} });
      
      const result = guard.check({
        event_id: 'aaa', // Lower string
        type: 'domain.b',
        ts: '',
        payload: {},
      });

      expect(result.accept).toBe(false);
    });
  });

  describe('Ordering rule - TIMESTAMP (SSRK-152)', () => {
    let guard;

    beforeEach(() => {
      guard = createOrderingGuard({
        orderingRule: OrderingRule.TIMESTAMP,
      });
    });

    it('should accept events with increasing timestamp', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '2024-01-01T00:00:00Z', payload: {} });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '2024-01-02T00:00:00Z', // Later
        payload: {},
      });

      expect(result.accept).toBe(true);
    });

    it('should drop events with earlier timestamp', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '2024-06-01T00:00:00Z', payload: {} });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '2024-01-01T00:00:00Z', // Earlier
        payload: {},
      });

      expect(result.accept).toBe(false);
    });
  });

  describe('Ordering rule - NONE (SSRK-152)', () => {
    it('should accept all events regardless of order', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.NONE,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 100 });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        sequence: 1, // Much lower
      });

      expect(result.accept).toBe(true);
    });
  });

  describe('Track last accepted marker (SSRK-153)', () => {
    it('should track lastAcceptedSequence', () => {
      const guard = createOrderingGuard({ orderingRule: OrderingRule.SEQUENCE });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 5 });
      expect(guard.lastAcceptedSequence).toBe(5);

      guard.check({ event_id: 'b', type: 'domain.b', ts: '', payload: {}, sequence: 10 });
      expect(guard.lastAcceptedSequence).toBe(10);
    });

    it('should track lastAcceptedEventId', () => {
      const guard = createOrderingGuard({ orderingRule: OrderingRule.EVENT_ID });

      guard.check({ event_id: 'event-123', type: 'domain.a', ts: '', payload: {} });
      expect(guard.lastAcceptedEventId).toBe('event-123');
    });

    it('should track lastAcceptedTimestamp', () => {
      const guard = createOrderingGuard({ orderingRule: OrderingRule.TIMESTAMP });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '2024-06-15T12:00:00Z', payload: {} });
      expect(guard.lastAcceptedTimestamp).toBe('2024-06-15T12:00:00Z');
    });

    it('should not update marker on dropped event (SSRK-157)', () => {
      const guard = createOrderingGuard({ orderingRule: OrderingRule.SEQUENCE });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });
      expect(guard.lastAcceptedSequence).toBe(10);

      // Try out-of-order event
      guard.check({ event_id: 'b', type: 'domain.b', ts: '', payload: {}, sequence: 5 });
      
      // Marker should still be 10
      expect(guard.lastAcceptedSequence).toBe(10);
    });
  });

  describe('Out-of-order handling policy (SSRK-154)', () => {
    it('should drop with callback by default', () => {
      const onOutOfOrder = vi.fn();
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
        outOfOrderPolicy: OutOfOrderPolicy.DROP_WITH_CALLBACK,
        onOutOfOrder,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });
      guard.check({ event_id: 'b', type: 'domain.b', ts: '', payload: {}, sequence: 5 });

      expect(onOutOfOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'b',
          type: 'domain.b',
          sequence: 5,
          reason: 'sequence_not_increasing',
          lastAcceptedSequence: 10,
        })
      );
    });

    it('should drop silently with DROP policy', () => {
      const onOutOfOrder = vi.fn();
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
        outOfOrderPolicy: OutOfOrderPolicy.DROP,
        onOutOfOrder,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });
      guard.check({ event_id: 'b', type: 'domain.b', ts: '', payload: {}, sequence: 5 });

      expect(onOutOfOrder).not.toHaveBeenCalled();
    });

    it('should accept with ACCEPT policy', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
        outOfOrderPolicy: OutOfOrderPolicy.ACCEPT,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });
      
      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        sequence: 5,
      });

      expect(result.accept).toBe(true);
      expect(result.reason).toBe('accepted_out_of_order');
    });
  });

  describe('Idempotency guardrail hook (SSRK-155)', () => {
    it('should call shouldProcess hook', () => {
      const shouldProcess = vi.fn().mockReturnValue(true);
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
        shouldProcess,
      });

      const envelope = { event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 1 };
      guard.check(envelope);

      expect(shouldProcess).toHaveBeenCalledWith(envelope, expect.any(Object));
    });

    it('should reject if hook returns false', () => {
      const shouldProcess = vi.fn().mockReturnValue(false);
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
        shouldProcess,
      });

      const result = guard.check({
        event_id: 'a',
        type: 'domain.a',
        ts: '',
        payload: {},
        sequence: 1,
      });

      expect(result.accept).toBe(false);
      expect(result.reason).toBe('rejected_by_hook');
    });

    it('should pass context to hook', () => {
      let capturedContext = null;
      const shouldProcess = vi.fn().mockImplementation((env, ctx) => {
        capturedContext = ctx;
        return true;
      });
      
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
        shouldProcess,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 5 });
      guard.check({ event_id: 'b', type: 'domain.b', ts: '', payload: {}, sequence: 6 });

      expect(capturedContext).toEqual({
        lastAcceptedSequence: 5,
        lastAcceptedEventId: 'a',
        lastAcceptedTimestamp: '',
      });
    });
  });

  describe('Control events don\'t affect sequencing (SSRK-156)', () => {
    let guard;

    beforeEach(() => {
      guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
      });
    });

    it('should always accept control events', () => {
      // Set up a sequence
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });

      // Control event with low sequence should be accepted
      const result = guard.check({
        event_id: 'ctrl',
        type: 'control.open',
        ts: '',
        payload: {},
        sequence: 1, // Lower than last domain event
      });

      expect(result.accept).toBe(true);
      expect(result.reason).toBe('control_event');
    });

    it('should not update markers from control events', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });
      guard.check({ event_id: 'ctrl', type: 'control.open', ts: '', payload: {}, sequence: 1 });

      // Marker should still be from domain event
      expect(guard.lastAcceptedSequence).toBe(10);
    });

    it('should always accept system events', () => {
      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 10 });

      const result = guard.check({
        event_id: 'hb',
        type: 'system.heartbeat',
        ts: '',
        payload: {},
        sequence: 0,
      });

      expect(result.accept).toBe(true);
      expect(result.reason).toBe('system_event');
    });
  });

  describe('Statistics', () => {
    it('should track all stats', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 1 });
      guard.check({ event_id: 'b', type: 'domain.b', ts: '', payload: {}, sequence: 2 });
      guard.check({ event_id: 'c', type: 'domain.c', ts: '', payload: {}, sequence: 1 }); // dropped

      const stats = guard.getStats();

      expect(stats.totalChecked).toBe(3);
      expect(stats.totalAccepted).toBe(2);
      expect(stats.totalDropped).toBe(1);
    });

    it('should track out-of-order by type', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
      });

      guard.check({ event_id: 'a', type: 'domain.user', ts: '', payload: {}, sequence: 10 });
      guard.check({ event_id: 'b', type: 'domain.user', ts: '', payload: {}, sequence: 5 });
      guard.check({ event_id: 'c', type: 'domain.order', ts: '', payload: {}, sequence: 3 });

      const stats = guard.getStats();
      expect(stats.outOfOrderByType['domain.user']).toBe(1);
      expect(stats.outOfOrderByType['domain.order']).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should reset all markers', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: 'now', payload: {}, sequence: 100 });
      
      expect(guard.lastAcceptedSequence).toBe(100);

      guard.reset();

      expect(guard.lastAcceptedSequence).toBeNull();
      expect(guard.lastAcceptedEventId).toBeNull();
      expect(guard.lastAcceptedTimestamp).toBeNull();
    });

    it('should accept any sequence after reset', () => {
      const guard = createOrderingGuard({
        orderingRule: OrderingRule.SEQUENCE,
      });

      guard.check({ event_id: 'a', type: 'domain.a', ts: '', payload: {}, sequence: 100 });
      guard.reset();

      const result = guard.check({
        event_id: 'b',
        type: 'domain.b',
        ts: '',
        payload: {},
        sequence: 1, // Would normally be dropped
      });

      expect(result.accept).toBe(true);
    });
  });
});
