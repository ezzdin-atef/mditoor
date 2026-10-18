#!/usr/bin/env node
// Fails when a Tauri Rust crate (from src-tauri/Cargo.lock) and its npm package
// (from node_modules) are on different major.minor versions. `tauri build` runs the
// same check, but only after several minutes of setup; this catches it in a second.
//
// Usage: node scripts/check-tauri-versions.mjs   (after `pnpm install`)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const lock = readFileSync(join(root, 'src-tauri', 'Cargo.lock'), 'utf8');
const crates = new Map();
for (const [, name, version] of lock.matchAll(/\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"/g)) {
  if (!crates.has(name)) crates.set(name, version);
}

// Same pairing rule the Tauri CLI uses.
const npmNameFor = (crate) => {
  if (crate === 'tauri') return '@tauri-apps/api';
  const plugin = /^tauri-plugin-(.+)$/.exec(crate);
  return plugin ? `@tauri-apps/plugin-${plugin[1]}` : null;
};

const majorMinor = (v) => v.split('.').slice(0, 2).join('.');

const mismatches = [];
let compared = 0;
for (const [crate, crateVersion] of crates) {
  const npmName = npmNameFor(crate);
  if (!npmName) continue;
  const pkgJson = join(root, 'node_modules', ...npmName.split('/'), 'package.json');
  if (!existsSync(pkgJson)) continue; // Rust-only plugin, nothing to match
  const npmVersion = JSON.parse(readFileSync(pkgJson, 'utf8')).version;
  compared++;
  if (majorMinor(crateVersion) !== majorMinor(npmVersion)) {
    mismatches.push(`  ${crate} (v${crateVersion}) : ${npmName} (v${npmVersion})`);
  }
}

if (compared === 0) {
  console.error('check-tauri-versions: no @tauri-apps packages found; run `pnpm install` first');
  process.exit(1);
}
if (mismatches.length) {
  console.error('Tauri Rust crates and npm packages are on different major.minor versions:');
  console.error(mismatches.join('\n'));
  console.error('Align them, e.g. `pnpm add @tauri-apps/api@~X.Y.0` or `cargo update -p <crate> --precise X.Y.Z`.');
  process.exit(1);
}
console.log(`check-tauri-versions: ${compared} Tauri package pairs in sync`);
