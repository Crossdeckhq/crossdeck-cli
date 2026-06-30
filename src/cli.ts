/**
 * `crossdeck` CLI entry point.
 *
 * Built with `commander` — same parser Sentry, Vercel, and most
 * modern Node CLIs use. Argument parsing, --help generation, version
 * resolution all come for free.
 *
 * v1 ships exactly one command: `upload-sourcemaps`. More commands
 * (releases new/list, delete, doctor) land in v2 once we've got the
 * batch upload flow well-trodden in production.
 *
 * Bin entry: ./dist/cli.cjs (declared in package.json#bin.crossdeck).
 * tsup adds the `#!/usr/bin/env node` shebang at build time.
 */

import { Command } from "commander";

import { doctorCommand } from "./commands/doctor.js";
import { uploadSourcemapsCommand } from "./commands/upload-sourcemaps.js";

const VERSION = "1.1.2";

const program = new Command();

program
  .name("crossdeck")
  .description(
    "Crossdeck CLI — upload source maps so production stack traces resolve back to original file:line:function.",
  )
  .version(VERSION);

program
  .command("upload-sourcemaps")
  .description(
    "Upload .map files from a build directory so the dashboard can resolve minified frames.",
  )
  .argument("<dist-dir>", "Path to your build's dist directory (e.g. ./dist or ./build)")
  .requiredOption(
    "-r, --release <version>",
    "Release version this build represents (e.g. v1.2.3, commit-abc1234)",
  )
  .requiredOption(
    "-u, --url-prefix <url>",
    "Where the bundles are served from. Browser: https://app.example.com/static/js/. Server-side / Node: app:///. Sentry-style sentinel schemes (app://, webpack://, capacitor://) are accepted.",
  )
  .option(
    "-e, --environment <env>",
    "Target environment: production or sandbox",
    "production",
  )
  .option(
    "-t, --auth-token <token>",
    "Crossdeck secret key (cd_sk_test_… or cd_sk_live_…). Defaults to $CROSSDECK_SECRET_KEY (canonical) or $CROSSDECK_AUTH_TOKEN (back-compat).",
  )
  .option(
    "-p, --project <id>",
    "Crossdeck project ID. Optional — the backend infers it from the secret key. Defaults to $CROSSDECK_PROJECT_ID.",
  )
  .option(
    "--base-url <url>",
    "Crossdeck API base URL. Defaults to https://api.cross-deck.com.",
  )
  .option("-v, --verbose", "Print every discovered file + skipped reason", false)
  .action(async (distDir: string, opts) => {
    const exitCode = await uploadSourcemapsCommand(distDir, opts);
    process.exit(exitCode);
  });

program
  .command("doctor")
  .description(
    "Validate your CLI setup — checks auth token, environment, and API reachability without uploading anything.",
  )
  .option(
    "-t, --auth-token <token>",
    "Crossdeck secret key. Defaults to $CROSSDECK_SECRET_KEY (canonical) or $CROSSDECK_AUTH_TOKEN (back-compat).",
  )
  .option(
    "-p, --project <id>",
    "Crossdeck project ID. Defaults to $CROSSDECK_PROJECT_ID.",
  )
  .option(
    "--base-url <url>",
    "Crossdeck API base URL. Defaults to https://api.cross-deck.com.",
  )
  .action(async (opts) => {
    const exitCode = await doctorCommand(opts);
    process.exit(exitCode);
  });

program.parseAsync(process.argv).catch((err) => {
  // Commander already prints its own error; this catches anything our
  // own code throws past the action handler.
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
