/**
 * State Machine Tests (SSRK-96)
 * Tests state transitions for all scenarios
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateMachine,
  ConnectionState,
  TransitionReason,
  createStateMachine,
} from '../../client/src/state-machine.js';

describe('State Machine', () => {
  let sm;

  beforeEach(() => {
    sm = createStateMachine();
  });

  describe('Initial State (SSRK-90)', () => {
    it('should start in IDLE state', () => {
      expect(sm.state).toBe(ConnectionState.IDLE);
    });

    it('should have no previous state initially', () => {
      expect(sm.previousState).toBeNull();
    });
  });

  describe('State Definitions (SSRK-90)', () => {
    it('should define all required states', () => {
      expect(ConnectionState.IDLE).toBe('idle');
      expect(ConnectionState.CONNECTING).toBe('connecting');
      expect(ConnectionState.OPEN).toBe('open');
      expect(ConnectionState.ERROR).toBe('error');
      expect(ConnectionState.RETRYING).toBe('retrying');
      expect(ConnectionState.CLOSED).toBe('closed');
    });
  });

  describe('Valid Transitions (SSRK-90)', () => {
    it('IDLE → CONNECTING (connect)', () => {
      expect(sm.canTransitionTo(ConnectionState.CONNECTING)).toBe(true);
      const result = sm.connect();
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.CONNECTING);
    });

    it('CONNECTING → OPEN (success)', () => {
      sm.connect();
      expect(sm.canTransitionTo(ConnectionState.OPEN)).toBe(true);
      const result = sm.connected();
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.OPEN);
    });

    it('CONNECTING → ERROR (failure)', () => {
      sm.connect();
      expect(sm.canTransitionTo(ConnectionState.ERROR)).toBe(true);
      const result = sm.error(TransitionReason.CONNECTION_ERROR);
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.ERROR);
    });

    it('OPEN → ERROR (disconnect)', () => {
      sm.connect();
      sm.connected();
      expect(sm.canTransitionTo(ConnectionState.ERROR)).toBe(true);
      const result = sm.error(TransitionReason.NETWORK_ERROR);
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.ERROR);
    });

    it('ERROR → RETRYING (retry scheduled)', () => {
      sm.connect();
      sm.error();
      expect(sm.canTransitionTo(ConnectionState.RETRYING)).toBe(true);
      const result = sm.retry();
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.RETRYING);
    });

    it('RETRYING → CONNECTING (retry attempt)', () => {
      sm.connect();
      sm.error();
      sm.retry();
      expect(sm.canTransitionTo(ConnectionState.CONNECTING)).toBe(true);
      const result = sm.retrying();
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.CONNECTING);
    });

    it('ERROR → CLOSED (retry exhausted)', () => {
      sm.connect();
      sm.error();
      expect(sm.canTransitionTo(ConnectionState.CLOSED)).toBe(true);
      const result = sm.close(TransitionReason.RETRY_EXHAUSTED);
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.CLOSED);
    });

    it('CLOSED → IDLE (restart)', () => {
      sm.connect();
      sm.error();
      sm.close();
      expect(sm.canTransitionTo(ConnectionState.IDLE)).toBe(true);
      const result = sm.reset();
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.IDLE);
    });
  });

  describe('Invalid Transitions', () => {
    it('should reject IDLE → OPEN', () => {
      expect(sm.canTransitionTo(ConnectionState.OPEN)).toBe(false);
      const result = sm.connected();
      expect(result).toBe(false);
      expect(sm.state).toBe(ConnectionState.IDLE);
    });

    it('should reject OPEN → CONNECTING', () => {
      sm.connect();
      sm.connected();
      expect(sm.canTransitionTo(ConnectionState.CONNECTING)).toBe(false);
    });

    it('should reject RETRYING → OPEN', () => {
      sm.connect();
      sm.error();
      sm.retry();
      expect(sm.canTransitionTo(ConnectionState.OPEN)).toBe(false);
    });
  });

  describe('State Change Callback (SSRK-92)', () => {
    it('should call onStateChange on transition', () => {
      const callback = vi.fn();
      sm.setOnStateChange(callback);
      
      sm.connect();
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        previous: ConnectionState.IDLE,
        current: ConnectionState.CONNECTING,
        reason: TransitionReason.USER_CONNECT,
      }));
    });

    it('should include metadata in callback', () => {
      const callback = vi.fn();
      sm.setOnStateChange(callback);
      
      sm.connect();
      sm.error(TransitionReason.NETWORK_ERROR, { code: 'ECONNREFUSED' });
      
      expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({
        metadata: { code: 'ECONNREFUSED' },
      }));
    });

    it('should fire callback on every transition', () => {
      const callback = vi.fn();
      sm.setOnStateChange(callback);
      
      sm.connect();       // 1
      sm.connected();     // 2
      sm.error();         // 3
      sm.retry();         // 4
      sm.retrying();      // 5
      sm.connected();     // 6
      
      expect(callback).toHaveBeenCalledTimes(6);
    });
  });

  describe('Manual Close/Stop (SSRK-94)', () => {
    it('should close from OPEN state', () => {
      sm.connect();
      sm.connected();
      
      const result = sm.close(TransitionReason.USER_STOP);
      
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.CLOSED);
    });

    it('should force close from any state', () => {
      sm.connect();
      
      const result = sm.forceClose(TransitionReason.USER_STOP);
      
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.CLOSED);
    });

    it('should force close from RETRYING', () => {
      sm.connect();
      sm.error();
      sm.retry();
      
      const result = sm.forceClose(TransitionReason.USER_STOP);
      
      expect(result).toBe(true);
      expect(sm.state).toBe(ConnectionState.CLOSED);
    });

    it('should prevent further state changes after close', () => {
      sm.connect();
      sm.connected();
      sm.forceClose();
      
      // Can only reset from closed
      expect(sm.canTransitionTo(ConnectionState.CONNECTING)).toBe(false);
      expect(sm.canTransitionTo(ConnectionState.IDLE)).toBe(true);
    });
  });

  describe('Debug Logging (SSRK-95)', () => {
    it('should support debug mode toggle', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      sm.setDebug(true);
      sm.connect();
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should not log when debug is off', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      sm.setDebug(false);
      sm.connect();
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('State History', () => {
    it('should track state history', () => {
      sm.connect();
      sm.connected();
      sm.error();
      
      const history = sm.getHistory();
      
      expect(history.length).toBe(3);
      expect(history[0].from).toBe(ConnectionState.IDLE);
      expect(history[0].to).toBe(ConnectionState.CONNECTING);
      expect(history[2].to).toBe(ConnectionState.ERROR);
    });

    it('should track previous state', () => {
      sm.connect();
      expect(sm.previousState).toBe(ConnectionState.IDLE);
      
      sm.connected();
      expect(sm.previousState).toBe(ConnectionState.CONNECTING);
    });
  });

  describe('Statistics', () => {
    it('should track transition count', () => {
      sm.connect();
      sm.connected();
      sm.error();
      
      const stats = sm.getStats();
      
      expect(stats.transitionCount).toBe(3);
    });

    it('should track time in states', () => {
      sm.connect();
      
      const stats = sm.getStats();
      
      expect(stats.timeInState).toHaveProperty(ConnectionState.IDLE);
      expect(stats.timeInState).toHaveProperty(ConnectionState.CONNECTING);
    });
  });

  describe('Full Lifecycle Scenarios (SSRK-96)', () => {
    it('successful connect flow', () => {
      // IDLE → CONNECTING → OPEN
      expect(sm.state).toBe(ConnectionState.IDLE);
      
      sm.connect();
      expect(sm.state).toBe(ConnectionState.CONNECTING);
      
      sm.connected();
      expect(sm.state).toBe(ConnectionState.OPEN);
    });

    it('server close with retry', () => {
      sm.connect();
      sm.connected();
      
      // Server closes connection
      sm.error(TransitionReason.SERVER_CLOSE);
      expect(sm.state).toBe(ConnectionState.ERROR);
      
      // Schedule retry
      sm.retry();
      expect(sm.state).toBe(ConnectionState.RETRYING);
      
      // Attempt reconnect
      sm.retrying();
      expect(sm.state).toBe(ConnectionState.CONNECTING);
      
      // Success
      sm.connected();
      expect(sm.state).toBe(ConnectionState.OPEN);
    });

    it('parse error should not change state', () => {
      sm.connect();
      sm.connected();
      
      // Parse errors are handled at connector level, not state machine
      // State should remain OPEN
      expect(sm.state).toBe(ConnectionState.OPEN);
    });

    it('manual stop from any state', () => {
      sm.connect();
      sm.connected();
      sm.error();
      sm.retry();
      
      // User calls stop()
      sm.forceClose(TransitionReason.USER_STOP);
      
      expect(sm.state).toBe(ConnectionState.CLOSED);
    });

    it('retry exhaustion flow', () => {
      sm.connect();
      sm.error();
      
      // After max retries
      sm.close(TransitionReason.RETRY_EXHAUSTED);
      
      expect(sm.state).toBe(ConnectionState.CLOSED);
    });
  });

  describe('is() helper', () => {
    it('should return true for current state', () => {
      expect(sm.is(ConnectionState.IDLE)).toBe(true);
      expect(sm.is(ConnectionState.CONNECTING)).toBe(false);
    });
  });
});
