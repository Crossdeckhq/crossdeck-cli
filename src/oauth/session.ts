/**
 * Session resolver — turns stored custody into a live access token for every
 * authenticated command (whoami, projects, apps, monitor).
 *
 * The 1h access token is never persisted (see credentials.ts). Each command
 * that needs one calls `getAccessToken()`, which loads the refresh token,
 * trades it for a fresh access token, and PERSISTS the rotated refresh token
 * (the provider one-time-uses refresh tokens — a stale one is dead). If the
 * refresh fails (revoked/expired), the user is told to run `crossdeck login`.
 */

import { credentialStore } from "../credentials.js";
import { endpointsFor, refreshAccessToken } from "./client.js";

export interface Session {
  accessToken: string;
  baseUrl: string;
  scope: string;
}

export class NotLoggedInError extends Error {
  constructor(message = "You are not signed in. Run `crossdeck login` first.") {
    super(message);
    this.name = "NotLoggedInError";
  }
}

/**
 * Resolve a live access token, rotating + persisting the refresh token. Throws
 * NotLoggedInError when there is no valid custody.
 */
export async function getAccessToken(overrideBaseUrl?: string): Promise<Session> {
  const store = credentialStore();
  const creds = store.load();
  if (!creds) throw new NotLoggedInError();

  const baseUrl = overrideBaseUrl?.replace(/\/+$/, "") || creds.baseUrl;
  const endpoints = endpointsFor(baseUrl);

  let tokens;
  try {
    tokens = await refreshAccessToken(endpoints, { refreshToken: creds.refreshToken, clientId: creds.clientId });
  } catch (err) {
    // A dead refresh token means the session is over — wipe it so the next
    // command gives a clean "run login" rather than retrying a dead token.
    store.clear();
    throw new NotLoggedInError(
      `Your session has expired or was revoked (${err instanceof Error ? err.message : String(err)}). Run \`crossdeck login\` to sign in again.`,
    );
  }

  // Persist the rotated refresh token immediately — the old one is now dead.
  store.save({
    refreshToken: tokens.refreshToken,
    clientId: creds.clientId,
    scope: tokens.scope || creds.scope,
    baseUrl,
    loggedInAt: creds.loggedInAt,
    email: creds.email, // preserve the cached identity across refresh rotations
  });

  return { accessToken: tokens.accessToken, baseUrl, scope: tokens.scope || creds.scope };
}
