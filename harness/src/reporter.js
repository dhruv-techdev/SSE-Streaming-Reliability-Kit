/**
 * Scenario Reporter (SSRK-206)
 * Produces clean, readable scenario reports
 */

import { ResultStatus } from './runner.js';

/**
 * Report format
 */
export const ReportFormat = {
  CONSOLE: 'console',
  JSON: 'json',
  JUNIT: 'junit',
};

/**
 * Status icons
 */
const STATUS_ICONS = {
  [ResultStatus.PASSED]: '✅',
  [ResultStatus.FAILED]: '❌',
  [ResultStatus.TIMEOUT]: '⏱️',
  [ResultStatus.ERROR]: '���',
};

/**
 * Status colors (ANSI)
 */
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

/**
 * Reporter class
 */
export class Reporter {
  constructor(options = {}) {
    this.format = options.format || ReportFormat.CONSOLE;
    this.verbose = options.verbose || false;
    this.colors = options.colors !== false;
  }

  /**
   * Color helper
   */
  _color(color, text) {
    if (!this.colors) return text;
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }

  /**
   * Report single scenario result (SSRK-206)
   */
  reportScenario(result) {
    if (this.format === ReportFormat.JSON) {
      return this._reportScenarioJSON(result);
    }
    return this._reportScenarioConsole(result);
  }

