/**
 * OAuth 2.1 client for `crossdeck login` — talks to the provider that already
 * powers the Prism "Connect AI" connector (backend/src/api/oauth.ts).
 *
 * Endpoints (served under the API host, ISSUER = https://api.cross-deck.com):
 *   POST /oauth/register   RFC 7591 dynamic client registration
 *   GET  /oauth/authorize  hosted consent (opened in the browser)
 *   POST /oauth/token      code→token (PKCE) and refresh
 *
 * The access token this yields IS a `cd_wk_` workspace credential the v1 gate
 * resolves — the same door reads use, now carrying consented write scopes
 * (CD-170). No secret is ever put on the wire except in the final token POST.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

/** Everything a login needs to reach the provider. */
export interface OAuthEndpoints {
  register: string;
  authorize: string;
  token: string;
}

export function endpointsFor(baseUrl: string): OAuthEndpoints {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    register: `${root}/oauth/register`,
    authorize: `${root}/oauth/authorize`,
    token: `${root}/oauth/token`,
  };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  scope: string;
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const desc = (data.error_description as string) || (data.error as string) || text || `HTTP ${res.status}`;
    throw new Error(desc);
  }
  return data;
}

/**
 * Register this CLI instance as a public native client (RFC 7591) with its
 * loopback redirect_uri. We register per-login rather than ship a baked-in
 * client_id: it needs no secret (PKCE is the proof), and it means the redirect
 * port never has to be pre-known.
 */
export async function registerClient(endpoints: OAuthEndpoints, redirectUri: string): Promise<string> {
  const data = await postJson(endpoints.register, {
    client_name: "Crossdeck CLI",
    redirect_uris: [redirectUri],
    application_type: "native",
  });
  const clientId = data.client_id as string | undefined;
  if (!clientId) throw new Error("Client registration did not return a client_id.");
  return clientId;
}

/** Build the hosted-consent URL the browser opens. */
export function buildAuthorizeUrl(
  endpoints: OAuthEndpoints,
  params: { clientId: string; redirectUri: string; challenge: string; state: string; scope: string },
): string {
  const u = new URL(endpoints.authorize);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("code_challenge", params.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", params.state);
  u.searchParams.set("scope", params.scope);
  return u.toString();
}

/** Exchange the single-use auth code + PKCE verifier for a token set. */
export async function exchangeCode(
  endpoints: OAuthEndpoints,
  params: { code: string; verifier: string; clientId: string; redirectUri: string },
): Promise<TokenSet> {
  const data = await postJson(endpoints.token, {
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.verifier,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
  });
  return toTokenSet(data);
}

/** Trade a refresh token for a fresh access token (and a rotated refresh token). */
export async function refreshAccessToken(
  endpoints: OAuthEndpoints,
  params: { refreshToken: string; clientId: string },
): Promise<TokenSet> {
  const data = await postJson(endpoints.token, {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
  return toTokenSet(data);
}

function toTokenSet(data: Record<string, unknown>): TokenSet {
  const accessToken = data.access_token as string | undefined;
  const refreshToken = data.refresh_token as string | undefined;
  if (!accessToken || !refreshToken) throw new Error("Token endpoint did not return the expected tokens.");
  return {
    accessToken,
    refreshToken,
    expiresInSec: typeof data.expires_in === "number" ? data.expires_in : 3600,
    scope: typeof data.scope === "string" ? data.scope : "",
  };
}

/** Open a URL in the user's default browser. Best-effort; the URL is also printed. */
export function openBrowser(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* headless / no browser — the caller prints the URL for manual open */
  }
}
