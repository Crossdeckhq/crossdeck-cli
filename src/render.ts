/**
 * Terminal rendering — the Stripe-premium output layer. Aligned key/value rows,
 * section headers, dimmed captions, and coverage caveats surfaced honestly
 * (Crossdeck's "no bare numbers" rule: a number carries what it measures). All
 * colour degrades to plain text when stdout isn't a TTY or NO_COLOR is set.
 */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string): string => (useColor ? `[${code}m${s}[0m` : s);

export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  red: wrap("31"),
};

export function heading(text: string): void {
  process.stdout.write(`\n${c.bold(text)}\n`);
}

/** Aligned "label  value" rows. Labels right-padded to the longest. */
export function kv(rows: Array<[string, string]>): void {
  const width = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  for (const [k, v] of rows) {
    process.stdout.write(`  ${c.dim(k.padEnd(width))}  ${v}\n`);
  }
}

export function line(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function ok(text: string): void {
  process.stdout.write(`${c.green("✓")} ${text}\n`);
}

/** Surface a coverage caveat honestly. `state` is Crossdeck's coverage.state. */
export function coverageNote(coverage: unknown): void {
  if (!coverage || typeof coverage !== "object") return;
  const cov = coverage as { state?: string; note?: string };
  if (cov.state === "not_instrumented") {
    process.stdout.write(`  ${c.yellow("○")} ${c.dim("Not wired for this yet — not zero. " + (cov.note ?? ""))}\n`);
  } else if (cov.state === "unavailable") {
    process.stdout.write(`  ${c.yellow("○")} ${c.dim("Temporarily unavailable — try again. " + (cov.note ?? ""))}\n`);
  } else if (cov.note) {
    process.stdout.write(`  ${c.dim(cov.note)}\n`);
  }
}

/** Print raw JSON (for `--json`). Pretty, 2-space, no colour so it pipes clean. */
export function json(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Format cents to a currency string without a bare number. */
export function money(cents: unknown, currency = "USD"): string {
  if (typeof cents !== "number") return c.dim("—");
  return `${(cents / 100).toLocaleString(undefined, { style: "currency", currency })}`;
}