  /**
   * Console format for single scenario
   */
  _reportScenarioConsole(result) {
    const lines = [];
    const icon = STATUS_ICONS[result.status];
    const statusColor = result.status === ResultStatus.PASSED ? 'green' : 'red';

    // Header
    lines.push('');
    lines.push(this._color('bold', '═'.repeat(60)));
    lines.push(
      `${icon} ${this._color('bold', result.name)}: ${this._color(statusColor, result.status)}`
    );
    lines.push(this._color('bold', '═'.repeat(60)));

    // Key metrics snapshot (SSRK-206)
    lines.push('');
    lines.push(this._color('blue', '��� Metrics:'));
    lines.push(`   Duration:          ${result.duration}ms`);
    lines.push(`   Events received:   ${result.events?.length || 0}`);

    if (result.stats) {
      lines.push(`   Reconnects:        ${result.stats.reconnectCount || 0}`);
      lines.push(`   Duplicates dropped: ${result.stats.duplicatesIgnored || 0}`);
      lines.push(`   Liveness failures: ${result.stats.livenessFailures || 0}`);
      lines.push(`   Resume attempts:   ${result.stats.resumeAttempts || 0}`);
      lines.push(`   Resume successes:  ${result.stats.resumeSuccesses || 0}`);
    }

    // Steps summary
    if (result.steps && result.steps.length > 0) {
      lines.push('');
      lines.push(this._color('blue', '��� Steps:'));

      for (const step of result.steps) {
        const stepIcon = step.status === 'passed' ? '✓' : '✗';
        const stepColor = step.status === 'passed' ? 'green' : 'red';
        lines.push(`   ${this._color(stepColor, stepIcon)} ${step.type}`);

        if (step.status === 'failed' && step.message) {
          lines.push(`     ${this._color('red', '→ ' + step.message)}`);
        }
      }
    }

    // Failing assertion details (SSRK-206)
    if (result.errors && result.errors.length > 0) {
      lines.push('');
      lines.push(this._color('red', '❌ Errors:'));
      for (const error of result.errors) {
        lines.push(`   • ${error}`);
      }
    }

    // Reason for failure
    if (result.message && result.status !== ResultStatus.PASSED) {
      lines.push('');
      lines.push(this._color('yellow', `��� ${result.message}`));
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * JSON format for single scenario
   */
  _reportScenarioJSON(result) {
    return JSON.stringify(
      {
        name: result.name,
        status: result.status,
        duration: result.duration,
        metrics: {
          eventsReceived: result.events?.length || 0,
          reconnects: result.stats?.reconnectCount || 0,
          duplicatesDropped: result.stats?.duplicatesIgnored || 0,
          livenessFailures: result.stats?.livenessFailures || 0,
          resumeAttempts: result.stats?.resumeAttempts || 0,
          resumeSuccesses: result.stats?.resumeSuccesses || 0,
        },
        steps: result.steps,
        errors: result.errors,
        message: result.message,
      },
      null,
      2
    );
  }

  /**
   * Report summary of multiple scenarios
   */
  reportSummary(results) {
    if (this.format === ReportFormat.JSON) {
      return this._reportSummaryJSON(results);
    }
    return this._reportSummaryConsole(results);
  }

  /**
   * Console format for summary
   */
  _reportSummaryConsole(results) {
    const lines = [];

    const passed = results.filter((r) => r.status === ResultStatus.PASSED).length;
    const failed = results.filter((r) => r.status === ResultStatus.FAILED).length;
    const timeout = results.filter((r) => r.status === ResultStatus.TIMEOUT).length;
    const error = results.filter((r) => r.status === ResultStatus.ERROR).length;
    const total = results.length;

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const allPassed = failed === 0 && timeout === 0 && error === 0;

    lines.push('');
    lines.push(this._color('bold', '═'.repeat(60)));
    lines.push(this._color('bold', '                    SUMMARY'));
    lines.push(this._color('bold', '═'.repeat(60)));
    lines.push('');

    // Results by status
    lines.push(this._color('green', `  ✅ Passed:   ${passed}`));
    if (failed > 0) lines.push(this._color('red', `  ❌ Failed:   ${failed}`));
    if (timeout > 0) lines.push(this._color('yellow', `  ⏱️  Timeout:  ${timeout}`));
    if (error > 0) lines.push(this._color('red', `  ��� Error:    ${error}`));
    lines.push(this._color('gray', `  ─────────────────`));
    lines.push(`  ��� Total:    ${total}`);
    lines.push('');
    lines.push(`  ⏱️  Duration: ${totalDuration}ms`);
    lines.push('');

    // Failed scenarios list
    const failedScenarios = results.filter((r) => r.status !== ResultStatus.PASSED);
    if (failedScenarios.length > 0) {
      lines.push(this._color('red', '  Failed scenarios:'));
      for (const scenario of failedScenarios) {
        lines.push(`    • ${scenario.name}: ${scenario.message || scenario.status}`);
      }
      lines.push('');
    }

    // Final verdict
    const verdict = allPassed ? 'ALL TESTS PASSED' : 'TESTS FAILED';
    const verdictColor = allPassed ? 'green' : 'red';
    lines.push(this._color('bold', '═'.repeat(60)));
    lines.push(this._color(verdictColor, `  ${allPassed ? '���' : '���'} ${verdict}`));
    lines.push(this._color('bold', '═'.repeat(60)));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * JSON format for summary
   */
  _reportSummaryJSON(results) {
    const passed = results.filter((r) => r.status === ResultStatus.PASSED).length;
    const failed = results.filter((r) => r.status !== ResultStatus.PASSED).length;

    return JSON.stringify(
      {
        summary: {
          total: results.length,
          passed,
          failed,
          duration: results.reduce((sum, r) => sum + r.duration, 0),
          allPassed: failed === 0,
        },
        results: results.map((r) => ({
          name: r.name,
          status: r.status,
          duration: r.duration,
          message: r.message,
        })),
      },
      null,
      2
    );
  }

  /**
   * Report JUnit XML format (for CI integration)
   */
  reportJUnit(results) {
    const passed = results.filter((r) => r.status === ResultStatus.PASSED).length;
    const failed = results.filter((r) => r.status !== ResultStatus.PASSED).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0) / 1000;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuite name="SSE Fault Injection" tests="${results.length}" failures="${failed}" time="${totalDuration.toFixed(3)}">\n`;

    for (const result of results) {
      const duration = (result.duration / 1000).toFixed(3);
      xml += `  <testcase name="${this._escapeXml(result.name)}" time="${duration}">\n`;

      if (result.status !== ResultStatus.PASSED) {
        const message = this._escapeXml(result.message || result.status);
        xml += `    <failure message="${message}">${this._escapeXml(result.errors?.join('\n') || '')}</failure>\n`;
      }

      xml += `  </testcase>\n`;
    }

    xml += '</testsuite>';
    return xml;
  }

  /**
   * Escape XML special characters
   */
  _escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Create reporter instance
 */
export function createReporter(options) {
  return new Reporter(options);
}

export default { Reporter, ReportFormat, createReporter };
