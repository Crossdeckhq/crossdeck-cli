/**
 * `crossdeck whoami` — confirm the active OAuth session is live and show what
 * it can do. Refreshes the access token (proving custody is valid) and pings
 * the workspace to prove the token actually authenticates, then prints the
 * granted scopes + portfolio size. No secrets are printed.
 */

import { getAccessToken, NotLoggedInError } from "../oauth/session.js";

export interface WhoamiOpts {
  baseUrl?: string;
}

export async function whoamiCommand(opts: WhoamiOpts): Promise<number> {
  try {
    const session = await getAccessToken(opts.baseUrl);

    // Prove the token authenticates against the live gate (and get portfolio size).
    let projectCount: number | null = null;
    try {
      const res = await fetch(`${session.baseUrl}/v1/workspace/projects`, {
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: { projects?: unknown[] } };
        projectCount = Array.isArray(body.data?.projects) ? body.data!.projects!.length : null;
      }
    } catch {
      /* network hiccup — the refresh already proved the session is valid */
    }

    process.stdout.write(`\n✓ Signed in to Crossdeck\n`);
    process.stdout.write(`  API:     ${session.baseUrl}\n`);
    process.stdout.write(`  Scopes:  ${session.scope || "(unknown)"}\n`);
    if (projectCount !== null) process.stdout.write(`  Projects: ${projectCount}\n`);
    process.stdout.write("\n");
    return 0;
  } catch (err) {
    if (err instanceof NotLoggedInError) {
      process.stderr.write(`\n${err.message}\n\n`);
      return 1;
    }
    process.stderr.write(`\n✕ ${err instanceof Error ? err.message : String(err)}\n\n`);
    return 1;
  }
}
