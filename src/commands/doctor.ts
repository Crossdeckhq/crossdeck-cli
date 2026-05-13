/**
 * `crossdeck doctor` — install diagnostic.
 *
 *   crossdeck doctor
 *
 * Sentry/Stripe pattern: one command that validates a customer's CLI
 * setup end-to-end without uploading anything. Pre-flight check
 * before they wire it into CI.
 *
 * Checks performed (in order, stops at the first hard fail):
 *   1. Auth token resolves (from --auth-token, $CROSSDECK_SECRET_KEY,
 *      or $CROSSDECK_AUTH_TOKEN).
 *   2. Token shape — must look like cd_sk_test_… or cd_sk_live_….
 *   3. Environment is derived from the prefix:
 *        cd_sk_test_ → sandbox
 *        cd_sk_live_ → production
 *   4. Base URL is reachable (HEAD request, 5s timeout). Doesn't
 *      validate the token against the server — that's the customer's
 *      first real upload's job. Network connectivity is what we're
 *      proving here.
 *
 * Returns 0 if every check passes, non-zero on the first failure.
 */

import { CliError, resolveConfig, type ResolveOpts } from "../config.js";

export interface DoctorCommandOptions extends ResolveOpts {}

export async function doctorCommand(
  opts: DoctorCommandOptions,
): Promise<number> {
  process.stdout.write("Crossdeck CLI · install diagnostic\n");
  process.stdout.write("──────────────────────────────────\n\n");

  // ── 1. Resolve config ────────────────────────────────────────────
  let config;
  try {
    config = resolveConfig(opts);
  } catch (err) {
    if (err instanceof CliError) {
      printCheck("Auth token", false, err.message);
      return 1;
    }
    throw err;
  }
  const tokenPreview = `${config.authToken.slice(0, 12)}…${config.authToken.slice(-4)}`;
  printCheck("Auth token", true, `Resolved (${tokenPreview})`);

  // ── 2. Token shape + environment derivation ──────────────────────
  const m = /^cd_sk_(test|live)_/.exec(config.authToken);
  if (!m) {
    printCheck(
      "Token shape",
      false,
      "Token doesn't match cd_sk_test_… or cd_sk_live_…. Publishable keys (cd_pub_*) can't upload sourcemaps.",
    );
    return 1;
  }
  const inferredEnv = m[1] === "test" ? "sandbox" : "production";
  printCheck(
    "Token shape",
    true,
    `cd_sk_${m[1]}_… → environment: ${inferredEnv}`,
  );

  // ── 3. Project hint ──────────────────────────────────────────────
  if (config.projectId) {
    printCheck("Project ID", true, `${config.projectId} (from --project / env)`);
  } else {
    printCheck(
      "Project ID",
      true,
      "Not set — backend will infer from the token.",
    );
  }

  // ── 4. API reachability ──────────────────────────────────────────
  const t0 = Date.now();
  let reachable = false;
  let reachableDetail = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(config.baseUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Any HTTP response counts as reachable — even 404 / 401 means we
    // got there. Network errors throw and are caught below.
    reachable = true;
    reachableDetail = `${res.status} ${res.statusText || ""} in ${Date.now() - t0}ms`;
  } catch (err) {
    reachable = false;
    reachableDetail =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : "Unknown network error";
  }
  printCheck(
    `API reachable (${config.baseUrl})`,
    reachable,
    reachableDetail,
  );
  if (!reachable) return 1;

  process.stdout.write(
    "\n✓ All checks passed. You're ready to run `crossdeck upload-sourcemaps`.\n",
  );
  return 0;
}

function printCheck(label: string, ok: boolean, detail: string): void {
  const icon = ok ? "✓" : "✗";
  const stream = ok ? process.stdout : process.stderr;
  stream.write(`  ${icon} ${label}\n`);
  if (detail) stream.write(`    ${detail}\n`);
}
