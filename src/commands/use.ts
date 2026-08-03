/**
 * `crossdeck use <project>` — set the active project so monitoring/app commands
 * don't need --project every time (like `gcloud config set project`).
 */

import { setActiveProject, getActiveProject } from "../context.js";
import { c, line, ok } from "../render.js";

export async function useCommand(projectId: string | undefined): Promise<number> {
  if (!projectId) {
    const active = getActiveProject();
    line(active ? `Active project: ${c.cyan(active)}` : c.dim("No active project. Set one: crossdeck use <project-id>"));
    return 0;
  }
  setActiveProject(projectId.trim());
  ok(`Active project set to ${c.cyan(projectId.trim())}`);
  return 0;
}
