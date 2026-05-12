/**
 * Programmatic exports — for build-tool plugins, custom CI scripts,
 * and tests that want to drive the upload flow without spawning the
 * CLI as a subprocess.
 *
 *   import { uploadSourcemaps, discoverSourcemaps } from "@cross-deck/cli";
 *
 * Same library, same wire shape — just no commander front end.
 */

export {
  uploadSourcemaps,
  ApiError,
  type UploadOptions,
  type UploadSummary,
} from "./api-client.js";
export {
  discoverSourcemaps,
  type DiscoverOptions,
  type DiscoveryResult,
  type DiscoveryDiagnostic,
} from "./discover.js";
export {
  resolveConfig,
  CliError,
  type ResolveOpts,
} from "./config.js";
export type {
  CliConfig,
  DiscoveredFile,
  Environment,
  UploadResponse,
  UploadResultItem,
} from "./types.js";
