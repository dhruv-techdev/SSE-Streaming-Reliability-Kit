/**
 * Scenario Definition Tests (SSRK-191, SSRK-192)
 */
import { describe, it, expect } from 'vitest';
import { StepType, validateScenario, defineScenario } from '../../harness/src/scenario.js';

describe('Scenario Definition (SSRK-192)', () => {
  describe('StepType', () => {
    it('should define all step types', () => {
      expect(StepType.CONNECT).toBe('connect');
      expect(StepType.DISCONNECT).toBe('disconnect');
      expect(StepType.WAIT_CONNECTED).toBe('wait_connected');
      expect(StepType.WAIT_EVENTS).toBe('wait_events');
      expect(StepType.DROP_CONNECTION).toBe('drop_connection');
      expect(StepType.RESTART_SERVER).toBe('restart_server');
      expect(StepType.STOP_HEARTBEATS).toBe('stop_heartbeats');
      expect(StepType.WAIT_LIVENESS_FAILURE).toBe('wait_liveness_failure');
      expect(StepType.ASSERT_STATE).toBe('assert_state');
      expect(StepType.ASSERT_STATS).toBe('assert_stats');
    });
  });

  describe('validateScenario', () => {
    it('should validate correct scenario', () => {
      const scenario = {
        name: 'test-scenario',
        steps: [
          { type: StepType.CONNECT },
          { type: StepType.WAIT_CONNECTED },
        ],
      };

      const result = validateScenario(scenario);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject scenario without name', () => {
      const scenario = {
        steps: [{ type: StepType.CONNECT }],
      };

      const result = validateScenario(scenario);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Scenario must have a name');
    });

    it('should reject scenario without steps', () => {
      const scenario = {
        name: 'test',
      };

      const result = validateScenario(scenario);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Scenario must have steps array');
    });

    it('should reject step without type', () => {
      const scenario = {
        name: 'test',
        steps: [{ timeout: 1000 }],
      };

      const result = validateScenario(scenario);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Step 0 must have a type'))).toBe(true);
    });
  });

  describe('defineScenario', () => {
    it('should create scenario with defaults', () => {
      const scenario = defineScenario({
        name: 'test-scenario',
        steps: [{ type: StepType.CONNECT }],
      });

      expect(scenario.name).toBe('test-scenario');
      expect(scenario.timeout).toBe(30000);
      expect(scenario.tags).toEqual([]);
      expect(scenario.config.client).toEqual({});
      expect(scenario.config.server).toEqual({});
      expect(scenario.expected).toEqual({});
    });

    it('should preserve all provided fields', () => {
      const scenario = defineScenario({
        name: 'full-scenario',
        description: 'A full test scenario',
        timeout: 60000,
        tags: ['reconnect', 'liveness'],
        config: {
          client: { autoReconnect: true },
          server: { tickInterval: 100 },
        },
        steps: [
          { type: StepType.CONNECT },
          { type: StepType.WAIT_EVENTS, count: 5 },
        ],
        expected: {
          finalState: 'open',
          minEventsReceived: 5,
        },
      });

      expect(scenario.description).toBe('A full test scenario');
      expect(scenario.timeout).toBe(60000);
      expect(scenario.tags).toContain('reconnect');
      expect(scenario.config.client.autoReconnect).toBe(true);
      expect(scenario.config.server.tickInterval).toBe(100);
      expect(scenario.expected.finalState).toBe('open');
    });

    it('should throw on invalid scenario', () => {
      expect(() => {
        defineScenario({ steps: [] });
      }).toThrow('Invalid scenario');
    });
  });
});

describe('Scenario Runner (SSRK-191)', () => {
  // Note: Integration tests for the runner are in tests/harness/runner.test.js
  // These unit tests verify the scenario format
  
  it('should export ResultStatus', async () => {
    const { ResultStatus } = await import('../../harness/src/runner.js');
    
    expect(ResultStatus.PASSED).toBe('PASSED');
    expect(ResultStatus.FAILED).toBe('FAILED');
    expect(ResultStatus.TIMEOUT).toBe('TIMEOUT');
    expect(ResultStatus.ERROR).toBe('ERROR');
  });
});
