/**
 * RFC 8252 loopback redirect receiver for `crossdeck login`.
 *
 * Starts a one-shot HTTP server bound to 127.0.0.1 on an ephemeral port (never
 * 0.0.0.0 — the loopback interface only, per spec §4). It waits for the single
 * `/callback?code&state` redirect the browser makes after consent, hands the
 * code back to the flow, shows the user a "you can close this tab" page, and
 * shuts down. A timeout aborts a login the user never completes.
 */

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

export interface LoopbackResult {
  code: string;
  state: string;
}

export interface Loopback {
  /** The exact redirect_uri to register + send to /authorize. */
  redirectUri: string;
  /** Resolves when the browser hits /callback with a code; rejects on error/timeout. */
  waitForCode(expectedState: string, timeoutMs: number): Promise<LoopbackResult>;
  close(): void;
}

const DONE_HTML = (ok: boolean, msg: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Crossdeck CLI</title>` +
  `<body style="font:15px -apple-system,system-ui,sans-serif;background:#f7f3ec;color:#14110f;display:grid;place-items:center;height:100vh;margin:0">` +
  `<div style="text-align:center;max-width:340px"><div style="font-size:28px;margin-bottom:10px">${ok ? "✓" : "✕"}</div>` +
  `<div style="font-weight:600;font-size:18px;margin-bottom:6px">${ok ? "Signed in to Crossdeck" : "Sign-in failed"}</div>` +
  `<div style="color:#6b6259">${msg}</div></div></body>`;

/** Bind a one-shot loopback receiver. Must be started BEFORE opening the browser. */
export async function startLoopback(): Promise<Loopback> {
  let server: Server;
  await new Promise<void>((resolve, reject) => {
    server = createServer();
    server.on("error", reject);
    // Port 0 → OS assigns a free ephemeral port. Host 127.0.0.1 only.
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const port = (server!.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const waitForCode = (expectedState: string, timeoutMs: number): Promise<LoopbackResult> =>
    new Promise<LoopbackResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for the browser sign-in. Run `crossdeck login` again."));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        server.close();
      };

      server.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", redirectUri);
        if (url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }
        const err = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (err) {
          res.writeHead(200, { "Content-Type": "text/html" }).end(DONE_HTML(false, "You can close this tab and try again."));
          cleanup();
          reject(new Error(`Authorization was denied (${err}).`));
          return;
        }
        // CSRF: the state MUST match byte-for-byte what we sent.
        if (!state || state !== expectedState) {
          res.writeHead(200, { "Content-Type": "text/html" }).end(DONE_HTML(false, "Security check failed. Close this tab and try again."));
          cleanup();
          reject(new Error("State mismatch on the OAuth redirect — possible interception. Login aborted."));
          return;
        }
        if (!code) {
          res.writeHead(200, { "Content-Type": "text/html" }).end(DONE_HTML(false, "No authorization code returned."));
          cleanup();
          reject(new Error("No authorization code on the redirect."));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" }).end(DONE_HTML(true, "You can close this tab and return to your terminal."));
        cleanup();
        resolve({ code, state });
      });
    });

  return { redirectUri, waitForCode, close: () => server!.close() };
}
