/**
 * `crossdeck projects` — create and list projects headlessly (CD-159 / CD-170).
 *   projects create --name "…" [--business-model …] [--activate]
 *   projects list
 * Backs onto POST /v1/projects and GET /v1/workspace/projects.
 */

import { api } from "../oauth/api.js";
import { setActiveProject } from "../context.js";
import { c, heading, json, kv, line, ok } from "../render.js";
import { runAuthed } from "./_authed.js";

interface CreateProjectOpts { name?: string; businessModel?: string; activate?: boolean; json?: boolean; baseUrl?: string }

export async function projectsCreateCommand(opts: CreateProjectOpts): Promise<number> {
  return runAuthed(async () => {
    const { data } = await api<{ project: { project: string; name: string; businessModel: string | null } }>(
      "POST", "/v1/projects",
      { body: { name: opts.name, businessModel: opts.businessModel } },
      opts.baseUrl,
    );
    const p = data.project;
    if (opts.json) { json(data); return 0; }
    ok(`Created project ${c.cyan(p.project)}`);
    kv([["name", p.name], ["business model", p.businessModel ?? c.dim("—")]]);
    if (opts.activate) { setActiveProject(p.project); line(`\n${c.dim("Set as active project.")}`); }
    else line(`\n${c.dim(`Make it active with: crossdeck use ${p.project}`)}`);
    return 0;
  });
}

interface ListProjectsOpts { json?: boolean; baseUrl?: string }

export async function projectsListCommand(opts: ListProjectsOpts): Promise<number> {
  return runAuthed(async () => {
    const { data } = await api<{ projects: Array<{ project: string; name: string; platforms: string[] }> }>(
      "GET", "/v1/workspace/projects", {}, opts.baseUrl,
    );
    if (opts.json) { json(data); return 0; }
    const projects = data.projects ?? [];
    if (projects.length === 0) { line(`\n${c.dim("No projects yet. Create one with `crossdeck projects create --name \"My App\"`.")}\n`); return 0; }
    heading(`Projects (${projects.length})`);
    for (const p of projects) {
      const plats = p.platforms?.length ? c.dim(p.platforms.join(", ")) : c.dim("no apps yet");
      line(`  ${c.cyan(p.project.padEnd(24))}  ${p.name}  ${plats}`);
    }
    line("");
    return 0;
  });
}
