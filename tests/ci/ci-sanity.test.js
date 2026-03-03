/**
 * CI Sanity Tests
 * Basic tests to verify CI pipeline works
 */
import { describe, it, expect } from 'vitest';

describe('CI Sanity', () => {
  it('should run tests', () => {
    expect(true).toBe(true);
  });

  it('should have correct Node version', () => {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    expect(major).toBeGreaterThanOrEqual(18);
  });

  it('should import shared modules', async () => {
    const shared = await import('../../../shared/src/index.js');
    expect(shared.generateEventId).toBeDefined();
    expect(shared.createEnvelope).toBeDefined();
  });

  it('should import client modules', async () => {
    const client = await import('../../../client/src/index.js');
    expect(client.connectSSE).toBeDefined();
    expect(client.SSEConnector).toBeDefined();
  });

  it('should import harness modules', async () => {
    const harness = await import('../../../harness/src/index.js');
    expect(harness.defineScenario).toBeDefined();
    expect(harness.createRunner).toBeDefined();
  });
});
