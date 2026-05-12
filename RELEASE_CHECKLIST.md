# `@cross-deck/cli` release checklist

Procedural gate before every `npm publish`. Same posture as the web
and Node SDKs: no surprises, no silent contract drift, no half-
tested artefacts.

---

## 0. Pre-flight

- [ ] `package.json#version` and `CHANGELOG.md` agree on the version.
- [ ] Backend routes the CLI hits (`POST /v1/releases/sourcemaps`)
      are deployed.
- [ ] README examples match the current command surface exactly.
- [ ] Public source repo exists at `VistaApps-za/crossdeck-cli`.
- [ ] `package.json → repository.url` points at the public repo
      before publishing.
- [ ] `./sync-to-public-repo.sh "<release commit message>"` has
      mirrored the CLI into the public repo.

## 1. Automated gates

- [ ] `npm run lint` — `tsc --noEmit` clean.
- [ ] `npm test` — all unit tests green.
- [ ] `npm run build` — `tsup` emits `dist/cli.cjs`, `dist/cli.mjs`,
      `dist/index.cjs`, `dist/index.mjs`, plus matching `.d.ts` and
      `.d.cts` declarations.
- [ ] `node dist/cli.cjs --version` prints the package version.
- [ ] `node dist/cli.cjs upload-sourcemaps --help` renders the
      command surface verbatim (no commander internals leaked).

## 2. Manual smoke

- [ ] Build a tiny Vite test project with `sourcemap: true`.
- [ ] Run the CLI against `./dist` with a real `cd_sk_test_…` key
      and a sandbox `--url-prefix`.
- [ ] Verify the response says `uploaded > 0, errors: []`.
- [ ] In the Crossdeck dashboard, trigger an error from the test
      app. Check the issue detail page renders the resolved frame
      reference (`src/...:line — function`) within seconds.
- [ ] Disconnect the test (delete the release via the dashboard or
      let it cycle out) and re-run. Verify the run is idempotent.

## 3. Publish

- [ ] `npm publish --access public`
- [ ] 2FA via passkey / authenticator app at the npm prompt.
- [ ] `npm view @cross-deck/cli versions` lists the new version.
- [ ] Tag in the monorepo: `git tag cli-v<X.Y.Z> && git push --tags`.

## 4. Post-publish

- [ ] Pull the published version in a clean directory:
      `npx @cross-deck/cli@latest --version`.
- [ ] Update internal documentation (docs site, onboarding) with
      the new version's command examples.
- [ ] Slack the release to the customer channel for high-volume
      tenants who'll want to pin.
