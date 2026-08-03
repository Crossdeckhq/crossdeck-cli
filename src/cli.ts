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
import { loginCommand } from "./commands/login.js";
import { whoamiCommand } from "./commands/whoami.js";
import { logoutCommand } from "./commands/logout.js";
import { initCommand } from "./commands/init.js";
import { projectsCreateCommand, projectsListCommand } from "./commands/projects.js";
import { appsCreateCommand, appsListCommand } from "./commands/apps.js";
import { useCommand } from "./commands/use.js";
import { revenueCommand, analyticsCommand, errorsCommand } from "./commands/monitor.js";
import { renderLauncher, setLauncherVersion } from "./launcher.js";
import { renderHelp, setHelpVersion } from "./help.js";

const VERSION = "1.3.0";
setLauncherVersion(VERSION);
setHelpVersion(VERSION);

const program = new Command();

program
  .name("crossdeck")
  .description(
    "Crossdeck CLI — sign in, provision projects & apps, and monitor errors, analytics, and revenue from your terminal.",
  )
  .version(VERSION)
  // We render our own premium `help` (see below) instead of commander's default.
  .helpCommand(false);

// ── Account (OAuth) ──────────────────────────────────────────────────────────
// The provisioning / monitoring family. Interactive `crossdeck login` (RFC 8252
// loopback + PKCE) — distinct from the CI / source-map family below, which is
// key-based (cd_sk_) and never logs in.
program
  .command("login")
  .description("Sign in to Crossdeck in your browser (OAuth). Grants this machine provisioning + read access.")
  .option("--read-only", "Request read-only scope (no project/app/key creation).", false)
  .option("--scope <scope>", "Override the exact space-separated OAuth scope to request.")
  .option("--no-browser", "Print the sign-in URL instead of opening a browser (headless machines).")
  .option("--base-url <url>", "Crossdeck API base URL. Defaults to https://api.cross-deck.com.")
  .action(async (opts) => {
    process.exit(
      await loginCommand({ baseUrl: opts.baseUrl, readOnly: opts.readOnly, scope: opts.scope, noBrowser: opts.browser === false }),
    );
  });

program
  .command("whoami")
  .description("Show the active Crossdeck session — the API it targets, granted scopes, and portfolio size.")
  .option("--base-url <url>", "Crossdeck API base URL. Defaults to the one you logged in against.")
  .action(async (opts) => {
    process.exit(await whoamiCommand({ baseUrl: opts.baseUrl }));
  });

program
  .command("logout")
  .description("Sign out on this machine (wipes the stored credential).")
  .action(async () => {
    process.exit(await logoutCommand());
  });

// ── Provisioning (needs `crossdeck login`) ───────────────────────────────────
program
  .command("init")
  .description("Zero to installed: create a project + app, mint keys, and print the SDK snippet.")
  .option("-n, --name <name>", "Project name.")
  .option("-P, --platform <platform>", "App platform: web, ios, or android.", "web")
  .option("--domain <domain>", "Web app domain (optional — origins self-learn on first heartbeat).")
  .option("--bundle-id <id>", "iOS bundle id.")
  .option("--package-name <name>", "Android package name.")
  .option("--env-file [path]", "Write the publishable keys to an env file (default .env).")
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await initCommand({ name: opts.name, platform: opts.platform, domain: opts.domain, bundleId: opts.bundleId, packageName: opts.packageName, envFile: opts.envFile, baseUrl: opts.baseUrl }));
  });

const projects = program.command("projects").description("Create and list Crossdeck projects.");
projects
  .command("create")
  .description("Create a new project.")
  .requiredOption("-n, --name <name>", "Project name.")
  .option("--business-model <model>", "e.g. subscription, one-time, freemium.")
  .option("--activate", "Set the new project as active.", false)
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await projectsCreateCommand({ name: opts.name, businessModel: opts.businessModel, activate: opts.activate, json: opts.json, baseUrl: opts.baseUrl }));
  });
projects
  .command("list")
  .description("List projects you own.")
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await projectsListCommand({ json: opts.json, baseUrl: opts.baseUrl }));
  });

const apps = program.command("apps").description("Create and list apps + their publishable keys.");
apps
  .command("create")
  .description("Create an app in a project and mint its first publishable keys.")
  .requiredOption("-P, --platform <platform>", "web, ios, or android.")
  .option("-p, --project <id>", "Project id (defaults to the active project).")
  .option("--domain <domain>", "Web app domain.")
  .option("--bundle-id <id>", "iOS bundle id.")
  .option("--package-name <name>", "Android package name.")
  .option("--origin <origin...>", "Seed one or more web origins now (else learned on first heartbeat).")
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await appsCreateCommand({ project: opts.project, platform: opts.platform, domain: opts.domain, bundleId: opts.bundleId, packageName: opts.packageName, origin: opts.origin, json: opts.json, baseUrl: opts.baseUrl }));
  });
