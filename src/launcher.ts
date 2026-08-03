/**
 * The launcher — `crossdeck` with no subcommand prints this splash. The brand's
 * first impression in the terminal (CROSSDECK_CLI_DIRECTIVE §65-142).
 *
 * Two states, both held to the Stripe-premium bar: restraint, real hierarchy,
 * the brand gradient X, honest copy.
 *   State 1 (logged out) — one path: `crossdeck login`.
 *   State 2 (logged in)  — the two hats: stand up the engine, then read the facts.
 *
 * Rendered premium, never a raw ASCII dump: the X carries the exact logo
 * gradient (#FF3D2E → #FF9A3D at 135°) in truecolor, degrading to coral on
 * 16-colour terminals and to plain block-art when colour is off (NO_COLOR / no
 * TTY). No network call — identity + active project come from the local
 * credential + config, so the splash is instant and works offline.
 */

import { credentialStore } from "./credentials.js";
import { getActiveProject } from "./context.js";

const isTTY = !!process.stdout.isTTY;
const useColor = isTTY && !process.env.NO_COLOR;
const truecolor =
  useColor && /truecolor|24bit/i.test(process.env.COLORTERM ?? "");

// Brand palette (exact logo values).
const X_FROM = [255, 61, 46] as const; // #FF3D2E
const X_TO = [255, 154, 61] as const; // #FF9A3D
const CORAL = [255, 107, 84] as const; // #FF6B54  commands / CLI mark
const WORD = [241, 234, 226] as const; // #F1EAE2  wordmark off-white
const DESC = [140, 131, 123] as const; // #8C837B  descriptions / labels
const TAN = [201, 140, 107] as const; // #C98C6B  prompt path
const OKGREEN = [111, 207, 155] as const; // #6FCF9B  signed-in ✓
const FAINT = [92, 83, 75] as const; // #5C534B  logged-out ○

type RGB = readonly [number, number, number];

const tc = (rgb: RGB, s: string): string =>
  truecolor ? `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[0m` : useColor ? `\x1b[91m${s}\x1b[0m` : s;

// On plain 16-colour terminals, a couple of roles want the closest ANSI code
// rather than the coral fallback tc() gives — keeps the splash legible.
const ansi = (code: string, s: string): string => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s: string): string => ansi("2", s);
const coral = (s: string): string => tc(CORAL, s);
const desc = (s: string): string => (truecolor ? tc(DESC, s) : dim(s));

const X_ART = [
  "██╗  ██╗",
  "╚██╗██╔╝",
  " ╚███╔╝ ",
  " ██╔██╗ ",
  "██╔╝ ██╗",
  "╚═╝  ╚═╝",
];

/** The X block art, each row tinted a step along the 135° gradient. */
function brandX(): string {
  const n = X_ART.length - 1;
  return X_ART.map((row, i) => {
    const t = n === 0 ? 0 : i / n;
    const rgb: RGB = [
      Math.round(X_FROM[0] + (X_TO[0] - X_FROM[0]) * t),
      Math.round(X_FROM[1] + (X_TO[1] - X_FROM[1]) * t),
      Math.round(X_FROM[2] + (X_TO[2] - X_FROM[2]) * t),
    ];
    return "  " + tc(rgb, row);
  }).join("\n");
}

function wordmark(): string {
  return `  ${tc(WORD, "crossdeck")} ${coral("CLI")}  ${desc(`· v${version()}`)}`;
}

const TAGLINE = "The platform that joins revenue, errors, and identity — by identity — now in your terminal.";

function label(text: string): string {
  return `  ${desc(text.toUpperCase())}`;
}

/** "  <cmd>   <description>" with the command coral and the caption muted. */
function cmd(name: string, description: string, pad: number): string {
  return `    ${coral(name.padEnd(pad))}  ${desc(description)}`;
}

let CLI_VERSION = "0.0.0";
/** Injected from cli.ts so the splash and the package stay in lockstep. */
export function setLauncherVersion(v: string): void {
  CLI_VERSION = v;
}
function version(): string {
  return CLI_VERSION;
}

/**
 * Print the splash. `promptCwd` mimics the shell prompt path (defaults to the
 * basename of cwd). One subtle rise-in on launch; nothing busier.
 */
export function renderLauncher(): void {
  const creds = safeLoad();
  const out: string[] = [];

  out.push("");
  out.push(brandX());
  out.push("");
  out.push(wordmark());
  out.push(`  ${desc(TAGLINE)}`);
  out.push("");

  if (!creds) {
    // ── State 1 — logged out ────────────────────────────────────────────────
    out.push(`  ${truecolor ? tc(FAINT, "○") : dim("○")} Not signed in.`);
    out.push("");
    out.push(label("Get started"));
    out.push(cmd("crossdeck login", "Sign in — opens your browser", 24));
    out.push(cmd("crossdeck login --key …", "Non-interactive (CI): use a project secret key", 24));
    out.push("");
    out.push(`  ${desc("Docs")}        ${tc(WORD, "cross-deck.com/docs")}`);
    out.push(`  ${desc("Dashboard")}   ${tc(WORD, "app.cross-deck.com")}`);
    out.push("");
    out.push(`  ${desc("New here? Run 'crossdeck login' to connect this machine.")}`);
  } else {
    // ── State 2 — logged in ─────────────────────────────────────────────────
    const who = creds.email ? `Signed in as ${creds.email}` : "Signed in";
    out.push(`  ${tc(OKGREEN, "✓")} ${who}`);
    const active = getActiveProject();
    if (active) {
      out.push(`  ${coral("●")} ${active}`);
    } else {
      out.push(`  ${truecolor ? tc(FAINT, "○") : dim("○")} ${desc("No active project — run 'crossdeck use <id>'")}`);
    }
    out.push("");
    out.push(label("Stand up the engine"));
    out.push(cmd("crossdeck init", "Create a project + app, mint keys", 24));
    out.push(cmd("crossdeck apps create", "Add an app to a project", 24));
    out.push(cmd("crossdeck use", "Switch the active project", 24));
    out.push("");
    out.push(label("Read the facts"));
    out.push(cmd("crossdeck revenue", "MRR & recognised cash", 24));
    out.push(cmd("crossdeck analytics", "Traffic & acquisition", 24));
    out.push(cmd("crossdeck errors", "An issue, stitched to who it hit", 24));
    out.push("");
    out.push(`  ${desc("Docs")}        ${tc(WORD, "cross-deck.com/docs")}`);
    out.push(`  ${desc("Run 'crossdeck help' for the full command tree.")}`);
  }
  out.push("");

  process.stdout.write(out.join("\n") + "\n");
}

function safeLoad(): { email?: string } | null {
  try {
    return credentialStore().load();
  } catch {
    // A too-permissive credential file throws on load; for the splash we treat
    // that as "signed out" rather than crashing the first impression.
    return null;
  }
}
