/**
 * `crossdeck logout` — end the local session.
 *
 * Wipes the on-disk refresh token so this machine can no longer authenticate.
 * The access token is memory-only and dies with the process; the refresh token
 * is now gone locally. To revoke the credential SERVER-side (kill it everywhere,
 * immediately), use Settings → Developer in the dashboard — the same revoke the
 * consent screen advertises. (A dedicated `/oauth/revoke` endpoint for a
 * one-command server-side kill is a fast follow-up.)
 */

import { credentialStore } from "../credentials.js";

export async function logoutCommand(): Promise<number> {
  const store = credentialStore();
  const had = store.load() !== null;
  store.clear();
  if (had) {
    process.stdout.write("\n✓ Signed out on this machine — the stored credential was wiped.\n");
    process.stdout.write("  To revoke it everywhere, use Settings → Developer in the dashboard.\n\n");
  } else {
    process.stdout.write("\nYou weren't signed in. Nothing to do.\n\n");
  }
  return 0;
}
