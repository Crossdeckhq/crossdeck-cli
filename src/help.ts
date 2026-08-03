/**
 * `crossdeck help` — the premium command tree, grouped the way the launcher
 * groups: Account, then the two hats (stand up the engine → read the facts),
 * then the CI / source-map family. Same restraint and palette as the launcher.
 *
 * `crossdeck help <command>` and `crossdeck <command> --help` defer to
 * commander's per-command help (exact flags); this is the bird's-eye tree.
 */

const isTTY = !!process.stdout.isTTY;
const useColor = isTTY && !process.env.NO_COLOR;
const truecolor = useColor && /truecolor|24bit/i.test(process.env.COLORTERM ?? "");

const CORAL = [255, 107, 84] as const;
const WORD = [241, 234, 226] as const;
const DESC = [140, 131, 123] as const;

type RGB = readonly [number, number, number];
const tc = (rgb: RGB, s: string): string =>
  truecolor ? `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[0m` : useColor ? `\x1b[91m${s}\x1b[0m` : s;
const ansi = (code: string, s: string): string => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s: string): string => ansi("2", s);
const bold = (s: string): string => ansi("1", s);
const coral = (s: string): string => tc(CORAL, s);
const desc = (s: string): string => (truecolor ? tc(DESC, s) : dim(s));

interface Cmd {
  name: string;
  desc: string;
}
interface Group {
  title: string;
  note?: string;
  cmds: Cmd[];
}

const GROUPS: Group[] = [
  {
    title: "Account",
    note: "Sign in with your browser (OAuth). Grants this machine provisioning + read access.",
    cmds: [
      { name: "login", desc: "Sign in — opens your browser (--read-only, --no-browser)" },
      { name: "whoami", desc: "Show the active session — API, scopes, portfolio size" },
      { name: "logout", desc: "Sign out — revokes this machine server-side" },
    ],
  },
  {
    title: "Stand up the engine",
    cmds: [
      { name: "init", desc: "Zero to installed: project + app, mint keys, print the SDK snippet" },
      { name: "projects create", desc: "Create a project (-n name, --business-model, --activate)" },
      { name: "projects list", desc: "List the projects you own" },
      { name: "apps create", desc: "Create an app + mint publishable keys (-P web|ios|android)" },
      { name: "apps list", desc: "List apps (all, or one project's with -p)" },
      { name: "use", desc: "Set (or show) the active project for later commands" },
    ],
  },
  {
    title: "Read the facts",
    note: "Read-only. Every number is self-describing — coverage and semantics travel with it.",
    cmds: [
      { name: "revenue", desc: "Recognised cash for a project (GET /v1/revenue)" },
      { name: "analytics", desc: "Signup acquisition sources (GET /v1/acquisition)" },
      { name: "errors", desc: "One issue, stitched to who it hit (-i <fingerprint>)" },
    ],
  },
  {
    title: "Source maps · CI",
    note: "Key-based (cd_sk_…), no login. What the Errors tab means by 'install the CLI'.",
    cmds: [
      { name: "sourcemaps upload", desc: "Upload .map files so the dashboard resolves minified frames" },
      { name: "upload-sourcemaps", desc: "Permanent alias for `sourcemaps upload`" },
      { name: "doctor", desc: "Validate auth + API reachability without uploading" },
    ],
  },
];

let CLI_VERSION = "0.0.0";
export function setHelpVersion(v: string): void {
  CLI_VERSION = v;
}

export function renderHelp(): void {
  const pad = Math.max(
    ...GROUPS.flatMap((g) => g.cmds.map((c) => c.name.length)),
  );
  const out: string[] = [];

  out.push("");
  out.push(`  ${bold(tc(WORD, "crossdeck"))} ${coral("CLI")}  ${desc(`· v${CLI_VERSION}`)}`);
  out.push(`  ${desc("Sign in, provision projects & apps, and read the facts — from your terminal.")}`);
  out.push("");
  out.push(`  ${desc("Two ways to drive it — same engine:")}`);
  out.push(`    crossdeck               ${desc("# open the session (interactive) — type bare commands, no prefix")}`);
  out.push(`    crossdeck ${coral("<command>")}     ${desc("# one-shot — for scripts & CI")}`);
  out.push("");
  out.push(`  ${desc("Usage:")}  crossdeck ${coral("<command>")} ${desc("[options]")}`);
  out.push(`          crossdeck help ${coral("<command>")}  ${desc("# flags for one command")}`);

  for (const g of GROUPS) {
    out.push("");
    out.push(`  ${desc(g.title.toUpperCase())}`);
    if (g.note) out.push(`  ${dim(g.note)}`);
    for (const c of g.cmds) {
      out.push(`    ${coral(c.name.padEnd(pad))}  ${desc(c.desc)}`);
    }
  }

  out.push("");
  out.push(`  ${desc("Docs")}  ${tc(WORD, "cross-deck.com/docs/cli")}   ${desc("Global flags:")} --json, --base-url <url>`);
  out.push("");

  process.stdout.write(out.join("\n") + "\n");
}
