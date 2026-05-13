#!/usr/bin/env node
/**
 * One-time setup: creates the `release-channels` orphan branch that stores
 * the update channel manifests (stable.json, beta.json, internal.json).
 *
 * Run once from the main branch BEFORE publishing your first release:
 *   node scripts/init-release-channels.mjs
 *
 * This creates the branch locally and pushes it to origin.
 * After this, the GitHub Actions release workflow manages the files.
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT }).toString().trim();
}

const EMPTY_MANIFEST = JSON.stringify(
  {
    version: "0.0.0",
    notes: "No releases yet",
    pub_date: new Date().toISOString(),
    platforms: {},
  },
  null,
  2
);

const currentBranch = runCapture("git rev-parse --abbrev-ref HEAD");

try {
  // Check if the branch already exists on the remote
  const remoteExists = runCapture(
    "git ls-remote --heads origin release-channels"
  );

  if (remoteExists.includes("release-channels")) {
    console.log("✓ release-channels branch already exists on origin.");
    console.log(
      "  If you need to reset it, delete the branch first: git push origin --delete release-channels"
    );
    process.exit(0);
  }

  console.log("\nCreating orphan branch: release-channels");

  // Create an orphan branch (no history)
  run("git checkout --orphan release-channels");

  // Remove everything from the index
  run("git rm -rf .");

  // Create the channels directory and placeholder manifests
  mkdirSync(resolve(ROOT, "channels"), { recursive: true });

  for (const channel of ["stable", "beta", "internal"]) {
    writeFileSync(resolve(ROOT, "channels", `${channel}.json`), EMPTY_MANIFEST + "\n");
    console.log(`  Created channels/${channel}.json`);
  }

  writeFileSync(
    resolve(ROOT, "README.md"),
    `# Food Choice ERP — Release Channels\n\nThis branch stores update manifest files for the Tauri auto-updater.\n\nDo NOT edit these files manually — they are updated automatically by the\nGitHub Actions release workflow.\n\n## Channels\n\n| Channel  | File               | Audience                  |\n|----------|--------------------|---------------------------|\n| stable   | channels/stable.json   | All production users      |\n| beta     | channels/beta.json     | QA / advanced users       |\n| internal | channels/internal.json | Developers / CI only      |\n`
  );

  run("git add .");
  run('git commit -m "chore: initialize release-channels branch"');
  run("git push -u origin release-channels");

  console.log("\n✓ release-channels branch created and pushed to origin.");
  console.log("  The GitHub Actions release workflow will update it on each release.\n");
} catch (err) {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
} finally {
  // Return to the original branch
  try {
    run(`git checkout ${currentBranch}`);
  } catch {
    run("git checkout main");
  }
}
