/**
 * Dedupe Cache Tests (SSRK-146, SSRK-147, SSRK-148, SSRK-149, SSRK-150, SSRK-151)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DedupeCache, createDedupeCache, DEDUPE_DEFAULTS } from '../../client/src/dedupe-cache.js';

describe('DedupeCache', () => {
  describe('Initialization', () => {
    it('should create cache with default options', () => {
      const cache = createDedupeCache();

      expect(cache.maxSize).toBe(DEDUPE_DEFAULTS.MAX_SIZE);
      expect(cache.ttlMs).toBe(DEDUPE_DEFAULTS.TTL_MS);
      expect(cache.size).toBe(0);
    });

    it('should accept custom options (SSRK-149)', () => {
      const cache = createDedupeCache({
        maxSize: 500,
        ttlMs: 60000,
      });

      expect(cache.maxSize).toBe(500);
      expect(cache.ttlMs).toBe(60000);
    });
  });

  describe('Dedupe strategy - event_id key (SSRK-146)', () => {
    let cache;

    beforeEach(() => {
      cache = createDedupeCache({ maxSize: 100 });
    });

    it('should use event_id as dedupe key', () => {
      const envelope = {
        event_id: 'evt-123',
        type: 'domain.test',
        ts: new Date().toISOString(),
        payload: {},
      };

      // First time - not duplicate
      expect(cache.isDuplicate(envelope)).toBe(false);

      // Second time - duplicate
      expect(cache.isDuplicate(envelope)).toBe(true);
    });

    it('should detect duplicate with same event_id (SSRK-151)', () => {
      const evt1 = { event_id: 'same-id', type: 'domain.a', ts: '', payload: { v: 1 } };
      const evt2 = { event_id: 'same-id', type: 'domain.b', ts: '', payload: { v: 2 } };

      expect(cache.isDuplicate(evt1)).toBe(false);
      expect(cache.isDuplicate(evt2)).toBe(true); // Same event_id = duplicate
    });

    it('should not detect different event_ids as duplicates', () => {
      const evt1 = { event_id: 'id-1', type: 'domain.test', ts: '', payload: {} };
      const evt2 = { event_id: 'id-2', type: 'domain.test', ts: '', payload: {} };

      expect(cache.isDuplicate(evt1)).toBe(false);
      expect(cache.isDuplicate(evt2)).toBe(false);
    });

    it('should return false for events without event_id', () => {
      const envelope = { type: 'domain.test', ts: '', payload: {} };

      expect(cache.isDuplicate(envelope)).toBe(false);
      expect(cache.isDuplicate(envelope)).toBe(false); // Still not duplicate
    });
  });

  describe('Bounded cache (SSRK-147)', () => {
    it('should evict oldest when max size exceeded (SSRK-151)', () => {
      const cache = createDedupeCache({ maxSize: 3 });

      cache.isDuplicate({ event_id: 'a', type: 'test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'c', type: 'test', ts: '', payload: {} });
      
      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(true);

      // Add 4th - should evict 'a'
      cache.isDuplicate({ event_id: 'd', type: 'test', ts: '', payload: {} });

      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('d')).toBe(true);
    });

    it('should track eviction stats', () => {
      const cache = createDedupeCache({ maxSize: 2 });

      cache.isDuplicate({ event_id: 'a', type: 'test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'c', type: 'test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'd', type: 'test', ts: '', payload: {} });

      const stats = cache.getStats();
      expect(stats.totalEvicted).toBe(2);
    });
  });

  describe('Skip heartbeats/control events (SSRK-148)', () => {
    let cache;

    beforeEach(() => {
      cache = createDedupeCache({ maxSize: 100 });
    });

    it('should not cache heartbeat events', () => {
      const heartbeat = {
        event_id: 'hb-1',
        type: 'system.heartbeat',
        ts: '',
        payload: {},
      };

      expect(cache.isDuplicate(heartbeat)).toBe(false);
      expect(cache.isDuplicate(heartbeat)).toBe(false); // Still false - not cached
      expect(cache.has('hb-1')).toBe(false);
    });

    it('should not cache control events', () => {
      const control = {
        event_id: 'ctrl-1',
        type: 'control.open',
        ts: '',
        payload: {},
      };

      expect(cache.isDuplicate(control)).toBe(false);
      expect(cache.isDuplicate(control)).toBe(false);
      expect(cache.has('ctrl-1')).toBe(false);
    });

    it('should not cache system events', () => {
      const systemEvent = {
        event_id: 'sys-1',
        type: 'system.error',
        ts: '',
        payload: {},
      };

      expect(cache.isDuplicate(systemEvent)).toBe(false);
      expect(cache.isDuplicate(systemEvent)).toBe(false);
      expect(cache.has('sys-1')).toBe(false);
    });

    it('should cache domain events', () => {
      const domain = {
        event_id: 'domain-1',
        type: 'domain.user.created',
        ts: '',
        payload: {},
      };

      expect(cache.isDuplicate(domain)).toBe(false);
      expect(cache.isDuplicate(domain)).toBe(true); // Cached
      expect(cache.has('domain-1')).toBe(true);
    });
  });

  describe('Config knobs (SSRK-149)', () => {
    it('should respect DEDUPE_MAX_SIZE', () => {
      const cache = createDedupeCache({ maxSize: 5 });

      for (let i = 0; i < 10; i++) {
        cache.isDuplicate({ event_id: `evt-${i}`, type: 'test', ts: '', payload: {} });
      }

      expect(cache.size).toBe(5);
    });

    it('should respect DEDUPE_TTL_MS', async () => {
      const cache = createDedupeCache({ maxSize: 100, ttlMs: 50 });

      cache.isDuplicate({ event_id: 'old', type: 'test', ts: '', payload: {} });
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger cleanup with new check
      cache.isDuplicate({ event_id: 'new', type: 'test', ts: '', payload: {} });

      expect(cache.has('old')).toBe(false);
    });
  });

  describe('Callback/telemetry (SSRK-150)', () => {
    it('should fire onDuplicate callback', () => {
      const onDuplicate = vi.fn();
      const cache = createDedupeCache({ onDuplicate });

      const envelope = { event_id: 'dup-1', type: 'domain.test', ts: '', payload: {} };

      cache.isDuplicate(envelope);
      expect(onDuplicate).not.toHaveBeenCalled();

      cache.isDuplicate(envelope);
      expect(onDuplicate).toHaveBeenCalledWith({
        event_id: 'dup-1',
        type: 'domain.test',
        totalDuplicates: 1,
      });
    });

    it('should track duplicate counter', () => {
      const cache = createDedupeCache();

      const envelope = { event_id: 'dup-2', type: 'domain.test', ts: '', payload: {} };

      cache.isDuplicate(envelope);
      cache.isDuplicate(envelope);
      cache.isDuplicate(envelope);

      const stats = cache.getStats();
      expect(stats.totalDuplicates).toBe(2);
    });

    it('should track duplicates by type', () => {
      const cache = createDedupeCache();

      cache.isDuplicate({ event_id: 'a', type: 'domain.user', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'a', type: 'domain.user', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'domain.order', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'domain.order', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'domain.order', ts: '', payload: {} });

      const stats = cache.getStats();
      expect(stats.duplicatesByType['domain.user']).toBe(1);
      expect(stats.duplicatesByType['domain.order']).toBe(2);
    });

    it('should calculate duplicate rate', () => {
      const cache = createDedupeCache();

      // 5 checks, 2 duplicates
      cache.isDuplicate({ event_id: 'a', type: 'domain.a', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'domain.b', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'a', type: 'domain.a', ts: '', payload: {} }); // dup
      cache.isDuplicate({ event_id: 'c', type: 'domain.c', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'domain.b', ts: '', payload: {} }); // dup

      expect(cache.duplicateRate).toBe(2 / 5);
    });
  });

  describe('Statistics', () => {
    it('should track all stats', () => {
      const cache = createDedupeCache({ maxSize: 100 });

      cache.isDuplicate({ event_id: 'a', type: 'domain.test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'a', type: 'domain.test', ts: '', payload: {} });

      const stats = cache.getStats();

      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(100);
      expect(stats.totalChecked).toBe(2);
      expect(stats.totalAdded).toBe(1);
      expect(stats.totalDuplicates).toBe(1);
    });
  });

  describe('Utility methods', () => {
    it('should clear cache', () => {
      const cache = createDedupeCache();

      cache.isDuplicate({ event_id: 'a', type: 'test', ts: '', payload: {} });
      cache.isDuplicate({ event_id: 'b', type: 'test', ts: '', payload: {} });

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });

    it('should manually add event ID', () => {
      const cache = createDedupeCache();

      cache.add('manual-id');

      expect(cache.has('manual-id')).toBe(true);
      expect(cache.isDuplicate({ event_id: 'manual-id', type: 'test', ts: '', payload: {} })).toBe(true);
    });
  });
});
