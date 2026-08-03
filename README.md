# @cross-deck/cli

The Crossdeck command line. Sign in, spin up a project, mint keys, and watch your
revenue, errors, and analytics — without leaving the terminal.

```bash
npm i -g @cross-deck/cli
crossdeck                # opens the session — a working environment
```

`crossdeck` on an interactive terminal opens a **session** (like `claude`). Inside
it you type bare commands with no prefix, and your active project persists across
the whole session and shows in the prompt:

```
prolend ❯ login          # sign in through your browser
prolend ❯ init --name "My App" --platform web
prolend ❯ revenue
prolend ❯ exit
```

**Two ways to drive it — same engine.** Prefer one-shot commands? Everything is
*also* a plain command, no session: `crossdeck login`, `crossdeck init …`,
`crossdeck revenue`. Use the session by hand; use one-shot in scripts and CI.
Crossdeck opens a session **only** on an interactive terminal — a pipe or CI
runner runs the command and exits, never trapped in a REPL.

> **New to Crossdeck?** The docs have a word-for-word walkthrough from a blank
> machine to a live project with identity wired and a payment rail connected:
> **[cross-deck.com/docs/cli → Zero to a running account](https://cross-deck.com/docs/cli#arc)**.

---

## Two families, one binary

`crossdeck` does two distinct jobs. They share nothing but the name, on purpose —
so you never trip from one into the other.

| Family | Commands | Auth | Runs where |
| --- | --- | --- | --- |
| **Account** — provision & monitor | `login`, `init`, `projects`, `apps`, `use`, `revenue`, `analytics`, `errors` | **`crossdeck login`** (browser OAuth) | your machine |
| **Build** — source maps ("the errors CLI") | `sourcemaps upload` (alias: `upload-sourcemaps`), `doctor` | a **`cd_sk_`** secret key | CI |

If you came here to get readable production stack traces, you only need the
**Build** family — jump to [Source maps](#source-maps-the-errors-cli). It never
asks you to log in.

---

## Account family

### Sign in

```bash
crossdeck login            # opens your browser, RFC 8252 loopback + PKCE
crossdeck whoami           # show the active session, scopes, and project count
crossdeck logout           # sign out on this machine
```

`login` uses the same flow as `gh auth login` and `stripe login`: it opens a
consent page, you approve, and a short-lived token lands back in the CLI. By
default it requests **read + provisioning** scopes (`projects:write apps:write
keys:write`) — the consent screen shows you exactly what you're granting. Want a
read-only session? `crossdeck login --read-only`. Headless box with no browser?
`crossdeck login --no-browser` prints the URL to open elsewhere.

Your credentials are stored owner-only (`chmod 600`) at
`~/.crossdeck/credentials.json`. The long-lived refresh token never leaves that
file; the 1-hour access token lives in memory only and is never written to disk,
argv, or logs. **`crossdeck logout` revokes this machine's session server-side**
(RFC 7009) and then wipes the local file — a stolen `credentials.json` is dead the
moment you log out. Manage and revoke every connected machine from the dashboard's
**Settings → Developer → Connected apps**.

### Zero to installed

```bash
crossdeck init --name "My App" --platform web
```

`init` creates the project, creates the app, mints its publishable keys, sets the
project active, and prints the install snippet:

```
Setting up your Crossdeck project
✓ Project proj_a1b2c3d4 — My App
✓ App app_web_9f8e7d (web)

Your publishable keys
  live  cd_pub_live_…
  test  cd_pub_test_…

Install — web
  import { Crossdeck } from "@cross-deck/web";
  Crossdeck.init({ publishableKey: "cd_pub_live_…" });
  // after your user signs in:
  await Crossdeck.identify(currentUser.id);
```

Add `--env-file` to drop the keys into a `.env`. For native apps, pass
`--platform ios --bundle-id com.you.app` or `--platform android --package-name
com.you.app`.

> **Web origins configure themselves.** A new web app starts with an empty
> allow-list; the first heartbeat from your SDK learns your origin (and its
> `*.your-domain.com` wildcard) automatically. Know your domain up front? Pass
> `--domain app.example.com` and it's seeded so the key works on the first load.

### Projects & apps

```bash
crossdeck projects create --name "Checkout" --business-model subscription --activate
crossdeck projects list
crossdeck use proj_a1b2c3d4                 # set the active project

crossdeck apps create --platform web --domain app.example.com
crossdeck apps create --platform ios --bundle-id com.you.app
crossdeck apps list
```

`use` sets the active project so you can drop `--project` from later commands.
Every command that returns data also takes `--json` for the raw envelope.

### Monitor

```bash
crossdeck revenue                            # recognised cash for the active project
crossdeck analytics                          # where your signups came from
crossdeck errors --issue <fingerprint>       # one issue — and how many affected users PAY you
```

`errors` is the moat in one line: it stitches an error to the people it hit and
how many of them are paying customers — the cross-layer answer no single-tool
error tracker can give.

---

## Source maps (the errors CLI)

This is the CI/build family — key-based, no login. It uploads your `.map` files
so a production stack trace renders as `src/checkout/Pay.tsx:114 — handleSubmit`
instead of `main.a1b2c3.js:1:48202`.

```bash
npx @cross-deck/cli sourcemaps upload \
  --release v1.2.3 \
  --url-prefix https://app.example.com/static/js/ \
  ./dist
```

`upload-sourcemaps ./dist …` is a permanent alias of `sourcemaps upload ./dist …`
— both work identically.

**Auth:** a Crossdeck **secret** key (`cd_sk_test_…` / `cd_sk_live_…`), from
[/dashboard/developers/api/](https://cross-deck.com/dashboard/developers/api/).
Publishable keys are rejected — source maps reveal source, so they need
server-only credentials.

```bash
export CROSSDECK_SECRET_KEY=cd_sk_live_…     # canonical (CROSSDECK_AUTH_TOKEN also honoured)
```

**Bundler must emit external maps** with `sourcesContent`:

| Bundler | Config |
| --- | --- |
| Vite / Rollup | `build: { sourcemap: true }` |
| Webpack | `devtool: 'source-map'` |
| ESBuild | `sourcemap: true`, `sourcesContent: true` |
| Next.js | `productionBrowserSourceMaps: true` |

Avoid `eval-source-map` / `inline-source-map` for production — those can't be
uploaded separately.

**In CI (GitHub Actions):**

```yaml
- run: npm run build
- env: { CROSSDECK_SECRET_KEY: ${{ secrets.CROSSDECK_SECRET_KEY }} }
  run: npx @cross-deck/cli sourcemaps upload --release ${{ github.sha }} --url-prefix https://app.example.com/static/js/ ./dist
```

`crossdeck doctor` validates your key, environment, and API reachability without
uploading anything.

Source maps stay private — stored in private Cloud Storage, never served to any
client. Only resolved `file:line` frames ever leave the backend.

---

## Configuration

| Variable | Used by | Default |
| --- | --- | --- |
| `CROSSDECK_SECRET_KEY` | source maps (CI) | — (required for that family) |
| `CROSSDECK_PROJECT_ID` | account monitor commands | active project from `crossdeck use` |
| `CROSSDECK_BASE_URL` / `--base-url` | all | `https://api.cross-deck.com` |
| `CROSSDECK_CONFIG_DIR` | credential + config location | `~/.crossdeck` |

Flags always override environment variables.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime error (auth, network, API rejection — carries a `request_id`) |
| `2` | Argument / flag validation error |

## Security

- **PKCE-S256 + loopback** — `login` binds a one-shot listener to `127.0.0.1`
  only, with a random `state` checked byte-for-byte on return.
- **Least-privilege, consented** — the token is the narrowest that serves the
  session; write access is a visible step on the consent screen, never assumed.
- **Custody** — refresh token `chmod 600`, rotated on every use; access token
  memory-only; loose file permissions are refused with the exact fix.
- **One boundary** — read and write authenticate through the same gate, one scope
  model, one audit chain. Every write you make is audit-logged exactly like the
  dashboard's.

## License

MIT