apps
  .command("list")
  .description("List apps (all, or one project's).")
  .option("-p, --project <id>", "Filter to one project.")
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await appsListCommand({ project: opts.project, json: opts.json, baseUrl: opts.baseUrl }));
  });

program
  .command("use")
  .description("Set (or show) the active project for subsequent commands.")
  .argument("[project-id]", "Project id to make active. Omit to show the current one.")
  .action(async (projectId) => {
    process.exit(await useCommand(projectId));
  });

// ── Monitoring (read APIs; needs login) ──────────────────────────────────────
program
  .command("revenue")
  .description("Recognised cash for a project (GET /v1/revenue).")
  .option("-p, --project <id>", "Project id (defaults to the active project).")
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await revenueCommand({ project: opts.project, json: opts.json, baseUrl: opts.baseUrl }));
  });
program
  .command("analytics")
  .description("Signup acquisition sources for a project (GET /v1/acquisition).")
  .option("-p, --project <id>", "Project id (defaults to the active project).")
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await analyticsCommand({ project: opts.project, json: opts.json, baseUrl: opts.baseUrl }));
  });
program
  .command("errors")
  .description("One error issue with the moat stitch — who it hit, how many pay (GET /v1/errors).")
  .requiredOption("-i, --issue <fingerprint>", "The issue fingerprint (from the Errors tab).")
  .option("-p, --project <id>", "Project id (defaults to the active project).")
  .option("--json", "Output the raw JSON envelope.", false)
  .option("--base-url <url>", "Crossdeck API base URL.")
  .action(async (opts) => {
    process.exit(await errorsCommand({ project: opts.project, issue: opts.issue, json: opts.json, baseUrl: opts.baseUrl }));
  });

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

// Namespaced form `crossdeck sourcemaps upload` — the canonical name in the docs.
// `upload-sourcemaps` above stays as a permanent alias so nothing already shipped
// (the dashboard Errors tab instructions) breaks. Same key-based CI flow, no login.
const sourcemaps = program.command("sourcemaps").description("Source-map management for readable production stack traces.");
sourcemaps
  .command("upload")
  .description("Upload .map files from a build directory so the dashboard can resolve minified frames.")
  .argument("<dist-dir>", "Path to your build's dist directory (e.g. ./dist or ./build)")
  .requiredOption("-r, --release <version>", "Release version this build represents (e.g. v1.2.3, commit-abc1234)")
  .requiredOption("-u, --url-prefix <url>", "Where the bundles are served from (e.g. https://app.example.com/static/js/ or app:///).")
  .option("-e, --environment <env>", "Target environment: production or sandbox", "production")
  .option("-t, --auth-token <token>", "Crossdeck secret key. Defaults to $CROSSDECK_SECRET_KEY / $CROSSDECK_AUTH_TOKEN.")
  .option("-p, --project <id>", "Crossdeck project ID. Defaults to $CROSSDECK_PROJECT_ID.")
  .option("--base-url <url>", "Crossdeck API base URL. Defaults to https://api.cross-deck.com.")
  .option("-v, --verbose", "Print every discovered file + skipped reason", false)
  .action(async (distDir: string, opts) => {
    process.exit(await uploadSourcemapsCommand(distDir, opts));
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

// ── The launcher (`crossdeck` with no subcommand) ────────────────────────────
// The brand's first impression: State 1 (logged out) or State 2 (logged in).
// Rendered BEFORE commander parses so a bare `crossdeck` is the splash, not a
// help dump. `--help`/`-h` and `help` still route through commander below.
program
  .command("help")
  .argument("[command]", "Show flags for one command instead of the whole tree.")
  .description("Show the command tree, or one command's flags.")
  .action((command?: string) => {
    if (!command) {
      renderHelp();
      process.exit(0);
    }
    const target = program.commands.find((cmd) => cmd.name() === command);
    if (target) {
      target.outputHelp();
      process.exit(0);
    }
    process.stderr.write(`Unknown command: ${command}\n`);
    renderHelp();
    process.exit(1);
  });

if (process.argv.length <= 2) {
  renderLauncher();
  process.exit(0);
}

program.parseAsync(process.argv).catch((err) => {
  // Commander already prints its own error; this catches anything our
  // own code throws past the action handler.
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
