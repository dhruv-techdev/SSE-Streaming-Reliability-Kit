/**
 * Connection Registry Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionRegistry } from '../../server/src/connection-registry.js';

describe('ConnectionRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ConnectionRegistry({ maxConnections: 5 });
  });

  describe('register', () => {
    it('should register a new connection', () => {
      const result = registry.register('conn-1', { ip: '127.0.0.1' });
      
      expect(result.success).toBe(true);
      expect(registry.size).toBe(1);
      expect(registry.has('conn-1')).toBe(true);
    });

    it('should reject when max connections exceeded', () => {
      // Fill up registry
      for (let i = 0; i < 5; i++) {
        registry.register(`conn-${i}`, {});
      }
      
      // Try to add one more
      const result = registry.register('conn-overflow', {});
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('overload_reject');
      expect(registry.size).toBe(5);
    });
  });

  describe('unregister', () => {
    it('should remove connection from registry', () => {
      registry.register('conn-1', {});
      expect(registry.size).toBe(1);
      
      registry.unregister('conn-1', 'client_close');
      expect(registry.size).toBe(0);
      expect(registry.has('conn-1')).toBe(false);
    });

    it('should clear timers on unregister', () => {
      registry.register('conn-1', {});
      
      let timerCleared = false;
      const mockTimer = setInterval(() => {}, 1000);
      registry.addTimer('conn-1', mockTimer);
      
      registry.unregister('conn-1', 'client_close');
      
      // Timer should be cleared (no error thrown)
      expect(registry.size).toBe(0);
      clearInterval(mockTimer); // Cleanup
    });

    it('should call cleanup function', () => {
      registry.register('conn-1', {});
      
      let cleanupCalled = false;
      let cleanupReason = null;
      registry.setCleanup('conn-1', (reason) => {
        cleanupCalled = true;
        cleanupReason = reason;
      });
      
      registry.unregister('conn-1', 'server_shutdown');
      
      expect(cleanupCalled).toBe(true);
      expect(cleanupReason).toBe('server_shutdown');
    });
  });

  describe('closeAll', () => {
    it('should close all connections', () => {
      registry.register('conn-1', {});
      registry.register('conn-2', {});
      registry.register('conn-3', {});
      
      expect(registry.size).toBe(3);
      
      registry.closeAll('server_shutdown');
      
      expect(registry.size).toBe(0);
    });

    it('should call cleanup for each connection', () => {
      const cleanups = [];
      
      for (let i = 0; i < 3; i++) {
        registry.register(`conn-${i}`, {});
        registry.setCleanup(`conn-${i}`, (reason) => {
          cleanups.push({ id: `conn-${i}`, reason });
        });
      }
      
      registry.closeAll('server_shutdown');
      
      expect(cleanups.length).toBe(3);
      expect(cleanups.every(c => c.reason === 'server_shutdown')).toBe(true);
    });
  });

  describe('stats', () => {
    it('should track connection statistics', () => {
      registry.register('conn-1', {});
      registry.register('conn-2', {});
      registry.unregister('conn-1', 'client_close');
      
      const stats = registry.getStats();
      
      expect(stats.activeConnections).toBe(1);
      expect(stats.totalConnections).toBe(2);
      expect(stats.totalDisconnections).toBe(1);
    });

    it('should track rejected connections', () => {
      // Fill registry
      for (let i = 0; i < 5; i++) {
        registry.register(`conn-${i}`, {});
      }
      
      // Try to overflow
      registry.register('overflow-1', {});
      registry.register('overflow-2', {});
      
      const stats = registry.getStats();
      expect(stats.rejectedConnections).toBe(2);
    });
  });

  describe('touch', () => {
    it('should update last activity time', async () => {
      registry.register('conn-1', {});
      const conn = registry.get('conn-1');
      const initialTime = conn.lastActivityAt;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      registry.touch('conn-1');
      
      expect(conn.lastActivityAt).toBeGreaterThan(initialTime);
    });
  });
});
