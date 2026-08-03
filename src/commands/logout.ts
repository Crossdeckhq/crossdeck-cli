/**
 * `crossdeck logout` — end the session, for real.
 *
 * Revokes this machine's refresh token SERVER-side (RFC 7009 → POST /oauth/revoke),
 * which kills the whole token family plus the `cd_wk_` access tokens it minted, and
 * THEN wipes the on-disk credential. So a stolen `credentials.json` is dead the
 * moment you log out — not merely absent from this disk. Every connected machine
 * is also listed and revocable from Settings → Developer in the dashboard.
 *
 * Best-effort on the network: if the revoke call can't be confirmed (offline), we
 * still wipe locally and tell the truth about what did and didn't happen.
 */

import { credentialStore } from "../credentials.js";

export async function logoutCommand(): Promise<number> {
  const store = credentialStore();

  let creds;
  try {
    creds = store.load();
  } catch {
    // A too-permissive file throws on load — we can't read the token to revoke it,
    // but we can and must still remove it.
    store.clear();
    process.stdout.write("\n✓ Signed out on this machine — the stored credential was wiped.\n\n");
    return 0;
  }

  if (!creds) {
    process.stdout.write("\nYou weren't signed in. Nothing to do.\n\n");
    return 0;
  }

  let serverRevoked = false;
  try {
    const url = `${creds.baseUrl.replace(/\/+$/, "")}/oauth/revoke`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: creds.refreshToken,
        token_type_hint: "refresh_token",
        client_id: creds.clientId,
      }),
    });
    serverRevoked = res.ok;
  } catch {
    serverRevoked = false;
  }

  store.clear();

  if (serverRevoked) {
    process.stdout.write("\n✓ Signed out — this session was revoked server-side and wiped from this machine.\n");
    process.stdout.write("  Manage every connected machine from Settings → Developer in the dashboard.\n\n");
  } else {
    process.stdout.write("\n✓ Signed out on this machine — the stored credential was wiped.\n");
    process.stdout.write("  Couldn't confirm the server-side revoke (offline?). Revoke it anywhere from Settings → Developer in the dashboard.\n\n");
  }
  return 0;
}
