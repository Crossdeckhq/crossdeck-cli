# @cross-deck/cli

Upload source maps to Crossdeck so production stack traces resolve back to original `file:line:function` references on the dashboard.

```bash
npm install -D @cross-deck/cli
# or one-shot:
npx @cross-deck/cli upload-sourcemaps \
  --release v1.2.3 \
  --url-prefix https://app.example.com/static/js/ \
  ./dist
```

## What it does

After your bundler runs, your `./dist` directory holds a bunch of minified `.js` files alongside `.js.map` companions. Browsers run the `.js`; the `.map` translates a minified line:column back to your original source — but only if Crossdeck can find it.

This CLI walks `./dist`, pairs every `.js` with its `.map` via the trailing `//# sourceMappingURL=` comment, and ships the maps to the Crossdeck backend. The next error event from production then renders as `src/checkout/Pay.tsx:114 — handleSubmit` instead of `main.a1b2c3.js:1:48202`.

Source maps stay private — they're stored in private Cloud Storage and never served to dashboard clients. Only resolved frames go out.

## Authentication

The CLI needs a Crossdeck **secret** key (`cd_sk_test_…` or `cd_sk_live_…`). Get one at [/dashboard/developers/api-keys/](https://cross-deck.com/dashboard/developers/api-keys/).

Pick one of:

```bash
# Recommended for CI: set once, every command inherits.
export CROSSDECK_AUTH_TOKEN=cd_sk_live_…

# Or pass per-invocation:
crossdeck upload-sourcemaps --auth-token cd_sk_live_… …
```

Publishable keys (`cd_pub_…`) are rejected — source maps reveal original source code, so they need server-only credentials.

## Configuration

| Source                       | Notes                                         |
| ---------------------------- | --------------------------------------------- |
| `CROSSDECK_AUTH_TOKEN`       | Secret key. Required.                         |
| `CROSSDECK_PROJECT_ID`       | Optional — backend infers from the key.       |
| `CROSSDECK_BASE_URL`         | Defaults to `https://api.cross-deck.com`.     |

CLI flags `--auth-token` / `--project` / `--base-url` always override env vars.

## Bundler setup

Your bundler needs to emit external `.map` files with `sourcesContent` inlined:

| Bundler           | Config                                          |
| ----------------- | ----------------------------------------------- |
| **Vite / Rollup** | `build: { sourcemap: true }`                    |
| **Webpack**       | `devtool: 'source-map'`                         |
| **ESBuild**       | `sourcemap: true`, `sourcesContent: true`       |
| **Next.js**       | `productionBrowserSourceMaps: true`             |
| **Turbopack**     | Source maps are emitted by default in Next 14+. |

Avoid `devtool: 'eval-source-map'` and `devtool: 'inline-source-map'` for production builds — those embed the map in the bundle and can't be uploaded separately.

## Usage in CI

GitHub Actions:

```yaml
- name: Build
  run: npm run build
- name: Upload source maps
  env:
    CROSSDECK_AUTH_TOKEN: ${{ secrets.CROSSDECK_AUTH_TOKEN }}
  run: |
    npx @cross-deck/cli upload-sourcemaps \
      --release ${{ github.sha }} \
      --url-prefix https://app.example.com/static/js/ \
      ./dist
```

Vercel (in `package.json`):

```jsonc
{
  "scripts": {
    "build": "next build",
    "postbuild": "crossdeck upload-sourcemaps --release $VERCEL_GIT_COMMIT_SHA --url-prefix https://$VERCEL_URL/_next/ ./.next/static"
  }
}
```

The release identifier is whatever you want — semver, commit SHA, build number. Keep it consistent with the `release` field your app emits via `Crossdeck.init({ appVersion: '…' })`.

## How it works

1. Walks the dist directory; finds every `.js` / `.mjs` / `.cjs` file.
2. Reads the trailing `//# sourceMappingURL=` comment of each bundle.
3. Resolves the comment's path against the bundle's directory.
4. Builds the runtime URL: `{urlPrefix}{relativePath}`.
5. Chunks the discovered pairs into batches of ≤100 files.
6. POSTs each batch to `/v1/releases/sourcemaps` with the secret key.

Files without a `sourceMappingURL` comment, with an inline data-URI map, or with a missing companion `.map` are skipped (use `--verbose` to see why).

## Exit codes

| Code | Meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| `0`  | All maps uploaded successfully (or no maps to upload — empty dir is not a fail) |
| `1`  | Upload error (network / auth / per-file rejection)                              |
| `2`  | Argument / flag validation error                                                |

## Privacy

Source maps are sensitive — they reveal original source code, including function names, variable names, file paths, and comments. Crossdeck stores them in private Cloud Storage with the same access posture as your customer database. Only **resolved frames** (the post-decode `file:line` references) ever leave the backend; the raw map content is never exposed to the dashboard or any client.

## License

MIT
