#!/usr/bin/env node
/**
 * Harness CLI (SSRK-191, SSRK-206, SSRK-207)
 * Command-line interface with clean output and CI-friendly exit codes
 */
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRunner, ResultStatus } from './runner.js';
import { createReporter, ReportFormat } from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, '..', 'scenarios');

/**
 * Load all scenarios from the scenarios directory
 */
async function loadScenarios() {
  const scenarios = {};

  try {
    const files = await readdir(SCENARIOS_DIR);

    for (const file of files) {
      if (file.endsWith('.js')) {
        const modulePath = pathToFileURL(join(SCENARIOS_DIR, file)).href;
        const module = await import(modulePath);

        if (module.default) {
          scenarios[module.default.name] = module.default;
        }
      }
    }
  } catch (err) {
    console.error('Error loading scenarios:', err.message);
  }

  return scenarios;
}

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const parsed = {
    command: args[0],
    scenario: null,
    tag: null,
    debug: false,
    port: 3099,
    format: 'console',
    failFast: false,
    verbose: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--debug') {
      parsed.debug = true;
    } else if (arg === '--fail-fast') {
      parsed.failFast = true;
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    } else if (arg === '--port' && args[i + 1]) {
      parsed.port = parseInt(args[++i]);
    } else if (arg === '--format' && args[i + 1]) {
      parsed.format = args[++i];
    } else if (!parsed.scenario && !arg.startsWith('-')) {
      parsed.scenario = arg;
      parsed.tag = arg; // Also used as tag for run-tag command
    }
  }

  return parsed;
}

/**
 * Print usage
 */
function printUsage() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           SSE Fault Injection Test Harness                ║
╚═══════════════════════════════════════════════════════════╝

Usage:
  npm run harness <command> [options]

Commands:
  list                    List all available scenarios
  run <scenario>          Run a specific scenario by name
  run-all                 Run all scenarios
  run-tag <tag>           Run all scenarios with a specific tag

Options:
  --debug                 Enable debug output
  --verbose, -v           Verbose output
  --fail-fast             Stop on first failure
  --port <port>           Server port (default: 3099)
  --format <format>       Output format: console, json, junit

Exit Codes:
  0                       All scenarios passed
  1                       One or more scenarios failed
  2                       Error running harness

Examples:
  npm run harness list
  npm run harness run drop-mid-stream
  npm run harness run-all --fail-fast
  npm run harness run-tag reconnect --format json
`);
}

/**
 * Main CLI function (SSRK-207)
 */
async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed.command || parsed.command === 'help' || parsed.command === '--help') {
    printUsage();
    process.exit(0); // SSRK-207: Exit 0 for help
  }

  const reporter = createReporter({
    format: parsed.format === 'json' ? ReportFormat.JSON : ReportFormat.CONSOLE,
    verbose: parsed.verbose,
  });

  const scenarios = await loadScenarios();
  const scenarioNames = Object.keys(scenarios);

  if (parsed.command === 'list') {
    console.log('\n��� Available Scenarios:\n');

    for (const [name, scenario] of Object.entries(scenarios)) {
      const tags = scenario.tags?.length > 0 ? ` [${scenario.tags.join(', ')}]` : '';
      console.log(`  • ${name}${tags}`);
      console.log(`    ${scenario.description || 'No description'}`);
    }

    console.log(`\nTotal: ${scenarioNames.length} scenarios\n`);
    process.exit(0); // SSRK-207: Exit 0 for list
  }

  if (parsed.command === 'run') {
    if (!parsed.scenario) {
      console.error('Error: Scenario name required');
      printUsage();
      process.exit(2); // SSRK-207: Exit 2 for error
    }

    const scenario = scenarios[parsed.scenario];

    if (!scenario) {
      console.error(`Error: Unknown scenario "${parsed.scenario}"`);
      console.log(`Available: ${scenarioNames.join(', ')}`);
      process.exit(2); // SSRK-207: Exit 2 for error
    }

    console.log(`\n��� Running scenario: ${parsed.scenario}`);

    const runner = createRunner({
      debug: parsed.debug,
      serverPort: parsed.port,
      failFast: parsed.failFast,
    });

    const result = await runner.run(scenario);

    // Print report (SSRK-206)
    console.log(reporter.reportScenario(result));

    // SSRK-207: Exit code based on result
    process.exit(result.status === ResultStatus.PASSED ? 0 : 1);
  }

  if (parsed.command === 'run-all') {
    console.log(`\n��� Running all ${scenarioNames.length} scenarios\n`);

    const runner = createRunner({
      debug: parsed.debug,
      serverPort: parsed.port,
      failFast: parsed.failFast,
    });

    const { results, aborted, duration } = await runner.runAll(Object.values(scenarios));

    // Print individual results
    for (const result of results) {
      console.log(reporter.reportScenario(result));
    }

    // Print summary (SSRK-206)
    console.log(reporter.reportSummary(results));

    if (aborted) {
      console.log('⚠️  Run was aborted (fail-fast or timeout)\n');
    }

    // SSRK-207: Exit code
    const failed = results.filter((r) => r.status !== ResultStatus.PASSED).length;
    process.exit(failed > 0 ? 1 : 0);
  }

  if (parsed.command === 'run-tag') {
    if (!parsed.tag) {
      console.error('Error: Tag required');
      printUsage();
      process.exit(2);
    }

    const taggedScenarios = Object.values(scenarios).filter((s) => s.tags?.includes(parsed.tag));

    if (taggedScenarios.length === 0) {
      console.error(`Error: No scenarios found with tag "${parsed.tag}"`);
      process.exit(2);
    }

    console.log(`\n��� Running ${taggedScenarios.length} scenarios with tag "${parsed.tag}"\n`);

    const runner = createRunner({
      debug: parsed.debug,
      serverPort: parsed.port,
      failFast: parsed.failFast,
    });

    const { results, aborted } = await runner.runAll(taggedScenarios);

    for (const result of results) {
      console.log(reporter.reportScenario(result));
    }

    console.log(reporter.reportSummary(results));

    const failed = results.filter((r) => r.status !== ResultStatus.PASSED).length;
    process.exit(failed > 0 ? 1 : 0);
  }

  console.error(`Error: Unknown command "${parsed.command}"`);
  printUsage();
  process.exit(2);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2); // SSRK-207: Exit 2 for error
});
