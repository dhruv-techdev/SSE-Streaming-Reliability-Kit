/**
 * Reporter Tests (SSRK-206)
 */
import { describe, it, expect } from 'vitest';
import { Reporter, ReportFormat, createReporter } from '../../harness/src/reporter.js';
import { ResultStatus } from '../../harness/src/runner.js';

describe('Reporter (SSRK-206)', () => {
  describe('Console format', () => {
    it('should format passed scenario', () => {
      const reporter = createReporter({ colors: false });

      const result = {
        name: 'test-scenario',
        status: ResultStatus.PASSED,
        duration: 1500,
        events: [{ id: 1 }, { id: 2 }],
        stats: {
          reconnectCount: 1,
          duplicatesIgnored: 0,
          livenessFailures: 0,
          resumeAttempts: 1,
          resumeSuccesses: 1,
        },
        steps: [
          { type: 'connect', status: 'passed' },
          { type: 'wait_events', status: 'passed' },
        ],
        errors: [],
        message: '',
      };

      const output = reporter.reportScenario(result);

      expect(output).toContain('test-scenario');
      expect(output).toContain('PASSED');
      expect(output).toContain('1500ms');
      expect(output).toContain('Events received:   2');
    });

    it('should format failed scenario with errors', () => {
      const reporter = createReporter({ colors: false });

      const result = {
        name: 'failing-scenario',
        status: ResultStatus.FAILED,
        duration: 500,
        events: [],
        stats: { reconnectCount: 0 },
        steps: [
          { type: 'connect', status: 'passed' },
          { type: 'assert_state', status: 'failed', message: 'Expected open, got closed' },
        ],
        errors: ['Expected open, got closed'],
        message: 'Step 1 failed',
      };

      const output = reporter.reportScenario(result);

      expect(output).toContain('FAILED');
      expect(output).toContain('Expected open, got closed');
      expect(output).toContain('Errors');
    });
  });

  describe('JSON format', () => {
    it('should output valid JSON', () => {
      const reporter = createReporter({ format: ReportFormat.JSON });

      const result = {
        name: 'json-test',
        status: ResultStatus.PASSED,
        duration: 1000,
        events: [{ id: 1 }],
        stats: { reconnectCount: 0 },
        steps: [],
        errors: [],
        message: '',
      };

      const output = reporter.reportScenario(result);
      const parsed = JSON.parse(output);

      expect(parsed.name).toBe('json-test');
      expect(parsed.status).toBe('PASSED');
      expect(parsed.metrics.eventsReceived).toBe(1);
    });
  });

  describe('Summary', () => {
    it('should summarize multiple results', () => {
      const reporter = createReporter({ colors: false });

      const results = [
        { name: 'test1', status: ResultStatus.PASSED, duration: 1000, message: '' },
        { name: 'test2', status: ResultStatus.PASSED, duration: 500, message: '' },
        { name: 'test3', status: ResultStatus.FAILED, duration: 200, message: 'Error' },
      ];

      const output = reporter.reportSummary(results);

      expect(output).toContain('Passed:   2');
      expect(output).toContain('Failed:   1');
      expect(output).toContain('Total:    3');
      expect(output).toContain('TESTS FAILED');
    });

    it('should show all passed when no failures', () => {
      const reporter = createReporter({ colors: false });

      const results = [
        { name: 'test1', status: ResultStatus.PASSED, duration: 1000 },
        { name: 'test2', status: ResultStatus.PASSED, duration: 500 },
      ];

      const output = reporter.reportSummary(results);

      expect(output).toContain('ALL TESTS PASSED');
    });
  });

  describe('JUnit format', () => {
    it('should output valid JUnit XML', () => {
      const reporter = createReporter();

      const results = [
        { name: 'passing', status: ResultStatus.PASSED, duration: 1000 },
        {
          name: 'failing',
          status: ResultStatus.FAILED,
          duration: 500,
          message: 'Error',
          errors: ['Details'],
        },
      ];

      const xml = reporter.reportJUnit(results);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<testsuite');
      expect(xml).toContain('tests="2"');
      expect(xml).toContain('failures="1"');
      expect(xml).toContain('<testcase name="passing"');
      expect(xml).toContain('<failure');
    });
  });
});
