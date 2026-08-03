/**
 * CLI context — the "active project" so monitoring/app commands don't need
 * `--project` on every call (Stripe's `stripe config` / gcloud's active project).
 *
 * Non-secret: stored in `~/.crossdeck/config.json` (0644 is fine — it's just an
 * id). Resolution order for a project id: explicit --project flag →
 * $CROSSDECK_PROJECT_ID → the active project set by `crossdeck use`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface CliContext {
  activeProject?: string;
}

function contextPath(): string {
  const dir = process.env.CROSSDECK_CONFIG_DIR?.trim() || join(homedir(), ".crossdeck");
  return join(dir, "config.json");
}

function readContext(): CliContext {
  const p = contextPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CliContext;
  } catch {
    return {};
  }
}

export function setActiveProject(projectId: string): void {
  const p = contextPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const ctx = readContext();
  ctx.activeProject = projectId;
  writeFileSync(p, JSON.stringify(ctx, null, 2));
}

export function getActiveProject(): string | undefined {
  return readContext().activeProject;
}

/** Resolve the project id a command should act on, or throw a helpful error. */
export function resolveProject(flag?: string): string {
  const id =
    (flag && flag.trim()) ||
    (process.env.CROSSDECK_PROJECT_ID && process.env.CROSSDECK_PROJECT_ID.trim()) ||
    getActiveProject();
  if (!id) {
    throw new Error(
      "No project selected. Pass --project <id>, set $CROSSDECK_PROJECT_ID, or run `crossdeck use <id>`.\n" +
        "List yours with `crossdeck projects list`.",
    );
  }
  return id;
}
