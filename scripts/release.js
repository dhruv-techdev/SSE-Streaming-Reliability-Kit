#!/usr/bin/env node
/**
 * Release Script (SSRK-222)
 * Automates the release process
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function exec(cmd, options = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...options });
}

function execQuiet(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           SSE Reliability Kit - Release Script            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Check for clean working directory
  const status = execQuiet('git status --porcelain');
  if (status) {
    console.error('❌ Working directory is not clean. Commit or stash changes first.');
    process.exit(1);
  }

  // Get current version
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const currentVersion = pkg.version;
  console.log(`Current version: ${currentVersion}\n`);

  // Ask for new version
  const versionType = await ask('Version bump type (major/minor/patch/custom): ');

  let newVersion;
  if (versionType === 'custom') {
    newVersion = await ask('Enter new version: ');
  } else if (['major', 'minor', 'patch'].includes(versionType)) {
    const parts = currentVersion.split('.').map(Number);
    if (versionType === 'major') {
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
    } else if (versionType === 'minor') {
      parts[1]++;
      parts[2] = 0;
    } else {
      parts[2]++;
    }
    newVersion = parts.join('.');
  } else {
    console.error('Invalid version type');
    process.exit(1);
  }

  console.log(`\nNew version: ${newVersion}`);
  const confirm = await ask('Proceed? (y/n): ');

  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\n��� Release Checklist:\n');

  // Step 1: Run tests
  console.log('1️⃣  Running tests...');
  exec('npm test');
  console.log('   ✓ Tests passed\n');

  // Step 2: Run lint
  console.log('2️⃣  Running lint...');
  exec('npm run lint');
  console.log('   ✓ Lint passed\n');

  // Step 3: Build
  console.log('3️⃣  Building...');
  exec('npm run build');
  console.log('   ✓ Build complete\n');

  // Step 4: Update version
  console.log('4️⃣  Updating version...');
  pkg.version = newVersion;
  writeFileSync(join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  console.log(`   ✓ Updated package.json to ${newVersion}\n`);

  // Step 5: Update changelog date
  console.log('5️⃣  Updating changelog...');
  let changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const today = new Date().toISOString().split('T')[0];
  changelog = changelog.replace(`## [${newVersion}] - TBD`, `## [${newVersion}] - ${today}`);
  changelog = changelog.replace(`## [${currentVersion}] - TBD`, `## [${newVersion}] - ${today}`);
  writeFileSync(join(ROOT, 'CHANGELOG.md'), changelog);
  console.log('   ✓ Updated CHANGELOG.md\n');

  // Step 6: Commit
  console.log('6️⃣  Committing...');
  exec('git add -A');
  exec(`git commit -m "chore: release v${newVersion}"`);
  console.log('   ✓ Committed\n');

  // Step 7: Tag
  console.log('7️⃣  Creating tag...');
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`   ✓ Created tag v${newVersion}\n`);

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ RELEASE READY                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('Next steps:');
  console.log(`  1. Review the commit: git show HEAD`);
  console.log(`  2. Push to remote: git push origin main --tags`);
  console.log(`  3. Publish to npm: npm publish`);
  console.log(`  4. Create GitHub release from tag v${newVersion}`);
}

main().catch((err) => {
  console.error('Release failed:', err);
  process.exit(1);
});
