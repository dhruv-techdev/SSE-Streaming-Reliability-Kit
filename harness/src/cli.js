#!/usr/bin/env node
/**
 * Harness CLI (SSRK-191)
 * Command-line interface for running fault injection scenarios
 */
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRunner, ResultStatus } from './runner.js';

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
        const modulePath = join(SCENARIOS_DIR, file);
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
  --port <port>           Server port (default: 3099)

Examples:
  npm run harness list
  npm run harness run drop-mid-stream
  npm run harness run-all
  npm run harness run-tag reconnect
`);
}

/**
 * Print result
 */
function printResult(result) {
  const statusIcon = {
    [ResultStatus.PASSED]: '✅',
    [ResultStatus.FAILED]: '❌',
    [ResultStatus.TIMEOUT]: '⏱️',
    [ResultStatus.ERROR]: '���',
  };

  console.log(`\n${statusIcon[result.status]} ${result.name}: ${result.status}`);
  console.log(`   Duration: ${result.duration}ms`);
  console.log(`   Events received: ${result.events.length}`);
  
  if (result.stats) {
    console.log(`   Reconnects: ${result.stats.reconnectCount}`);
    console.log(`   Duplicates ignored: ${result.stats.duplicatesIgnored}`);
  }

  if (result.errors.length > 0) {
    console.log(`   Errors:`);
    result.errors.forEach(err => console.log(`     - ${err}`));
  }

  if (result.message) {
    console.log(`   Message: ${result.message}`);
  }
}

/**
 * Main CLI function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const debug = args.includes('--debug');
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : 3099;

  const scenarios = await loadScenarios();
  const scenarioNames = Object.keys(scenarios);

  if (command === 'list') {
    console.log('\n��� Available Scenarios:\n');
    
    for (const [name, scenario] of Object.entries(scenarios)) {
      const tags = scenario.tags?.length > 0 ? ` [${scenario.tags.join(', ')}]` : '';
      console.log(`  • ${name}${tags}`);
      console.log(`    ${scenario.description || 'No description'}`);
    }
    
    console.log(`\nTotal: ${scenarioNames.length} scenarios\n`);
    process.exit(0);
  }

  if (command === 'run') {
    const scenarioName = args[1];
    
    if (!scenarioName) {
      console.error('Error: Scenario name required');
      printUsage();
      process.exit(1);
    }

    const scenario = scenarios[scenarioName];
    
    if (!scenario) {
      console.error(`Error: Unknown scenario "${scenarioName}"`);
      console.log(`Available: ${scenarioNames.join(', ')}`);
      process.exit(1);
    }

    console.log(`\n��� Running scenario: ${scenarioName}`);
    
    const runner = createRunner({ debug, serverPort: port });
    const result = await runner.run(scenario);
    
    printResult(result);
    process.exit(result.status === ResultStatus.PASSED ? 0 : 1);
  }

  if (command === 'run-all') {
    console.log(`\n��� Running all ${scenarioNames.length} scenarios\n`);
    
    const results = [];
    const runner = createRunner({ debug, serverPort: port });

    for (const scenario of Object.values(scenarios)) {
      console.log(`Running: ${scenario.name}...`);
      const result = await runner.run(scenario);
      results.push(result);
      printResult(result);
    }

    // Summary
    const passed = results.filter(r => r.status === ResultStatus.PASSED).length;
    const failed = results.filter(r => r.status !== ResultStatus.PASSED).length;

    console.log('\n' + '═'.repeat(60));
    console.log(`\n��� Summary: ${passed} passed, ${failed} failed\n`);
    
    process.exit(failed > 0 ? 1 : 0);
  }

  if (command === 'run-tag') {
    const tag = args[1];
    
    if (!tag) {
      console.error('Error: Tag required');
      printUsage();
      process.exit(1);
    }

    const taggedScenarios = Object.values(scenarios).filter(
      s => s.tags?.includes(tag)
    );

    if (taggedScenarios.length === 0) {
      console.error(`Error: No scenarios found with tag "${tag}"`);
      process.exit(1);
    }

    console.log(`\n��� Running ${taggedScenarios.length} scenarios with tag "${tag}"\n`);
    
    const results = [];
    const runner = createRunner({ debug, serverPort: port });

    for (const scenario of taggedScenarios) {
      console.log(`Running: ${scenario.name}...`);
      const result = await runner.run(scenario);
      results.push(result);
      printResult(result);
    }

    const passed = results.filter(r => r.status === ResultStatus.PASSED).length;
    const failed = results.filter(r => r.status !== ResultStatus.PASSED).length;

    console.log('\n' + '═'.repeat(60));
    console.log(`\n��� Summary: ${passed} passed, ${failed} failed\n`);
    
    process.exit(failed > 0 ? 1 : 0);
  }

  console.error(`Error: Unknown command "${command}"`);
  printUsage();
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
