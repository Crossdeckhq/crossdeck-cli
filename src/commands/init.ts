/**
 * `crossdeck init` — zero to installed in one command (the DoD arc).
 *
 * On a live OAuth session it creates a project, creates an app, mints the first
 * publishable keys, sets the project active, and prints a copy-paste SDK
 * snippet — the exact "add a project and set it up end to end" flow, headless.
 * Nothing here writes Firestore directly; it calls the provisioning engine
 * (CD-170) over the one gate.
 *
 *   crossdeck init --name "My App" --platform web
 */

import { writeFileSync, existsSync } from "node:fs";

import { apiWith } from "../oauth/api.js";
import { getAccessToken } from "../oauth/session.js";
import { setActiveProject } from "../context.js";
import { c, heading, kv, line, ok } from "../render.js";
import { runAuthed } from "./_authed.js";

interface InitOpts {
  name?: string; platform?: string; domain?: string; bundleId?: string;
  packageName?: string; envFile?: string | boolean; baseUrl?: string;
}

const SNIPPET: Record<string, (key: string) => string> = {
  // The exported singleton is `Crossdeck` (capital). After init, wire identify()
  // to YOUR auth state so events + revenue join to the real person by identity.
  web: (key) =>
    `import { Crossdeck } from "@cross-deck/web";\nCrossdeck.init({ publishableKey: "${key}" });\n// after your user signs in:\nawait Crossdeck.identify(currentUser.id);`,
  ios: (key) =>
    `import Crossdeck\nCrossdeck.start(publishableKey: "${key}")\n// after your user signs in:\nCrossdeck.identify(currentUser.id)`,
  android: (key) =>
    `Crossdeck.start(context, publishableKey = "${key}")\n// after your user signs in:\nCrossdeck.identify(currentUser.id)`,
};

export async function initCommand(opts: InitOpts): Promise<number> {
  return runAuthed(async () => {
    const platform = (opts.platform || "web").trim();
    if (!["web", "ios", "android"].includes(platform)) {
      process.stderr.write(`\n${c.red("✕")} --platform must be web, ios, or android.\n\n`);
      return 1;
    }
    const name = opts.name?.trim() || "My Crossdeck App";

    // One session for the whole arc (a single token refresh).
    const session = await getAccessToken(opts.baseUrl);

    heading("Setting up your Crossdeck project");

    // 1. Project
    const proj = await apiWith<{ project: { project: string; name: string } }>(
      session, "POST", "/v1/projects", { body: { name } },
    );
    const projectId = proj.data.project.project;
    ok(`Project ${c.cyan(projectId)} — ${name}`);
    setActiveProject(projectId);

    // 2. App + first keys
    const appBody: Record<string, unknown> = { projectId, platform };
    if (opts.domain) appBody.domain = opts.domain;
    if (opts.bundleId) appBody.bundleId = opts.bundleId;
    if (opts.packageName) appBody.packageName = opts.packageName;
    const app = await apiWith<{ app: { appId: string; publishableKeyLive: string; publishableKeyTest: string } }>(
      session, "POST", "/v1/apps", { body: appBody },
    );
    const a = app.data.app;
    ok(`App ${c.cyan(a.appId)} (${platform})`);

    // 3. Keys + snippet
    heading("Your publishable keys");
    kv([
      ["live", c.green(a.publishableKeyLive)],
      ["test", a.publishableKeyTest],
    ]);

    heading(`Install — ${platform}`);
    line(c.dim("  " + (SNIPPET[platform]!(a.publishableKeyLive)).split("\n").join("\n  ")));

    // 4. Optional .env (--env-file with no value → ".env"; or a given path)
    if (opts.envFile) {
      const target = typeof opts.envFile === "string" ? opts.envFile : ".env";
      const contents = `CROSSDECK_PUBLISHABLE_KEY=${a.publishableKeyLive}\nCROSSDECK_PUBLISHABLE_KEY_TEST=${a.publishableKeyTest}\n`;
      if (existsSync(target)) {
        line(`\n  ${c.yellow("○")} ${c.dim(`${target} exists — not overwriting. Keys are above.`)}`);
      } else {
        writeFileSync(target, contents, { mode: 0o600 });
        ok(`Wrote ${target}`);
      }
    }

    line(`\n${c.dim("Web origins self-seed on the first SDK heartbeat. Watch it live:")}`);
    line(`  crossdeck analytics --project ${projectId}\n`);
    return 0;
  });
}
