/**
 * PKCE (RFC 7636) + state generation for the `crossdeck login` loopback flow.
 *
 * The provider mandates S256 (backend/src/api/oauth.ts rejects anything else),
 * so we only implement S256. All values are cryptographically random and
 * base64url-encoded with no padding, per spec.
 */

import { createHash, randomBytes } from "node:crypto";

const b64url = (b: Buffer): string => b.toString("base64url");

export interface Pkce {
  /** The secret held by the CLI, sent only in the final token exchange. */
  verifier: string;
  /** SHA-256(verifier), sent in the authorize request. */
  challenge: string;
  /** CSRF guard — echoed back on the redirect and checked byte-for-byte. */
  state: string;
}

/** Generate a fresh PKCE verifier/challenge pair + an unguessable state. */
export function createPkce(): Pkce {
  const verifier = b64url(randomBytes(32)); // 43-char high-entropy secret
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24));
  return { verifier, challenge, state };
}
