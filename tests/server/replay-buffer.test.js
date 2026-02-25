/**
 * Replay Buffer Tests (SSRK-135, SSRK-136, SSRK-137, SSRK-138)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ReplayBuffer, createReplayBuffer } from '../../server/src/replay-buffer.js';

describe('ReplayBuffer', () => {
  describe('Initialization', () => {
    it('should create buffer with default options', () => {
      const buffer = createReplayBuffer();

      expect(buffer.maxSize).toBe(1000);
      expect(buffer.maxReplayBatch).toBe(100);
      expect(buffer.size).toBe(0);
    });

    it('should accept custom options', () => {
      const buffer = createReplayBuffer({
        maxSize: 500,
        maxReplayBatch: 50,
        ttlMs: 60000,
      });

      expect(buffer.maxSize).toBe(500);
      expect(buffer.maxReplayBatch).toBe(50);
      expect(buffer.ttlMs).toBe(60000);
    });
  });

  describe('Bounded buffer (SSRK-135)', () => {
    it('should add events to buffer', () => {
      const buffer = createReplayBuffer({ maxSize: 10 });

      const added = buffer.add({
        event_id: 'evt-1',
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
      });

      expect(added).toBe(true);
      expect(buffer.size).toBe(1);
    });

    it('should evict oldest when max size exceeded', () => {
      const buffer = createReplayBuffer({ maxSize: 3 });

      buffer.add({ event_id: 'evt-1', type: 'a', ts: '', payload: {} });
      buffer.add({ event_id: 'evt-2', type: 'b', ts: '', payload: {} });
      buffer.add({ event_id: 'evt-3', type: 'c', ts: '', payload: {} });
      
      expect(buffer.size).toBe(3);
      expect(buffer.has('evt-1')).toBe(true);

      // Add 4th event - should evict evt-1
      buffer.add({ event_id: 'evt-4', type: 'd', ts: '', payload: {} });

      expect(buffer.size).toBe(3);
      expect(buffer.has('evt-1')).toBe(false);
      expect(buffer.has('evt-4')).toBe(true);
    });

    it('should track eviction stats', () => {
      const buffer = createReplayBuffer({ maxSize: 2 });

      buffer.add({ event_id: 'evt-1', type: 'a', ts: '', payload: {} });
      buffer.add({ event_id: 'evt-2', type: 'b', ts: '', payload: {} });
      buffer.add({ event_id: 'evt-3', type: 'c', ts: '', payload: {} });
      buffer.add({ event_id: 'evt-4', type: 'd', ts: '', payload: {} });

      const stats = buffer.getStats();
      expect(stats.totalAdded).toBe(4);
      expect(stats.totalEvicted).toBe(2);
    });

    it('should not add duplicates', () => {
      const buffer = createReplayBuffer();

      buffer.add({ event_id: 'evt-1', type: 'a', ts: '', payload: {} });
      const added = buffer.add({ event_id: 'evt-1', type: 'a', ts: '', payload: {} });

      expect(added).toBe(false);
      expect(buffer.size).toBe(1);
    });

    it('should reject events without event_id', () => {
      const buffer = createReplayBuffer();

      const added = buffer.add({ type: 'a', ts: '', payload: {} });

      expect(added).toBe(false);
      expect(buffer.size).toBe(0);
    });
  });

  describe('Replay events after ID (SSRK-136)', () => {
    let buffer;

    beforeEach(() => {
      buffer = createReplayBuffer({ maxSize: 100 });

      // Add some events
      for (let i = 1; i <= 10; i++) {
        buffer.add({
          event_id: `evt-${i}`,
          type: `domain.event${i}`,
          ts: new Date().toISOString(),
          payload: { seq: i },
        });
      }
    });

    it('should return events after the given ID', () => {
      const result = buffer.getEventsAfter('evt-5');

      expect(result.found).toBe(true);
      expect(result.events.length).toBe(5);
      expect(result.events[0].event_id).toBe('evt-6');
      expect(result.events[4].event_id).toBe('evt-10');
    });

    it('should return empty array when ID is the newest', () => {
      const result = buffer.getEventsAfter('evt-10');

      expect(result.found).toBe(true);
      expect(result.events.length).toBe(0);
    });

    it('should return not found when ID does not exist', () => {
      const result = buffer.getEventsAfter('evt-999');

      expect(result.found).toBe(false);
      expect(result.events.length).toBe(0);
      expect(result.reason).toBe('event_not_found');
    });

    it('should return empty array when no lastEventId provided', () => {
      const result = buffer.getEventsAfter(null);

      expect(result.found).toBe(true);
      expect(result.events.length).toBe(0);
    });

    it('should return all events after first event', () => {
      const result = buffer.getEventsAfter('evt-1');

      expect(result.found).toBe(true);
      expect(result.events.length).toBe(9);
    });
  });

  describe('Ordering rule (SSRK-137)', () => {
    it('should return events in buffer order (insertion order)', () => {
      const buffer = createReplayBuffer();

      // Add events in specific order
      buffer.add({ event_id: 'a', type: 'first', ts: '', payload: {} });
      buffer.add({ event_id: 'b', type: 'second', ts: '', payload: {} });
      buffer.add({ event_id: 'c', type: 'third', ts: '', payload: {} });
      buffer.add({ event_id: 'd', type: 'fourth', ts: '', payload: {} });

      const result = buffer.getEventsAfter('a');

      expect(result.events[0].event_id).toBe('b');
      expect(result.events[1].event_id).toBe('c');
      expect(result.events[2].event_id).toBe('d');
    });

    it('should maintain order after evictions', () => {
      const buffer = createReplayBuffer({ maxSize: 3 });

      buffer.add({ event_id: 'a', type: '1', ts: '', payload: {} });
      buffer.add({ event_id: 'b', type: '2', ts: '', payload: {} });
      buffer.add({ event_id: 'c', type: '3', ts: '', payload: {} });
      buffer.add({ event_id: 'd', type: '4', ts: '', payload: {} }); // evicts 'a'
      buffer.add({ event_id: 'e', type: '5', ts: '', payload: {} }); // evicts 'b'

      // Buffer should now have: c, d, e
      const result = buffer.getEventsAfter('c');

      expect(result.events.length).toBe(2);
      expect(result.events[0].event_id).toBe('d');
      expect(result.events[1].event_id).toBe('e');
    });
  });

  describe('Replay batch cap (SSRK-138)', () => {
    it('should truncate replay when exceeding maxReplayBatch', () => {
      const buffer = createReplayBuffer({
        maxSize: 200,
        maxReplayBatch: 10,
      });

      // Add 50 events
      for (let i = 1; i <= 50; i++) {
        buffer.add({ event_id: `evt-${i}`, type: 'test', ts: '', payload: { i } });
      }

      // Request replay from beginning
      const result = buffer.getEventsAfter('evt-1');

      expect(result.truncated).toBe(true);
      expect(result.events.length).toBe(10);
      expect(result.totalAvailable).toBe(49); // 49 events after evt-1
      expect(result.events[0].event_id).toBe('evt-2');
      expect(result.events[9].event_id).toBe('evt-11');
    });

    it('should not truncate when under maxReplayBatch', () => {
      const buffer = createReplayBuffer({
        maxSize: 100,
        maxReplayBatch: 50,
      });

      for (let i = 1; i <= 20; i++) {
        buffer.add({ event_id: `evt-${i}`, type: 'test', ts: '', payload: {} });
      }

      const result = buffer.getEventsAfter('evt-1');

      expect(result.truncated).toBe(false);
      expect(result.events.length).toBe(19);
    });

    it('should track truncation stats', () => {
      const buffer = createReplayBuffer({
        maxSize: 50,
        maxReplayBatch: 5,
      });

      for (let i = 1; i <= 30; i++) {
        buffer.add({ event_id: `evt-${i}`, type: 'test', ts: '', payload: {} });
      }

      buffer.getEventsAfter('evt-1');
      buffer.getEventsAfter('evt-1');

      const stats = buffer.getStats();
      expect(stats.replayExceeded).toBe(2);
    });
  });

  describe('TTL cleanup', () => {
    it('should remove expired events when TTL is set', async () => {
      const buffer = createReplayBuffer({
        maxSize: 100,
        ttlMs: 50, // 50ms TTL
      });

      buffer.add({ event_id: 'old', type: 'a', ts: '', payload: {} });
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      buffer.add({ event_id: 'new', type: 'b', ts: '', payload: {} });

      // Trigger cleanup via getEventsAfter
      const result = buffer.getEventsAfter('old');

      expect(result.found).toBe(false);
    });
  });

  describe('Utility methods', () => {
    it('should return oldest and newest event IDs', () => {
      const buffer = createReplayBuffer();

      buffer.add({ event_id: 'first', type: 'a', ts: '', payload: {} });
      buffer.add({ event_id: 'middle', type: 'b', ts: '', payload: {} });
      buffer.add({ event_id: 'last', type: 'c', ts: '', payload: {} });

      expect(buffer.oldestEventId).toBe('first');
      expect(buffer.newestEventId).toBe('last');
    });

    it('should clear all events', () => {
      const buffer = createReplayBuffer();

      buffer.add({ event_id: 'a', type: 'x', ts: '', payload: {} });
      buffer.add({ event_id: 'b', type: 'y', ts: '', payload: {} });

      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.has('a')).toBe(false);
    });

    it('should get specific event by ID', () => {
      const buffer = createReplayBuffer();

      buffer.add({ event_id: 'target', type: 'special', ts: 'now', payload: { key: 'value' } });

      const event = buffer.get('target');

      expect(event).not.toBeNull();
      expect(event.type).toBe('special');
      expect(event.payload.key).toBe('value');
    });
  });
});
