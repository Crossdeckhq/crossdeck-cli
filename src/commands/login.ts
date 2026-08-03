/**
 * `crossdeck login` — RFC 8252 native-app loopback + PKCE sign-in.
 *
 * The same flow `gh auth login` and `stripe login` use: start a 127.0.0.1
 * listener, open the hosted Crossdeck consent page, catch the redirect, trade
 * the code for a `cd_wk_` workspace token, and stash the refresh token 0600.
 *
 * By default it requests the provisioning scopes (`projects/apps/keys:write`)
 * plus full reads — the CLI is the account-admin surface — and the consent
 * screen shows the developer exactly that. `--read-only` requests reads alone.
 * CI never runs this: `crossdeck upload-sourcemaps` / read commands take a
 * `cd_sk_` key via --auth-token / $CROSSDECK_SECRET_KEY instead.
 */

import { credentialStore } from "../credentials.js";
import { createPkce } from "../oauth/pkce.js";
import { startLoopback } from "../oauth/loopback.js";
import {
  buildAuthorizeUrl,
  endpointsFor,
  exchangeCode,
  openBrowser,
  registerClient,
} from "../oauth/client.js";

const DEFAULT_BASE_URL = "https://api.cross-deck.com";
const READ_SCOPE = "prism.read";
const FULL_SCOPE = "prism.read projects:write apps:write keys:write";
const LOGIN_TIMEOUT_MS = 5 * 60_000;

export interface LoginOpts {
  baseUrl?: string;
  readOnly?: boolean;
  scope?: string;
  /** Print the URL and skip auto-opening the browser (headless-friendly). */
  noBrowser?: boolean;
}

export async function loginCommand(opts: LoginOpts): Promise<number> {
  const baseUrl =
    (opts.baseUrl && opts.baseUrl.trim()) ||
    (process.env.CROSSDECK_BASE_URL && process.env.CROSSDECK_BASE_URL.trim()) ||
    DEFAULT_BASE_URL;
  const scope = (opts.scope && opts.scope.trim()) || (opts.readOnly ? READ_SCOPE : FULL_SCOPE);
  const endpoints = endpointsFor(baseUrl);

  const loopback = await startLoopback();
  try {
    const clientId = await registerClient(endpoints, loopback.redirectUri);
    const pkce = createPkce();
    const url = buildAuthorizeUrl(endpoints, {
      clientId,
      redirectUri: loopback.redirectUri,
      challenge: pkce.challenge,
      state: pkce.state,
      scope,
    });

    process.stdout.write("\nSigning in to Crossdeck…\n");
    process.stdout.write(`Scopes requested: ${scope}\n\n`);
    if (opts.noBrowser) {
      process.stdout.write(`Open this URL in your browser to continue:\n  ${url}\n\n`);
    } else {
      process.stdout.write(`Opening your browser… if it doesn't open, visit:\n  ${url}\n\n`);
      openBrowser(url);
    }
    process.stdout.write("Waiting for you to finish in the browser…\n");

    const { code } = await loopback.waitForCode(pkce.state, LOGIN_TIMEOUT_MS);
    const tokens = await exchangeCode(endpoints, {
      code,
      verifier: pkce.verifier,
      clientId,
      redirectUri: loopback.redirectUri,
    });

    const store = credentialStore();
    store.save({
      refreshToken: tokens.refreshToken,
      clientId,
      scope: tokens.scope || scope,
      baseUrl,
      loggedInAt: new Date().toISOString(),
    });

    process.stdout.write(`\n✓ Signed in. Access renews automatically for ~30 days.\n`);
    process.stdout.write(`  Scopes: ${tokens.scope || scope}\n`);
    process.stdout.write(`  Credentials: ${store.location()} (owner-only, 0600)\n`);
    process.stdout.write(`  Revoke anytime from Settings → Developer, or run \`crossdeck logout\`.\n\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`\n✕ Login failed: ${err instanceof Error ? err.message : String(err)}\n\n`);
    return 1;
  } finally {
    loopback.close();
  }
}
