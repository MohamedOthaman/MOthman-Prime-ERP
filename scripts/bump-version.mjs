#!/usr/bin/env node
/**
 * Version bump script — updates version in package.json AND tauri.conf.json atomically.
 *
 * Usage:
 *   node scripts/bump-version.mjs 1.2.3          # bump to exact version
 *   node scripts/bump-version.mjs patch           # auto-bump patch (1.0.0 → 1.0.1)
 *   node scripts/bump-version.mjs minor           # auto-bump minor (1.0.0 → 1.1.0)
 *   node scripts/bump-version.mjs major           # auto-bump major (1.0.0 → 2.0.0)
 *   node scripts/bump-version.mjs 1.2.3-beta.1    # pre-release version
 *   node scripts/bump-version.mjs --tag           # also create a git tag + commit
 *   node scripts/bump-version.mjs --push          # also push tag to origin
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PKG_PATH = resolve(ROOT, "package.json");
const TAURI_PATH = resolve(ROOT, "src-tauri", "tauri.conf.json");

// ── Argument parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const createTag = args.includes("--tag") || args.includes("--push");
const pushTag = args.includes("--push");
const versionArg = args.find((a) => !a.startsWith("--"));

if (!versionArg) {
  console.error("Usage: node scripts/bump-version.mjs <version|patch|minor|major> [--tag] [--push]");
  process.exit(1);
}

// ── Read current version ──────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
const currentVersion = pkg.version;

function parseSemver(v) {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) throw new Error(`Cannot parse semver: ${v}`);
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    pre: match[4] ?? "",
  };
}

function bumpVersion(current, bump) {
  const { major, minor, patch } = parseSemver(current);
  switch (bump) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    default:
      // Treat as an explicit version string — validate it
      if (!/^\d+\.\d+\.\d+/.test(bump)) {
        throw new Error(`Invalid version: '${bump}'. Use semver (e.g. 1.2.3 or 1.2.3-beta.1)`);
      }
      return bump;
  }
}

// ── Compute new version ───────────────────────────────────────────────────────
let newVersion;
try {
  newVersion = bumpVersion(currentVersion, versionArg);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

if (newVersion === currentVersion) {
  console.log(`Version is already ${currentVersion} — nothing to do.`);
  process.exit(0);
}

// ── Update package.json ───────────────────────────────────────────────────────
pkg.version = newVersion;
writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log(`✓ package.json: ${currentVersion} → ${newVersion}`);

// ── Update tauri.conf.json ────────────────────────────────────────────────────
const tauriConf = JSON.parse(readFileSync(TAURI_PATH, "utf8"));
const prevTauriVersion = tauriConf.version;
tauriConf.version = newVersion;
writeFileSync(TAURI_PATH, JSON.stringify(tauriConf, null, 2) + "\n", "utf8");
console.log(`✓ tauri.conf.json: ${prevTauriVersion} → ${newVersion}`);

// ── Git commit + tag ──────────────────────────────────────────────────────────
if (createTag) {
  try {
    execSync(`git add "${PKG_PATH}" "${TAURI_PATH}"`, { stdio: "inherit" });
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: "inherit" });
    execSync(`git tag -a "v${newVersion}" -m "Release v${newVersion}"`, { stdio: "inherit" });
    console.log(`✓ Git commit + tag: v${newVersion}`);

    if (pushTag) {
      execSync(`git push origin "v${newVersion}"`, { stdio: "inherit" });
      execSync(`git push`, { stdio: "inherit" });
      console.log(`✓ Pushed v${newVersion} to origin`);
      console.log(`\n🚀 GitHub Actions release pipeline will start automatically.`);
      console.log(`   Monitor at: https://github.com/MohamedOthaman/MOthman-Prime-ERP/actions`);
    } else {
      console.log(`\nTag created locally. Push with:`);
      console.log(`  git push && git push origin v${newVersion}`);
    }
  } catch (err) {
    console.error(`Git error: ${err.message}`);
    process.exit(1);
  }
}

console.log(`\nDone. New version: ${newVersion}`);
