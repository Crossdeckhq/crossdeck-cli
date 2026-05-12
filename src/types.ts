/**
 * Shared CLI types — single source of truth for the wire shapes the
 * upload command builds and consumes.
 *
 * Keep these intentionally narrow: the CLI emits exactly what the
 * backend's POST /v1/releases/sourcemaps consumes, no extras. Adding
 * a field here without adding the matching path on the backend ends
 * up as a silently dropped CLI feature.
 */

export type Environment = "production" | "sandbox";

/**
 * One discovered .js + .map pair, fully resolved into the wire shape
 * the upload endpoint accepts.
 */
export interface DiscoveredFile {
  /** Absolute path to the .map file on disk. */
  mapPath: string;
  /** Absolute path to the corresponding .js bundle. */
  jsPath: string;
  /** Path of the .js bundle relative to the dist root. */
  relativePath: string;
  /** Final runtime URL: urlPrefix + relativePath. */
  fileUrl: string;
}

/**
 * Per-file outcome returned by the batch upload endpoint.
 */
export interface UploadResultItem {
  fileUrl: string;
  status: "uploaded" | "skipped" | "error";
  error?: { code: string; message: string };
}

/**
 * Top-level response from POST /v1/releases/sourcemaps.
 */
export interface UploadResponse {
  object: "sourcemap_batch";
  release: string;
  environment: Environment;
  uploaded: number;
  skipped: number;
  errors: UploadResultItem[];
  results: UploadResultItem[];
}

/**
 * Resolved CLI configuration — merged from env vars, flags, and rc files.
 */
export interface CliConfig {
  authToken: string;
  projectId: string | undefined;
  baseUrl: string;
}
