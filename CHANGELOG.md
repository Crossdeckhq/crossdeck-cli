# Changelog

All notable changes to `@cross-deck/cli` will be documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] — 2026-08-03

### Added

- **The interactive session (CD-159).** `crossdeck` on an interactive terminal now
  opens a working environment — like `claude` — instead of a one-shot. Inside it
  you type bare commands with no `crossdeck` prefix (`whoami`, `init`, `revenue`,
  `use prolend`, `help`, `exit`), and your active project persists across the
  session and shows in the prompt (`prolend ❯`). The splash is the session's
  header. Built-ins: `help`, `clear`, `exit`/`quit` (and Ctrl-D); Ctrl-C cancels
  the current line without leaving the session; a stray `crossdeck` prefix is
  tolerated.
- **Additive, never a replacement.** Every command is still a one-shot
  (`crossdeck revenue`, `crossdeck sourcemaps upload …`), so scripts and CI compose
  unchanged. The session opens only on an interactive TTY — a pipe or CI runner
  runs the command and exits, never trapped in a REPL.

## [1.3.0] — 2026-08-03

### Added

- **The launcher (CD-159).** `crossdeck` with no subcommand now prints the
  Stripe-premium splash — the brand's first impression in the terminal. Two
  states: signed-out leads with a single `login` path; signed-in reveals the two
  hats (stand up the engine → read the facts) with your identity and active
  project. Brand gradient X (`#FF3D2E → #FF9A3D` at 135°) in truecolor, degrading
  to coral on 16-colour terminals and plain block-art under `NO_COLOR`. No network
  call — identity + active project come from the local credential, so it's instant
  and works offline.
- **`crossdeck help` — the premium command tree.** Grouped by the two hats
  (Account · Stand up the engine · Read the facts · Source maps/CI) in the same
  restraint and palette as the launcher. `crossdeck help <command>` drills into a
  single command's flags.

### Changed

- **`crossdeck logout` now revokes server-side (RFC 7009).** It calls the new
  `POST /oauth/revoke`, which kills the whole refresh-token family AND the
  `cd_wk_` access tokens it minted, THEN wipes the local credential. A stolen
  `credentials.json` is dead the moment you log out — no longer a local-only wipe.
  The consent screen's "revoke anytime from Settings → Developer" is now a real,
  populated switch (dashboard **Connected apps** surface), not a dead reference.
- **`crossdeck login` / `whoami` greet you by identity.** Login caches the account
  email (best-effort, never blocks sign-in); the launcher and `whoami` show it.

## [1.2.0] — 2026-08-03

### Added

- **`crossdeck login` — browser OAuth sign-in (CD-162).** The keystone of the
  CLI's account/provisioning family. RFC 8252 native-app loopback + PKCE-S256,
  the same flow `gh auth login` and `stripe login` use: the CLI starts a
  `127.0.0.1` listener, opens the hosted Crossdeck consent page, catches the
  redirect, and exchanges the code for a `cd_wk_` workspace token. By default it
  requests full reads + provisioning scopes (`projects:write apps:write
  keys:write`) — the consent screen shows the developer exactly that — so the
  session can create projects/apps and mint keys as well as read. `--read-only`
  requests reads alone; `--no-browser` prints the URL for headless machines.
- **`crossdeck whoami`** — proves the session is live (refreshes + pings the
  workspace) and prints the API, granted scopes, and portfolio size.
- **`crossdeck logout`** — wipes the local credential (server-side revoke via
  Settings → Developer).
- **`crossdeck init` — zero to installed (CD-159).** One command creates a
  project, creates an app, mints its publishable keys, sets the project active,
  and prints the SDK snippet (`--env-file` writes a `.env`). The headless
  equivalent of clicking through dashboard onboarding.
- **`crossdeck projects create|list`, `crossdeck apps create|list`, `crossdeck
  use`** — headless provisioning over the CD-170 engine (`POST /v1/projects`,
  `POST /v1/apps`, `GET /v1/workspace/*`). `use` sets an active project so
  monitoring commands don't need `--project`.
- **`crossdeck revenue|analytics|errors`** — call the read REST APIs from the
  terminal on the same session. `errors --issue <fp>` renders the moat stitch
  (occurrences → affected users → how many pay). All take `--json`.
- **`crossdeck sourcemaps upload`** — the canonical namespaced form of
  `upload-sourcemaps` (kept as a permanent alias). Same key-based CI flow.
- **Credential custody.** The long-lived refresh token is stored `chmod 600` at
  `~/.crossdeck/credentials.json` behind a `CredentialStore` interface (OS
  keychain backend drops in next); the 1h access token is memory-only, never
  written to disk, never in argv or logs. Loose file perms are refused with the
  exact `chmod` fix. Refresh tokens rotate on every use.

This family is distinct from the CI / source-map family (`upload-sourcemaps`,
key-based via `cd_sk_`) — one binary, two clearly-separated jobs, so a developer
uploading source maps in CI never touches OAuth.

## [1.1.2] — 2026-06-30

### Docs

- Knowledge-backbone governance release. No runtime behavior change. This patch
  republishes the CLI with the Markdoc-backed README/version-control surface so
  npm, the public GitHub mirror, and the Crossdeck knowledge backbone all carry
  the same governed installation documentation.

## [1.1.1] — 2026-05-13

### Fixed

- Trailing-slash normalisation no longer corrupts Sentry sentinel
  schemes. Before: `--url-prefix app:///` produced `app:/file.js` on
  the wire because the naive `replace(/\/+$/, "")` ate the empty-host
  slashes. Now it preserves `scheme://[host]/` and only collapses
  extras on the path part — `app:///` stays `app:///`, `https://x.com/a//`
  becomes `https://x.com/a/`. Covered by 8 new test cases in
  `normaliseUrlPrefix`.

## [1.1.0] — 2026-05-13

Dogfood-driven polish from installing the CLI against a real Crossdeck
backend project. Three customer-surfaced gaps, all closed.

### Added

- `crossdeck doctor` — Sentry/Stripe-pattern install diagnostic. Validates
  auth token shape, derives environment from the key prefix, and proves
  API reachability without uploading anything. The pre-flight check
  customers should run once before wiring the CLI into CI.
- `CROSSDECK_SECRET_KEY` env var as the canonical name for the auth
  token. Matches every other Crossdeck SDK we publish.
  `CROSSDECK_AUTH_TOKEN` is honoured as a back-compat alias for users
  who set it during the v1.0.x window.
- `--url-prefix` now accepts Sentry-style sentinel schemes for
  non-browser bundles. `app:///` for server-side Node / Cloud
  Functions / Lambda, `webpack://` for worker bundles, `capacitor://`
  and `react-native://` for native shells. http(s) browser URLs
  continue to work unchanged.

### Changed

- "No maps found" hint now lists TypeScript's `tsc` alongside Vite /
  Webpack / ESBuild, and calls out the exact `tsconfig.json` settings
  required (`"sourceMap": true, "inlineSources": true`). The previous
  text mentioned bundler-only configurations.
- `--url-prefix` validation error names the actual supported forms
  (browser, server, native) instead of "must be http(s)".

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
