# Changelog

All notable changes to `@cross-deck/cli` will be documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-12

Initial release.

### Added

- `crossdeck upload-sourcemaps` command — discovers `.js + .map` pairs
  in a build directory, batches them into ≤100-file chunks, uploads
  to `/v1/releases/sourcemaps` with a `cd_sk_*` secret key.
- Directory walker that honours the trailing `//# sourceMappingURL=`
  comment for accurate `.js` ↔ `.map` pairing (Webpack, Vite, Rollup,
  ESBuild, Next.js).
- Edge-case handling: inline data-URI maps (skipped with hint),
  missing companion `.map` files (skipped with hint), `?v=…` query
  suffix on the source-map comment, `.mjs` and `.cjs` extensions,
  nested asset directories, automatic `node_modules` exclusion.
- Auth resolution via `CROSSDECK_AUTH_TOKEN` env var or
  `--auth-token` flag. Publishable keys (`cd_pub_*`) rejected with
  a clear error message.
- Optional `CROSSDECK_PROJECT_ID` env var / `--project` flag — backend
  infers project from the secret key but the flag lets multi-tenant
  CI scripts assert which tenant they expect to hit.
- Per-batch progress callback so CI logs surface upload progress
  rather than blocking quietly.
- Bank-grade error mapping: HTTP error responses become typed
  `ApiError` with `status`, `code`, and `requestId` so customers can
  correlate failures with backend logs.
- 24 unit tests (discover, config, api-client). Coverage thresholds
  enforced at 80%/80% statements/branches.
- README with bundler-by-bundler setup guide, CI examples (GitHub
  Actions, Vercel), exit-code reference, and privacy posture.
