/**
 * The interactive session — `crossdeck` on a TTY opens a working environment
 * (like `claude`), not a one-shot. You type bare commands inside it — `whoami`,
 * `init`, `revenue`, `use prolend`, `help`, `exit` — with no `crossdeck` prefix,
 * and your active project persists across the session (shown in the prompt).
 *
 * Additive, never a replacement: `crossdeck <command>` one-shot stays exactly as
 * it was, because CI and scripts (`crossdeck sourcemaps upload` in a pipeline)
 * can't live in a REPL. So the session only opens on an interactive TTY; piped /
 * non-interactive invocations fall through to the one-shot parser.
 *
 * Each command runs as a fresh one-shot subprocess of this same binary. That's
 * deliberate: every command's state (active project, credentials) is file-backed
 * in ~/.crossdeck, so a subprocess sees the exact same state — and it sidesteps
 * the one-shot commands' `process.exit()` cleanly (an in-process dispatch would
 * tear the whole session down).
 */

import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

import { renderLauncher } from "./launcher.js";
import { renderHelp } from "./help.js";
import { getActiveProject } from "./context.js";

const isTTY = !!process.stdout.isTTY;
const useColor = isTTY && !process.env.NO_COLOR;
const truecolor = useColor && /truecolor|24bit/i.test(process.env.COLORTERM ?? "");
const CORAL = [255, 107, 84] as const;
const TAN = [201, 140, 107] as const;
const tc = (rgb: readonly [number, number, number], s: string): string =>
  truecolor ? `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[0m` : useColor ? `\x1b[91m${s}\x1b[0m` : s;
const dim = (s: string): string => (useColor ? `\x1b[2m${s}\x1b[0m` : s);

/** The prompt reflects the active project so you always know your context. */
function promptText(): string {
  const active = getActiveProject();
  const label = active ? tc(TAN, active) : dim("crossdeck");
  return `${label} ${tc(CORAL, "❯")} `;
}

/** Resolve the path to this binary so we can re-spawn it one-shot per command. */
function entryPath(): string {
  // argv[1] is the resolved bin script (dist/cli.cjs) when run as `crossdeck`.
  return process.argv[1];
}

function runOnce(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entryPath(), ...args], { stdio: "inherit" });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

/**
 * Open the interactive session. Prints the splash as the header, then loops.
 * Built-ins: `help`, `clear`, `exit`/`quit` (also Ctrl-D). A stray `crossdeck`
 * prefix (muscle memory) is stripped. Everything else dispatches one-shot.
 */
export function startRepl(): void {
  renderLauncher({ repl: true });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptText(),
    // A light history so ↑ recalls the last commands within the session.
    historySize: 200,
  });

  const reprompt = () => {
    rl.setPrompt(promptText()); // active project may have changed (e.g. after `use`)
    rl.prompt();
  };

  rl.prompt();

  rl.on("line", (line) => {
    let input = line.trim();
    if (!input) return reprompt();

    // Tolerate a pasted/typed `crossdeck …` prefix inside the session.
    if (input === "crossdeck") return reprompt();
    if (input.startsWith("crossdeck ")) input = input.slice("crossdeck ".length).trim();

    const parts = input.split(/\s+/);
    const cmd = parts[0];

    if (cmd === "exit" || cmd === "quit") return rl.close();
    if (cmd === "clear") {
      process.stdout.write("\x1b[2J\x1b[H");
      return reprompt();
    }
    if (cmd === "help" && parts.length === 1) {
      renderHelp();
      return reprompt();
    }

    // Dispatch one-shot. Pause readline so the child owns stdin (login's browser
    // flow, prompts, etc.), then resume + reprompt when it exits.
    rl.pause();
    void runOnce(parts).then(() => {
      rl.resume();
      reprompt();
    });
  });

  // Ctrl-C cancels the current line but never kills the session.
  rl.on("SIGINT", () => {
    process.stdout.write("\n");
    reprompt();
  });

  rl.on("close", () => {
    process.stdout.write(`\n  ${dim("Left the Crossdeck session.")}\n\n`);
    process.exit(0);
  });
}
