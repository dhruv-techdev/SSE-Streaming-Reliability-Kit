/**
 * Scenario Runner Integration Tests (SSRK-191)
 */
import { describe, it, expect } from 'vitest';
import { createRunner, ResultStatus } from '../../harness/src/runner.js';
import { defineScenario, StepType } from '../../harness/src/scenario.js';

describe('ScenarioRunner Integration', () => {
  it('should run a simple connect scenario', async () => {
    const scenario = defineScenario({
      name: 'simple-connect',
      timeout: 15000,
      config: {
        server: {
          tickInterval: 200,
          heartbeatInterval: 10000,
        },
      },
      steps: [
        { type: StepType.CONNECT },
        { type: StepType.WAIT_CONNECTED, timeout: 5000 },
        { type: StepType.WAIT_EVENTS, count: 2, timeout: 5000 },
        { type: StepType.ASSERT_STATE, state: 'open' },
        { type: StepType.DISCONNECT },
      ],
      expected: {
        minEventsReceived: 2,
      },
    });

    const runner = createRunner({ serverPort: 3108 });
    const result = await runner.run(scenario);

    expect(result.name).toBe('simple-connect');
    expect(result.status).toBe(ResultStatus.PASSED);
    expect(result.events.length).toBeGreaterThanOrEqual(2);
  }, 20000);

  it('should detect timeout', async () => {
    const scenario = defineScenario({
      name: 'timeout-test',
      timeout: 3000,
      steps: [
        { type: StepType.CONNECT },
        { type: StepType.WAIT_EVENTS, count: 1000, timeout: 10000 }, // Will timeout
      ],
    });

    const runner = createRunner({ serverPort: 3107 });
    const result = await runner.run(scenario);

    expect(result.status).toBe(ResultStatus.TIMEOUT);
  }, 10000);

  it('should fail on assertion error', async () => {
    const scenario = defineScenario({
      name: 'assertion-fail',
      timeout: 15000,
      steps: [
        { type: StepType.CONNECT },
        { type: StepType.WAIT_CONNECTED, timeout: 5000 },
        { type: StepType.ASSERT_STATE, state: 'closed' }, // Wrong state
      ],
    });

    const runner = createRunner({ serverPort: 3106 });
    const result = await runner.run(scenario);

    expect(result.status).toBe(ResultStatus.FAILED);
    expect(result.message).toContain('Expected state closed');
  }, 20000);

  it('should validate expected outcomes', async () => {
    const scenario = defineScenario({
      name: 'expected-validation',
      timeout: 15000,
      config: {
        server: { tickInterval: 200 },
      },
      steps: [
        { type: StepType.CONNECT },
        { type: StepType.WAIT_CONNECTED, timeout: 5000 },
        { type: StepType.WAIT_EVENTS, count: 3, timeout: 5000 },
        { type: StepType.DISCONNECT },
      ],
      expected: {
        minEventsReceived: 100, // Will fail - not enough events
      },
    });

    const runner = createRunner({ serverPort: 3105 });
    const result = await runner.run(scenario);

    expect(result.status).toBe(ResultStatus.FAILED);
    expect(result.errors.some((e) => e.includes('events'))).toBe(true);
  }, 20000);
});
