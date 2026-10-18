#!/usr/bin/env node
// Bumps the app version everywhere, commits, tags and pushes.
// The pushed tag triggers .github/workflows/release.yml.
//
// Usage:
//   pnpm release patch|minor|major        2.0.0 -> 2.0.1 / 2.1.0 / 3.0.0
//   pnpm release 2.1.0-beta.1             explicit version (pre-releases allowed)
//   pnpm release minor --dry-run          show what would change, touch nothing
//   pnpm release minor --no-push          commit and tag locally only
//   pnpm release minor --skip-checks      skip the preflight build checks (not recommended)
//
// Before changing anything it runs a preflight: lockfiles in sync, Tauri npm/Rust
// versions matching, frontend build, cargo check, CI green and signing secret present.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const push = !args.includes('--no-push');
const skipChecks = args.includes('--skip-checks');
const bump = args.find((a) => !a.startsWith('--'));

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim();

if (!bump) fail('specify patch, minor, major or an explicit version (e.g. 2.1.0)');

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
const m = SEMVER.exec(current);
if (!m) fail(`package.json version "${current}" is not valid semver`);

let next;
const [major, minor, patch] = [m[1], m[2], m[3]].map(Number);
if (bump === 'patch') next = m[4] ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
else if (bump === 'minor') next = `${major}.${minor + 1}.0`;
else if (bump === 'major') next = `${major + 1}.0.0`;
else if (SEMVER.test(bump.replace(/^v/, ''))) next = bump.replace(/^v/, '');
else fail(`"${bump}" is not patch, minor, major or a valid version`);

const tag = `v${next}`;

// Safety checks before touching anything.
const branch = git('rev-parse --abbrev-ref HEAD');
if (branch !== 'main') fail(`releases are cut from main (currently on ${branch})`);
if (git('status --porcelain')) fail('working tree is not clean; commit or stash first');
if (git(`tag --list ${tag}`)) fail(`tag ${tag} already exists`);

console.log(`${current} -> ${next} (${tag})`);

// Preflight: run what the release workflow would run, so a broken build fails here
// in seconds instead of on GitHub after the tag is already pushed.
if (!skipChecks) {
  const run = (cmd, cwd = root) => {
    console.log(`\n> ${cmd}`);
    try {
      execSync(cmd, { cwd, stdio: 'inherit' });
    } catch {
      fail(`preflight failed: ${cmd} (fix it, or pass --skip-checks to bypass)`);
    }
  };
  const has = (cmd) => {
    try {
      execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  if (push) {
    git('fetch origin main --tags');
    if (git('rev-list --count HEAD..origin/main') !== '0') fail('main is behind origin/main; pull first');
    if (git(`ls-remote --tags origin refs/tags/${tag}`)) fail(`tag ${tag} already exists on origin`);
  }

  if (has('gh auth status')) {
    const sha = git('rev-parse HEAD');
    let ci = [];
    try {
      ci = JSON.parse(
        execSync(`gh run list --workflow ci.yml --commit ${sha} --json conclusion --limit 1`, {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }) || '[]',
      );
    } catch {
      // ci.yml not on GitHub yet, or no run for this commit: the local build below still runs.
    }
    if (ci[0]?.conclusion === 'failure') fail(`CI failed on ${sha.slice(0, 7)}; fix it before releasing`);
    const secrets = execSync('gh secret list', { cwd: root, encoding: 'utf8' });
    if (!/^TAURI_SIGNING_PRIVATE_KEY\s/m.test(secrets)) fail('repo secret TAURI_SIGNING_PRIVATE_KEY is missing');
  } else {
    console.log('gh CLI not signed in; skipping CI status and secret checks');
  }

  run('pnpm install --frozen-lockfile');
  run('node scripts/check-tauri-versions.mjs');
  run('pnpm build');
  run('cargo check --locked', join(root, 'src-tauri'));
  console.log('\npreflight passed');
}
if (dryRun) {
  console.log('dry run: no files changed');
  process.exit(0);
}

// package.json is the source of truth (tauri.conf.json reads it); Cargo is kept in sync.
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const cargoTomlPath = join(root, 'src-tauri', 'Cargo.toml');
const cargoToml = readFileSync(cargoTomlPath, 'utf8');
writeFileSync(cargoTomlPath, cargoToml.replace(/^version = ".*"$/m, `version = "${next}"`));

const cargoLockPath = join(root, 'src-tauri', 'Cargo.lock');
const cargoLock = readFileSync(cargoLockPath, 'utf8');
writeFileSync(
  cargoLockPath,
  cargoLock.replace(/(\nname = "mditoor"\r?\nversion = )".*"/, `$1"${next}"`),
);

git('add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock');
git(`commit -m "chore(release): ${tag}"`);
git(`tag -a ${tag} -m "${tag}"`);
console.log(`committed and tagged ${tag}`);

if (push) {
  git('push origin main');
  git(`push origin ${tag}`);
  console.log(`pushed; GitHub Actions is now building ${tag}`);
} else {
  console.log(`not pushed. When ready: git push origin main && git push origin ${tag}`);
}
