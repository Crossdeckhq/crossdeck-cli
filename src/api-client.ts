/**
 * HTTP client for the Crossdeck source-map upload endpoint.
 *
 * Single endpoint: POST {baseUrl}/v1/releases/sourcemaps.
 *
 * Chunks discovered files into batches of ≤100 per request (the
 * server's hard cap, declared in v1-releases.ts). Each file's source-
 * map JSON is base64-encoded onto the wire so the batch is a single
 * application/json POST — no multipart parsing, no Content-Type
 * negotiation, no boundary tokens.
 *
 * Auth: a single `cd_sk_*` secret key in the Authorization header.
 *
 * Errors are surfaced as `ApiError` with a request_id so the customer
 * can correlate with backend logs if they email support.
 */

import { readFileSync } from "node:fs";

import type {
  CliConfig,
  DiscoveredFile,
  Environment,
  UploadResponse,
  UploadResultItem,
} from "./types.js";

/**
 * Max files per HTTP POST. Mirrors the backend's
 * `MAX_FILES_PER_REQUEST` (v1-releases.ts).
 */
const BATCH_SIZE = 100;

export interface UploadOptions {
  config: CliConfig;
  release: string;
  environment: Environment;
  files: DiscoveredFile[];
  /** Per-batch progress callback. Optional. */
  onBatchComplete?: (info: {
    batchIndex: number;
    batchCount: number;
    response: UploadResponse;
  }) => void;
}

export interface UploadSummary {
  uploaded: number;
  skipped: number;
  errors: UploadResultItem[];
  results: UploadResultItem[];
}

export async function uploadSourcemaps(
  opts: UploadOptions,
): Promise<UploadSummary> {
  const batches = chunk(opts.files, BATCH_SIZE);
  const summary: UploadSummary = {
    uploaded: 0,
    skipped: 0,
    errors: [],
    results: [],
  };

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const body = {
      release: opts.release,
      environment: opts.environment,
      files: batch.map((f) => ({
        fileUrl: f.fileUrl,
        // The backend re-hashes; we send it for parity with the wire spec.
        // Empty here is fine — the server is authoritative on the hash.
        sourceMap: encodeMapToBase64(f.mapPath),
      })),
    };

    const response = await postJson<UploadResponse>(
      `${opts.config.baseUrl}/v1/releases/sourcemaps`,
      opts.config.authToken,
      body,
    );

    summary.uploaded += response.uploaded;
    summary.skipped += response.skipped;
    summary.errors.push(...response.errors);
    summary.results.push(...response.results);

    opts.onBatchComplete?.({
      batchIndex: i,
      batchCount: batches.length,
      response,
    });
  }

  return summary;
}

// ────────────────────────────────────────────────────────────────────
// HTTP — bare fetch (Node 18+ has it natively)
// ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId: string | null;
  constructor(opts: {
    message: string;
    status: number;
    code: string;
    requestId: string | null;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId;
  }
}

async function postJson<T>(
  url: string,
  authToken: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Crossdeck-Sdk-Version": "@cross-deck/cli@1.0.0",
    },
    body: JSON.stringify(body),
  });

  const requestId = res.headers.get("x-request-id");

  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const error =
      parsed && typeof parsed === "object" && "error" in parsed
        ? (parsed as { error: { code?: string; message?: string } }).error
        : null;
    throw new ApiError({
      status: res.status,
      code: error?.code ?? "http_error",
      message:
        error?.message ??
        `Upload failed (HTTP ${res.status}). Run with --verbose for details.`,
      requestId,
    });
  }

  return (await res.json()) as T;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function encodeMapToBase64(mapPath: string): string {
  // The map is a JSON file; we don't parse it client-side because the
  // backend validates anyway. Base64 keeps the JSON body shape simple.
  const buf = readFileSync(mapPath);
  return buf.toString("base64");
}
