/**
 * Shared error boundary for authenticated commands. Turns the three failure
 * shapes into a clean message + exit code, so every command body can be pure
 * happy-path.
 */

import { ApiError } from "../oauth/api.js";
import { NotLoggedInError } from "../oauth/session.js";
import { c } from "../render.js";

export async function runAuthed(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof NotLoggedInError) {
      process.stderr.write(`\n${err.message}\n\n`);
      return 1;
    }
    if (err instanceof ApiError) {
      const rid = err.requestId ? c.dim(` (request ${err.requestId})`) : "";
      process.stderr.write(`\n${c.red("✕")} ${err.message}${rid}\n\n`);
      return 1;
    }
    process.stderr.write(`\n${c.red("✕")} ${err instanceof Error ? err.message : String(err)}\n\n`);
    return 1;
  }
}
