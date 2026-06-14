/**
 * Version Tests (SSRK-223)
 * Verify version consistency and release artifacts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

describe('Version & Release (SSRK-223)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  it('should have valid semver version', () => {
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
    expect(pkg.version).toMatch(semverRegex);
  });

  it('should have required package.json fields', () => {
    expect(pkg.name).toBe('sse-streaming-reliability-kit');
    expect(pkg.description).toBeDefined();
    expect(pkg.license).toBe('MIT');
    expect(pkg.main).toBeDefined();
    expect(pkg.exports).toBeDefined();
    expect(pkg.files).toBeDefined();
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toBeDefined();
  });

  it('should have correct exports', () => {
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['./client']).toBeDefined();
    expect(pkg.exports['./server']).toBeDefined();
    expect(pkg.exports['./shared']).toBeDefined();
  });

  it('should have changelog', () => {
    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('# Changelog');
    expect(changelog).toContain('## [');
    expect(changelog).toContain('### Added');
  });

  it('should have README with quick start', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('# SSE Streaming Reliability Kit');
    expect(readme).toContain('Quick Start');
    expect(readme).toContain('npm install');
  });

  it('should have LICENSE file', () => {
    const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
    expect(license).toContain('MIT License');
    expect(license).toContain('Dhruv Patel');
  });

  it('should have versioning documentation', () => {
    const versioning = readFileSync(join(ROOT, 'docs/versioning.md'), 'utf8');
    expect(versioning).toContain('Semantic Versioning');
    expect(versioning).toContain('MAJOR');
    expect(versioning).toContain('MINOR');
    expect(versioning).toContain('PATCH');
  });
});
