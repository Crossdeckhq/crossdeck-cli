/**
 * `crossdeck apps` — create and list apps + their publishable keys (CD-159 / CD-170).
 *   apps create --platform web|ios|android [--project …] [--domain …] [--bundle-id …] [--package-name …] [--origin …]
 *   apps list [--project …]
 * Backs onto POST /v1/apps and GET /v1/workspace/apps.
 */

import { api } from "../oauth/api.js";
import { resolveProject } from "../context.js";
import { c, heading, json, kv, line, ok } from "../render.js";
import { runAuthed } from "./_authed.js";

interface CreateAppOpts {
  project?: string; platform?: string; domain?: string; bundleId?: string;
  packageName?: string; origin?: string[]; json?: boolean; baseUrl?: string;
}

interface AppRecord {
  appId: string; project: string; platform: string;
  publishableKeyLive: string; publishableKeyTest: string; allowedOrigins: string[];
}

export async function appsCreateCommand(opts: CreateAppOpts): Promise<number> {
  return runAuthed(async () => {
    const projectId = resolveProject(opts.project);
    const body: Record<string, unknown> = { projectId, platform: opts.platform };
    if (opts.domain) body.domain = opts.domain;
    if (opts.bundleId) body.bundleId = opts.bundleId;
    if (opts.packageName) body.packageName = opts.packageName;
    if (opts.origin?.length) body.allowedOrigins = opts.origin;

    const { data } = await api<{ app: AppRecord }>("POST", "/v1/apps", { body }, opts.baseUrl);
    const a = data.app;
    if (opts.json) { json(data); return 0; }
    ok(`Created ${a.platform} app ${c.cyan(a.appId)} in ${a.project}`);
    kv([
      ["publishable key (live)", c.green(a.publishableKeyLive)],
      ["publishable key (test)", a.publishableKeyTest],
      ["allowed origins", a.allowedOrigins.length ? a.allowedOrigins.join(", ") : c.dim("(learned from the first SDK heartbeat)")],
    ]);
    if (a.platform === "web" && a.allowedOrigins.length === 0) {
      line(`\n  ${c.dim("Web origins self-seed on your app's first heartbeat — no setup needed.")}`);
    }
    return 0;
  });
}

interface ListAppsOpts { project?: string; json?: boolean; baseUrl?: string }

export async function appsListCommand(opts: ListAppsOpts): Promise<number> {
  return runAuthed(async () => {
    // --project is optional here: no flag → every app the workspace owns.
    const query = opts.project ? { project: opts.project } : {};
    const { data } = await api<{ apps: AppRecord[] }>("GET", "/v1/workspace/apps", { query }, opts.baseUrl);
    if (opts.json) { json(data); return 0; }
    const apps = data.apps ?? [];
    if (apps.length === 0) { line(`\n${c.dim("No apps yet. Create one with `crossdeck apps create --platform web`.")}\n`); return 0; }
    heading(`Apps (${apps.length})`);
    for (const a of apps) {
      line(`  ${c.cyan(a.appId.padEnd(26))} ${a.platform.padEnd(8)} ${c.dim(a.project)}`);
      line(`  ${" ".repeat(26)} ${c.dim(a.publishableKeyLive)}`);
    }
    line("");
    return 0;
  });
}
