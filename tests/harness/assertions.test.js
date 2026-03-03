/**
 * Assertion API Tests (SSRK-200)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Assertions,
  AssertionResult,
  AssertionError,
  createAssertions,
} from '../../harness/src/assertions.js';

describe('Assertions (SSRK-200)', () => {
  let context;
  let assertions;

  beforeEach(() => {
    context = {
      connector: {
        connected: true,
        hasGivenUp: false,
        getState: () => 'open',
        getStats: () => ({
          reconnectCount: 2,
          eventsReceived: 10,
          duplicatesIgnored: 1,
          resumeAttempts: 1,
          resumeSuccesses: 1,
          resumeFailures: 0,
          livenessFailures: 0,
        }),
        stats: {
          reconnectCount: 2,
          resumeAttempts: 1,
          resumeSuccesses: 1,
        },
        getDedupeCache: () => ({
          getStats: () => ({ totalDuplicates: 1 }),
        }),
        getReconnectManager: () => ({
          hasGivenUp: false,
          pendingRetryTimer: null,
        }),
      },
      events: [
        { event_id: 'e1', type: 'domain.test', sequence: 1 },
        { event_id: 'e2', type: 'domain.test', sequence: 2 },
      ],
      controlEvents: [{ type: 'control.open' }],
      duplicatesDropped: 1,
      livenessFailures: 0,
      cannotResumeReceived: false,
    };

    assertions = createAssertions(context);
  });

  describe('State assertions', () => {
    it('should pass when state matches', () => {
      assertions.state('open');
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should fail when state does not match', () => {
      expect(() => assertions.state('closed')).toThrow(AssertionError);
    });

    it('should verify isConnected', () => {
      assertions.isConnected();
      expect(assertions.getSummary().allPassed).toBe(true);
    });
  });

  describe('Reconnect assertions (SSRK-202)', () => {
    it('should verify reconnect count', () => {
      assertions.reconnectCount(2);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify min reconnects', () => {
      assertions.minReconnects(1);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify max reconnects', () => {
      assertions.maxReconnects(5);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify hasNotGivenUp', () => {
      assertions.hasNotGivenUp();
      expect(assertions.getSummary().allPassed).toBe(true);
    });
  });

  describe('Resume assertions (SSRK-203)', () => {
    it('should verify resume attempted', () => {
      assertions.resumeAttempted();
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify resume succeeded', () => {
      assertions.resumeSucceeded();
      expect(assertions.getSummary().allPassed).toBe(true);
    });
  });

  describe('Dedupe assertions (SSRK-204)', () => {
    it('should verify duplicates dropped', () => {
      assertions.duplicatesDropped(1);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify no duplicates processed', () => {
      assertions.noDuplicatesProcessed();
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should fail when duplicates processed', () => {
      context.events.push({ event_id: 'e1', type: 'domain.test' }); // Duplicate
      expect(() => assertions.noDuplicatesProcessed()).toThrow(AssertionError);
    });
  });

  describe('Events assertions', () => {
    it('should verify events received', () => {
      assertions.eventsReceived(2);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify min events', () => {
      assertions.minEvents(1);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify event type received', () => {
      assertions.receivedEventType('domain.test');
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should verify control event type', () => {
      assertions.receivedEventType('control.open');
      expect(assertions.getSummary().allPassed).toBe(true);
    });
  });

  describe('Custom assertions', () => {
    it('should support custom predicate', () => {
      assertions.custom('Has at least 2 events', (ctx) => ctx.events.length >= 2);
      expect(assertions.getSummary().allPassed).toBe(true);
    });

    it('should fail custom predicate', () => {
      expect(() => {
        assertions.custom('Has 100 events', (ctx) => ctx.events.length >= 100);
      }).toThrow(AssertionError);
    });
  });

  describe('Summary', () => {
    it('should track all assertions', () => {
      assertions.state('open');
      assertions.isConnected();
      assertions.minEvents(1);

      const summary = assertions.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.passed).toBe(3);
      expect(summary.failed).toBe(0);
      expect(summary.allPassed).toBe(true);
    });
  });
});
