/**
 * `crossdeck revenue | analytics | errors` — call the read REST APIs from the
 * terminal, on the same OAuth session that provisioned the project.
 *   revenue   --project …            → GET /v1/revenue        (recognised cash)
 *   analytics --project …            → GET /v1/acquisition     (signup sources)
 *   errors    --project … --issue …  → GET /v1/errors          (the moat stitch)
 * Every command honours --json (raw envelope) and surfaces coverage caveats.
 */

import { api } from "../oauth/api.js";
import { resolveProject } from "../context.js";
import { c, coverageNote, heading, json, kv, line } from "../render.js";
import { runAuthed } from "./_authed.js";

const humanize = (k: string): string => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());

/** Render the scalar top-level fields of a data object; hint nested → --json. */
function renderScalars(data: Record<string, unknown>): void {
  const rows: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "coverage") continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      rows.push([humanize(k), v === null ? c.dim("—") : String(v)]);
    }
  }
  if (rows.length) kv(rows);
  if (data.coverage) coverageNote(data.coverage);
}

interface MonitorOpts { project?: string; json?: boolean; baseUrl?: string }

export async function revenueCommand(opts: MonitorOpts): Promise<number> {
  return runAuthed(async () => {
    const project = resolveProject(opts.project);
    const { data } = await api<Record<string, unknown>>("GET", "/v1/revenue", { query: { project } }, opts.baseUrl);
    if (opts.json) { json(data); return 0; }
    heading(`Revenue · ${project}`);
    renderScalars(data ?? {});
    line("");
    return 0;
  });
}

export async function analyticsCommand(opts: MonitorOpts): Promise<number> {
  return runAuthed(async () => {
    const project = resolveProject(opts.project);
    const { data } = await api<{ sources?: Array<Record<string, unknown>>; coverage?: unknown }>(
      "GET", "/v1/acquisition", { query: { project } }, opts.baseUrl,
    );
    if (opts.json) { json(data); return 0; }
    heading(`Acquisition · ${project}`);
    const sources = data?.sources ?? [];
    if (sources.length === 0) line(`  ${c.dim("No attributed signup sources yet.")}`);
    for (const s of sources) {
      const name = String(s.source ?? s.name ?? "unknown");
      const count = s.signups ?? s.count ?? s.value;
      line(`  ${name.padEnd(24)} ${c.bold(String(count ?? "—"))}`);
    }
    if (data?.coverage) coverageNote(data.coverage);
    line("");
    return 0;
  });
}

interface ErrorsOpts extends MonitorOpts { issue?: string }

export async function errorsCommand(opts: ErrorsOpts): Promise<number> {
  return runAuthed(async () => {
    const project = resolveProject(opts.project);
    if (!opts.issue) {
      process.stderr.write(`\n${c.red("✕")} An issue fingerprint is required: crossdeck errors --issue <fingerprint> [--project …]\n${c.dim("  (Find fingerprints in the dashboard Errors tab; a top-issues list command follows.)")}\n\n`);
      return 1;
    }
    const { data } = await api<Record<string, unknown> | null>(
      "GET", "/v1/errors", { query: { project, fingerprint: opts.issue } }, opts.baseUrl,
    );
    if (opts.json) { json(data); return 0; }
    if (!data) { line(`\n${c.dim(`No issue found for fingerprint ${opts.issue} in ${project}.`)}\n`); return 0; }
    heading(`${data.exceptionType ?? "Issue"} · ${project}`);
    const affected = (data.affected ?? {}) as { users?: number; payingUsers?: number };
    kv([
      ["fingerprint", String(data.fingerprint ?? opts.issue)],
      ["status", String(data.status ?? "—")],
      ["level", String(data.level ?? "—")],
      ["occurrences", c.bold(String(data.occurrences ?? 0))],
      ["affected users", c.bold(String(affected.users ?? 0))],
      // The moat, in one line: how many of the hit users pay you.
      ["…of whom PAY you", c.green(String(affected.payingUsers ?? 0))],
      ["first seen", String(data.firstSeen ?? "—")],
      ["last seen", String(data.lastSeen ?? "—")],
    ]);
    if (data.coverage) coverageNote(data.coverage);
    line("");
    return 0;
  });
}
