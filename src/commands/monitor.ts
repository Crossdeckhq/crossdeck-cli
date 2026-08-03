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
import { c, coverageNote, heading, json, kv, line, money } from "../render.js";
import { runAuthed } from "./_authed.js";

interface MonitorOpts { project?: string; json?: boolean; baseUrl?: string }

interface RevenueData {
  currency?: string;
  coverage?: unknown;
  current?: {
    mrrCents?: number | null;
    payingCustomers?: number | null;
    byRail?: Record<string, number> | null;
    recognisedCashThisMonthCents?: number | null;
    recognisedCashThisMonthByShape?: { recurring?: number; oneOff?: number } | null;
  };
}

export async function revenueCommand(opts: MonitorOpts): Promise<number> {
  return runAuthed(async () => {
    const project = resolveProject(opts.project);
    const { data } = await api<RevenueData>("GET", "/v1/revenue", { query: { project } }, opts.baseUrl);
    if (opts.json) { json(data); return 0; }

    heading(`Revenue · ${project}`);
    const cur = data?.current ?? {};
    const ccy = (data?.currency ?? "usd").toUpperCase();
    // A blank is a blind spot (metric not wired), NOT $0 — say so, don't print 0.
    const cash = (cents: number | null | undefined, blind: string): string =>
      cents == null ? c.dim(blind) : money(cents, ccy);

    const rows: Array<[string, string]> = [
      ["MRR (recurring)", cash(cur.mrrCents, "— no subscription rail connected")],
      ["Cash this month", cash(cur.recognisedCashThisMonthCents, "— no revenue rail connected")],
    ];
    const shape = cur.recognisedCashThisMonthByShape;
    if (shape && (typeof shape.recurring === "number" || typeof shape.oneOff === "number")) {
      rows.push(["  ↳ recurring / one-off", `${money(shape.recurring ?? 0, ccy)}  /  ${money(shape.oneOff ?? 0, ccy)}`]);
    }
    rows.push(["Paying customers", cur.payingCustomers == null ? c.dim("—") : c.bold(String(cur.payingCustomers))]);
    kv(rows);

    // Per-rail split, one line, only rails with a value.
    if (cur.byRail) {
      const rails = Object.entries(cur.byRail).filter(([, v]) => typeof v === "number");
      if (rails.length) {
        line(`  ${c.dim("by rail".padEnd(kvWidth(rows)))}  ` + rails.map(([k, v]) => `${k} ${money(v, ccy)}`).join(c.dim(" · ")));
      }
    }

    // One concise, honest caveat — only when something is actually a blind spot.
    if (cur.mrrCents == null || cur.recognisedCashThisMonthCents == null) {
      line(`  ${c.yellow("○")} ${c.dim("A blank isn't $0 — it's a metric not wired yet. Connect a payment rail in the dashboard.")}`);
    }
    line("");
    return 0;
  });
}

/** Label-column width so the by-rail line aligns under the kv() rows. */
function kvWidth(rows: Array<[string, string]>): number {
  return rows.reduce((m, [k]) => Math.max(m, k.length), 0);
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
