/**
 * `crossdeck upload-sourcemaps` command.
 *
 *   crossdeck upload-sourcemaps \
 *     --release v1.2.3 \
 *     --url-prefix https://app.example.com/static/js/ \
 *     ./dist
 *
 * Walks `./dist`, finds .js + .map pairs, batches them in groups of
 * ≤100, POSTs each batch to /v1/releases/sourcemaps with a `cd_sk_*`
 * secret key. Reports per-file outcome at the end.
 *
 * Designed to be CI-friendly: exits non-zero on any error so a build
 * pipeline doesn't silently advance past a failed upload, but exits
 * zero when there were no maps to upload (e.g. running the command
 * on a directory that doesn't have a build yet).
 */

import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { ApiError, uploadSourcemaps } from "../api-client.js";
import { CliError, resolveConfig, type ResolveOpts } from "../config.js";
import { discoverSourcemaps } from "../discover.js";
import type { Environment } from "../types.js";

export interface UploadCommandOptions extends ResolveOpts {
  release?: string;
  urlPrefix?: string;
  environment?: string;
  verbose?: boolean;
}

/**
 * Entry point invoked by commander. Returns the process exit code
 * (0 = success, non-zero = error / partial failure).
 */
export async function uploadSourcemapsCommand(
  distDir: string | undefined,
  opts: UploadCommandOptions,
): Promise<number> {
  // ── Arg validation ───────────────────────────────────────────────
  if (!distDir) {
    printError("Missing required argument: dist directory.");
    printHint(
      'Usage: crossdeck upload-sourcemaps --release v1.2.3 --url-prefix https://app.example.com/static/ ./dist',
    );
    return 2;
  }

  const release = opts.release?.trim();
  if (!release) {
    printError("--release is required.");
    return 2;
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(release)) {
    printError(
      "--release must be 1–64 chars: letters, digits, dot, underscore, hyphen.",
    );
    return 2;
  }

  const urlPrefix = opts.urlPrefix?.trim();
  if (!urlPrefix) {
    printError("--url-prefix is required.");
    printHint("  Browser apps:        --url-prefix https://app.example.com/static/js/");
    printHint("  Server-side / Node:  --url-prefix app:///");
    return 2;
  }
  // Accept any scheme that maps to a stack-trace URL pattern.
  //   http(s)://...     — browser bundles served from a CDN/origin
  //   app:///...        — server-side / native Node (Sentry sentinel)
  //   webpack://...     — frames emitted by webpack inside workers
  //   cdn://, capacitor://, ionic://, react-native://, etc.
  // Sentry-compatible: any scheme followed by :// is permitted.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(urlPrefix)) {
    printError("--url-prefix must be a URL with an explicit scheme.");
    printHint("  Browser:      https://app.example.com/static/js/");
    printHint("  Server-side:  app:///         (Node / Lambda / Cloud Functions)");
    printHint("  Native:       capacitor://localhost/  or  react-native://0.0.0.0/");
    return 2;
  }

  const environment: Environment =
    opts.environment === "sandbox"
      ? "sandbox"
      : opts.environment === "production" || opts.environment === undefined
        ? "production"
        : (() => {
            printError(
              "--environment must be 'production' or 'sandbox' (default: production).",
            );
            return null as never;
          })();

  const resolvedDist = resolvePath(distDir);
  if (!existsSync(resolvedDist)) {
    printError(`Dist directory does not exist: ${resolvedDist}`);
    return 2;
  }
  if (!statSync(resolvedDist).isDirectory()) {
    printError(`Not a directory: ${resolvedDist}`);
    return 2;
  }

  // ── Config (auth + base URL) ─────────────────────────────────────
  let config;
  try {
    config = resolveConfig(opts);
  } catch (err) {
    if (err instanceof CliError) {
      printError(err.message);
      return 1;
    }
    throw err;
  }

  // ── Discovery ────────────────────────────────────────────────────
  const t0 = Date.now();
  const { files, skipped } = discoverSourcemaps({
    distDir: resolvedDist,
    urlPrefix,
  });

  if (files.length === 0) {
    printInfo(`No .js + .map pairs found under ${resolvedDist}`);
    if (skipped.length > 0 && opts.verbose) {
      printInfo("\nFiles inspected but skipped:");
      for (const s of skipped.slice(0, 10)) {
        printInfo(`  • ${s.jsPath}`);
        printInfo(`    ${s.reason}`);
      }
      if (skipped.length > 10) {
        printInfo(`  …and ${skipped.length - 10} more (pass --verbose for full list).`);
      }
    } else if (skipped.length > 0) {
      printInfo(`(${skipped.length} files skipped — pass --verbose to see why.)`);
    }
    printInfo(
      "\nDid you point at the right directory?\n" +
        "  Vite / Rollup:     ./dist\n" +
        "  Webpack / Next.js: ./build  (or .next/static/ for Next.js)\n" +
        "  TypeScript (tsc):  ./lib    (or your tsconfig outDir)\n" +
        "  ESBuild:           wherever your bundle is written\n\n" +
        "Did your build emit sourcemaps WITH inline source content?\n" +
        "  TypeScript (tsc):  tsconfig.json → \"sourceMap\": true, \"inlineSources\": true\n" +
        "  Vite / Rollup:     build.sourcemap: true  (sourcesContent inlined by default)\n" +
        "  Webpack:           devtool: 'source-map'\n" +
        "  ESBuild:           sourcemap: true, sourcesContent: true",
    );
    return 0;
  }

  printInfo(
    `Found ${files.length} sourcemap${files.length === 1 ? "" : "s"} under ${resolvedDist}`,
  );
  if (opts.verbose) {
    for (const f of files) {
      printInfo(`  ${f.relativePath}  →  ${f.fileUrl}`);
    }
  } else if (files.length > 5) {
    for (const f of files.slice(0, 3)) {
      printInfo(`  ${f.relativePath}  →  ${f.fileUrl}`);
    }
    printInfo(`  …and ${files.length - 3} more.`);
  } else {
    for (const f of files) {
      printInfo(`  ${f.relativePath}  →  ${f.fileUrl}`);
    }
  }

  if (skipped.length > 0 && opts.verbose) {
    printInfo("\nSkipped (no map / inline map / unreadable):");
    for (const s of skipped) {
      printInfo(`  • ${s.jsPath}  (${s.reason})`);
    }
  }

  // ── Upload ───────────────────────────────────────────────────────
  printInfo(
    `\nUploading to ${config.baseUrl} as release ${release} (${environment})…`,
  );

  let summary;
  try {
    summary = await uploadSourcemaps({
      config,
      release,
      environment,
      files,
      onBatchComplete: ({ batchIndex, batchCount, response }) => {
        printInfo(
          `  Batch ${batchIndex + 1}/${batchCount}: ${response.uploaded} uploaded, ${response.errors.length} error${
            response.errors.length === 1 ? "" : "s"
          }`,
        );
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      printError(
        `Upload failed: ${err.message}\n` +
          `  Status: ${err.status}\n` +
          `  Code:   ${err.code}` +
          (err.requestId ? `\n  Request: ${err.requestId}` : ""),
      );
      return 1;
    }
    throw err;
  }

  // ── Summary ──────────────────────────────────────────────────────
  const elapsedMs = Date.now() - t0;
  printInfo("");
  printInfo(`✓ ${summary.uploaded} sourcemap${summary.uploaded === 1 ? "" : "s"} uploaded in ${(elapsedMs / 1000).toFixed(1)}s`);

  if (summary.errors.length > 0) {
    printError(`${summary.errors.length} file${summary.errors.length === 1 ? "" : "s"} failed:`);
    for (const e of summary.errors) {
      printError(`  • ${e.fileUrl}`);
      printError(`    ${e.error?.code}: ${e.error?.message}`);
    }
    return 1;
  }

  printInfo(
    `\nProduction stack traces for release ${release} will now decode to original source on the next view.\n` +
      `Dashboard → https://cross-deck.com/dashboard/errors/`,
  );
  return 0;
}

// ────────────────────────────────────────────────────────────────────
// IO helpers — kept narrow so we can swap to a structured-log mode
// later without changing every call site.
// ────────────────────────────────────────────────────────────────────

function printInfo(line: string): void {
  process.stdout.write(`${line}\n`);
}

function printError(line: string): void {
  process.stderr.write(`${line}\n`);
}

function printHint(line: string): void {
  process.stderr.write(`${line}\n`);
}
