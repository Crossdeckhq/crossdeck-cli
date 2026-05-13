/**
 * CLI configuration resolution.
 *
 * Resolution order (highest priority first):
 *
 *   authToken:
 *     1. --auth-token <key>             (explicit flag)
 *     2. CROSSDECK_SECRET_KEY env var   (canonical — matches the SDKs)
 *     3. CROSSDECK_AUTH_TOKEN env var   (back-compat alias for v1.0.x)
 *
 *   projectId:
 *     1. --project <id>
 *     2. CROSSDECK_PROJECT_ID env var
 *     (Optional — the backend infers projectId from the secret key.
 *     The flag exists so multi-project workspaces can sanity-check
 *     they're hitting the right tenant before pushing maps.)
 *
 *   baseUrl:
 *     1. --base-url <url>
 *     2. CROSSDECK_BASE_URL env var
 *     3. https://api.cross-deck.com    (default)
 *
 * No automatic refresh, no rotation tokens — `cd_sk_*` is a long-lived
 * credential. Customers rotate via the dashboard's Rotate button on
 * the API Keys page; the CLI just consumes whatever's current.
 */

import type { CliConfig } from "./types.js";

export interface ResolveOpts {
  authToken?: string;
  project?: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.cross-deck.com";

export function resolveConfig(opts: ResolveOpts): CliConfig {
  // ── authToken ─────────────────────────────────────────────────────
  // CROSSDECK_SECRET_KEY is the canonical env var (matches every SDK
  // we publish). CROSSDECK_AUTH_TOKEN is honoured as a back-compat
  // alias for users who set it during the v1.0.x window when the CLI
  // used that name.
  const authToken =
    (opts.authToken && opts.authToken.trim()) ||
    (process.env.CROSSDECK_SECRET_KEY && process.env.CROSSDECK_SECRET_KEY.trim()) ||
    (process.env.CROSSDECK_AUTH_TOKEN && process.env.CROSSDECK_AUTH_TOKEN.trim());
  if (!authToken) {
    throw new CliError(
      "No Crossdeck secret key found. Set CROSSDECK_SECRET_KEY or pass --auth-token.\n" +
        "Get one at https://cross-deck.com/dashboard/developers/api-keys/",
    );
  }
  if (!/^cd_sk_(?:test|live)_/.test(authToken)) {
    throw new CliError(
      `Auth token doesn't look like a Crossdeck secret key. Expected prefix "cd_sk_test_" or "cd_sk_live_", got: ${authToken.slice(0, 12)}…\n\n` +
        "Publishable keys (cd_pub_) cannot upload sourcemaps — they're client-only.",
    );
  }

  // ── projectId (optional) ──────────────────────────────────────────
  const projectId =
    (opts.project && opts.project.trim()) ||
    (process.env.CROSSDECK_PROJECT_ID && process.env.CROSSDECK_PROJECT_ID.trim()) ||
    undefined;

  // ── baseUrl ───────────────────────────────────────────────────────
  const baseUrlRaw =
    (opts.baseUrl && opts.baseUrl.trim()) ||
    (process.env.CROSSDECK_BASE_URL && process.env.CROSSDECK_BASE_URL.trim()) ||
    DEFAULT_BASE_URL;
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");

  return { authToken, projectId, baseUrl };
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}
