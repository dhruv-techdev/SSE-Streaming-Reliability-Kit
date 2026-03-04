#!/usr/bin/env node
/**
 * Build Script (SSRK-220)
 * Packages library for distribution
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

console.log('í³¦ Building SSE Streaming Reliability Kit...\n');

// Clean dist
console.log('í·¹ Cleaning dist/');
try {
  rmSync(DIST, { recursive: true, force: true });
} catch (e) {
  // Ignore if doesn't exist
}

// Create dist structure
mkdirSync(DIST, { recursive: true });
mkdirSync(join(DIST, 'client'), { recursive: true });
mkdirSync(join(DIST, 'server'), { recursive: true });
mkdirSync(join(DIST, 'shared'), { recursive: true });

// Copy source files
console.log('í³ Copying source files...');

// Shared
cpSync(join(ROOT, 'shared/src'), join(DIST, 'shared'), { recursive: true });
console.log('  âœ“ shared/');

// Client
cpSync(join(ROOT, 'client/src'), join(DIST, 'client'), { recursive: true });
console.log('  âœ“ client/');

// Server
cpSync(join(ROOT, 'server/src'), join(DIST, 'server'), { recursive: true });
console.log('  âœ“ server/');

// Create main entry point
console.log('í³ Creating entry points...');

const mainIndex = `/**
 * SSE Streaming Reliability Kit
 * Main entry point
 */

// Re-export everything
export * from './shared/index.js';
export * from './client/index.js';
export * from './server/index.js';

// Version
import pkg from '../package.json' assert { type: 'json' };
export const version = pkg.version;
`;

writeFileSync(join(DIST, 'index.js'), mainIndex);
console.log('  âœ“ index.js');

// Fix import paths in dist files
console.log('í´§ Fixing import paths...');

// Simple synchronous version
import { readdirSync, statSync } from 'fs';

function fixImportsSync(dir) {
  const files = readdirSync(dir);

  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      fixImportsSync(fullPath);
    } else if (file.endsWith('.js')) {
      let content = readFileSync(fullPath, 'utf8');

      // Fix relative imports
      content = content.replace(/from ['"]\.\.\/\.\.\/shared\/src\//g, "from '../shared/");
      content = content.replace(/from ['"]\.\.\/\.\.\/client\/src\//g, "from '../client/");
      content = content.replace(/from ['"]\.\.\/\.\.\/server\/src\//g, "from '../server/");

      writeFileSync(fullPath, content);
    }
  }
}

fixImportsSync(join(DIST, 'client'));
fixImportsSync(join(DIST, 'server'));
console.log('  âœ“ Import paths fixed');

console.log('\nâœ… Build complete!\n');
console.log('Output: dist/');
console.log('  dist/index.js       - Main entry');
console.log('  dist/client/        - Client modules');
console.log('  dist/server/        - Server modules');
console.log('  dist/shared/        - Shared modules');
