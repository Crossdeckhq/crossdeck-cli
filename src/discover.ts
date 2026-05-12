/**
 * Discover .js + .map pairs in a build directory.
 *
 * The customer hands us a path like `./dist` and a URL prefix like
 * `https://app.example.com/static/js/`. We walk the directory, find
 * every .js / .mjs / .cjs file, look for an adjacent .map, and verify
 * the pairing via the trailing `//# sourceMappingURL=` comment.
 *
 * Why we check the comment (rather than assuming `foo.js` pairs with
 * `foo.js.map`):
 *
 *   - Some bundlers emit the map at a different basename (Webpack
 *     can emit `foo.js` with `sourceMappingURL=bar.map`).
 *   - Some bundles ship without a sourceMappingURL — usually vendor
 *     files with no source-map shipped — we skip those silently.
 *   - We honour data-URI inline maps (skipped — they're already
 *     embedded in the bundle and don't need uploading).
 *
 * Files we DON'T scan:
 *   - node_modules/ (would re-discover library bundles every run)
 *   - Anything outside the dist root (file system safety)
 */

import { readFileSync, readdirSync, statSync, type Dirent } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";

import type { DiscoveredFile } from "./types.js";

const JS_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
// Match the trailing source-map comment as either `//# sourceMappingURL=...`
// or the older `//@ sourceMappingURL=...`. Greedy match to end of line.
const SOURCE_MAP_COMMENT_RE =
  /(?:\/\/[#@] sourceMappingURL=|\/\*[#@] sourceMappingURL=)\s*(\S+?)\s*(?:\*\/)?\s*$/;

export interface DiscoverOptions {
  /** Absolute path to the dist root. */
  distDir: string;
  /** URL prefix to prepend to each file's relative path. */
  urlPrefix: string;
  /**
   * When true, return discovery diagnostics (skipped files + reasons)
   * for the CLI to surface to the user. Default true.
   */
  collectDiagnostics?: boolean;
}

export interface DiscoveryDiagnostic {
  jsPath: string;
  reason: string;
}

export interface DiscoveryResult {
  files: DiscoveredFile[];
  skipped: DiscoveryDiagnostic[];
}

export function discoverSourcemaps(opts: DiscoverOptions): DiscoveryResult {
  const distDir = resolvePath(opts.distDir);
  const urlPrefix = opts.urlPrefix.replace(/\/+$/, "") + "/";
  const collect = opts.collectDiagnostics !== false;

  const files: DiscoveredFile[] = [];
  const skipped: DiscoveryDiagnostic[] = [];

  walk(distDir, (jsPath) => {
    const ext = extname(jsPath);
    if (!JS_EXTENSIONS.has(ext)) return;
    // Skip already-minified-map files etc. — they'd never pair up.
    if (jsPath.endsWith(".map")) return;

    let head: string;
    try {
      head = readTail(jsPath, 4096);
    } catch (err) {
      if (collect) {
        skipped.push({
          jsPath,
          reason: `Couldn't read file: ${(err as Error).message}`,
        });
      }
      return;
    }

    const match = head.match(SOURCE_MAP_COMMENT_RE);
    if (!match || !match[1]) {
      if (collect) {
        skipped.push({
          jsPath,
          reason: "No `//# sourceMappingURL=…` comment (vendor file or stripped maps).",
        });
      }
      return;
    }

    const mapRef = match[1];

    // Inline data URI — already embedded in the bundle, nothing for us
    // to upload separately.
    if (mapRef.startsWith("data:")) {
      if (collect) {
        skipped.push({
          jsPath,
          reason: "Map is inline (data URI). Reconfigure your bundler to emit an external .map for production.",
        });
      }
      return;
    }

    // Strip query/hash for the on-disk resolution. Webpack sometimes
    // emits `foo.map?v=123`; we want `foo.map` for the file lookup.
    const mapBaseName = mapRef.split(/[?#]/)[0] || mapRef;
    const mapPath = resolvePath(jsPath, "..", mapBaseName);

    if (!safeStat(mapPath)) {
      if (collect) {
        skipped.push({
          jsPath,
          reason: `Bundle references "${mapRef}" but the .map file doesn't exist at ${mapPath}`,
        });
      }
      return;
    }

    const relativePath = relative(distDir, jsPath).replace(/\\/g, "/");
    const fileUrl = urlPrefix + relativePath;

    files.push({
      mapPath,
      jsPath,
      relativePath,
      fileUrl,
    });
  });

  return { files, skipped };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function walk(dir: string, onFile: (p: string) => void): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return; // unreadable — skip
  }
  for (const e of entries) {
    const name = e.name;
    const full = join(dir, name);
    if (e.isDirectory()) {
      // Don't recurse into node_modules — would re-discover library bundles.
      if (name === "node_modules" || name === ".git") continue;
      walk(full, onFile);
    } else if (e.isFile()) {
      onFile(full);
    }
  }
}

function extname(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0) return "";
  return path.slice(i);
}

/**
 * Read the LAST n bytes of a file. The sourceMappingURL comment lives
 * at the end of a JS bundle by convention, so we don't need to slurp
 * the whole 5 MB minified file into memory.
 */
function readTail(path: string, n: number): string {
  // For simplicity at v1 scale, just read the whole file but only
  // search the trailing 4 KB. JS bundles are typically <1 MB and
  // sequential read of 1 MB is faster than a positioned read +
  // separate end-of-file scan on most filesystems.
  const buf = readFileSync(path);
  const start = Math.max(0, buf.length - n);
  return buf.slice(start).toString("utf8");
}

function safeStat(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
