/**
 * Event ID Store Tests (SSRK-128, SSRK-129)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EventIdStore,
  createEventIdStore,
  MemoryStorage,
} from '../../client/src/event-id-store.js';

describe('EventIdStore', () => {
  describe('Initialization', () => {
    it('should create store with default options', () => {
      const store = createEventIdStore();

      expect(store.get()).toBeNull();
      expect(store.hasResumePoint()).toBe(false);
    });

    it('should accept custom streamId', () => {
      const store = createEventIdStore({
        streamId: 'my-stream',
      });

      expect(store.streamId).toBe('my-stream');
    });

    it('should accept custom storage adapter', () => {
      const storage = new MemoryStorage();
      const store = createEventIdStore({
        storage,
      });

      expect(store.storage).toBe(storage);
    });
  });

  describe('Track lastEventId (SSRK-128)', () => {
    let store;

    beforeEach(() => {
      store = createEventIdStore();
    });

    it('should update lastEventId from event envelope', () => {
      const envelope = {
        event_id: 'evt-123',
        type: 'domain.user.created',
        ts: new Date().toISOString(),
        payload: {},
      };

      const updated = store.updateFromEvent(envelope);

      expect(updated).toBe(true);
      expect(store.get()).toBe('evt-123');
    });

    it('should NOT update for heartbeat events', () => {
      store.set('previous-id');

      const heartbeat = {
        event_id: 'hb-456',
        type: 'system.heartbeat',
        ts: new Date().toISOString(),
        payload: {},
      };

      const updated = store.updateFromEvent(heartbeat);

      expect(updated).toBe(false);
      expect(store.get()).toBe('previous-id');
    });

    it('should update for control events', () => {
      const control = {
        event_id: 'ctrl-789',
        type: 'control.open',
        ts: new Date().toISOString(),
        payload: {},
      };

      const updated = store.updateFromEvent(control);

      expect(updated).toBe(true);
      expect(store.get()).toBe('ctrl-789');
    });

    it('should track multiple updates', () => {
      store.updateFromEvent({ event_id: 'evt-1', type: 'domain.a', ts: '', payload: {} });
      expect(store.get()).toBe('evt-1');

      store.updateFromEvent({ event_id: 'evt-2', type: 'domain.b', ts: '', payload: {} });
      expect(store.get()).toBe('evt-2');

      store.updateFromEvent({ event_id: 'evt-3', type: 'domain.c', ts: '', payload: {} });
      expect(store.get()).toBe('evt-3');
    });
  });

  describe('Persistence (SSRK-129)', () => {
    it('should persist to storage when enabled', () => {
      const storage = new MemoryStorage();
      const store = createEventIdStore({
        storage,
        persist: true,
        streamId: 'test-stream',
      });

      store.updateFromEvent({
        event_id: 'persist-123',
        type: 'domain.test',
        ts: '',
        payload: {},
      });

      expect(storage.get('lastEventId_test-stream')).toBe('persist-123');
    });

    it('should load from storage on creation', () => {
      const storage = new MemoryStorage();
      storage.set('lastEventId_test-stream', 'loaded-456');

      const store = createEventIdStore({
        storage,
        persist: true,
        streamId: 'test-stream',
      });

      expect(store.get()).toBe('loaded-456');
      expect(store.hasResumePoint()).toBe(true);
    });

    it('should clear from storage', () => {
      const storage = new MemoryStorage();
      storage.set('lastEventId_test-stream', 'to-clear');

      const store = createEventIdStore({
        storage,
        persist: true,
        streamId: 'test-stream',
      });

      store.clear();

      expect(store.get()).toBeNull();
      expect(storage.get('lastEventId_test-stream')).toBeNull();
    });

    it('should not persist when disabled', () => {
      const storage = new MemoryStorage();
      const store = createEventIdStore({
        storage,
        persist: false,
        streamId: 'test-stream',
      });

      store.updateFromEvent({
        event_id: 'no-persist',
        type: 'domain.test',
        ts: '',
        payload: {},
      });

      // Value should be in memory
      expect(store.get()).toBe('no-persist');
      // But not persisted to storage
      expect(storage.get('lastEventId_test-stream')).toBeNull();
    });
  });

  describe('MemoryStorage', () => {
    it('should store and retrieve values', () => {
      const storage = new MemoryStorage();

      storage.set('key1', 'value1');
      expect(storage.get('key1')).toBe('value1');
    });

    it('should remove values', () => {
      const storage = new MemoryStorage();

      storage.set('key1', 'value1');
      storage.remove('key1');
      expect(storage.get('key1')).toBeNull();
    });

    it('should clear all values', () => {
      const storage = new MemoryStorage();

      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.clear();

      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
    });
  });

  describe('hasResumePoint', () => {
    it('should return false when no ID stored', () => {
      const store = createEventIdStore();
      expect(store.hasResumePoint()).toBe(false);
    });

    it('should return true when ID is stored', () => {
      const store = createEventIdStore();
      store.set('some-id');
      expect(store.hasResumePoint()).toBe(true);
    });

    it('should return false after clear', () => {
      const store = createEventIdStore();
      store.set('some-id');
      store.clear();
      expect(store.hasResumePoint()).toBe(false);
    });
  });
});
