/**
 * Credential custody for the `crossdeck login` (OAuth) flow.
 *
 * Bank-grade rule (CROSSDECK_CLI_LOGIN_OAUTH_SPEC §4): the long-lived refresh
 * token is the crown jewel. This v1 backend is the spec's sanctioned fallback:
 * a `chmod 600` JSON file at `~/.crossdeck/credentials.json`. It is deliberately
 * behind the `CredentialStore` interface so an OS-keychain backend (macOS
 * Keychain / libsecret / DPAPI) drops in next with zero change to the flow.
 *
 * Hard rules enforced here:
 *   - The file is created 0600 and its perms are VERIFIED on every read; if the
 *     world/group can read it, the CLI refuses to use it and prints the fix.
 *   - Only the refresh token + non-secret metadata are persisted. The 1h access
 *     token is NEVER written to disk — it lives in memory for the process only.
 *   - Nothing here is ever printed, logged, or passed via argv.
 */

import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

/** Persisted custody record. The access token is intentionally absent. */
export interface StoredCredentials {
  /** Long-lived, rotates on every use (30d TTL server-side). The crown jewel. */
  refreshToken: string;
  /** The OAuth client_id this refresh token is bound to (DCR-registered). */
  clientId: string;
  /** The granted scope string, for `whoami` to show without a network call. */
  scope: string;
  /** The API base the token authenticates against (so a re-login isn't needed). */
  baseUrl: string;
  /** ISO timestamp of login, for `whoami`. Non-secret. */
  loggedInAt: string;
  /** Account email, cached at login so the launcher greets by identity offline. Non-secret. */
  email?: string;
}

export interface CredentialStore {
  load(): StoredCredentials | null;
  save(creds: StoredCredentials): void;
  clear(): void;
  location(): string;
}

function credsPath(): string {
  const dir = process.env.CROSSDECK_CONFIG_DIR?.trim() || join(homedir(), ".crossdeck");
  return join(dir, "credentials.json");
}

/** True on POSIX where file-mode bits are meaningful. Windows ACLs differ. */
const POSIX = platform() !== "win32";

class FileCredentialStore implements CredentialStore {
  private readonly path = credsPath();

  location(): string {
    return this.path;
  }

  load(): StoredCredentials | null {
    if (!existsSync(this.path)) return null;
    if (POSIX) {
      const mode = statSync(this.path).mode & 0o777;
      // Refuse to touch a refresh token the group or world can read. Loud, with the fix.
      if (mode & 0o077) {
        throw new Error(
          `Refusing to read credentials at ${this.path}: file mode ${mode.toString(8)} is too permissive.\n` +
            `The refresh token must be owner-only. Fix it with:\n  chmod 600 ${this.path}`,
        );
      }
    }
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredCredentials>;
      if (!parsed.refreshToken || !parsed.clientId || !parsed.baseUrl) return null;
      return {
        refreshToken: parsed.refreshToken,
        clientId: parsed.clientId,
        scope: parsed.scope ?? "",
        baseUrl: parsed.baseUrl,
        loggedInAt: parsed.loggedInAt ?? "",
      };
    } catch {
      return null; // A corrupt file is treated as "not logged in", never a crash.
    }
  }

  save(creds: StoredCredentials): void {
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Write, THEN tighten — write the file 0600 from the start so the token is
    // never briefly world-readable between create and chmod.
    writeFileSync(this.path, JSON.stringify(creds, null, 2), { mode: 0o600 });
    if (POSIX) chmodSync(this.path, 0o600);
  }

  clear(): void {
    try {
      rmSync(this.path, { force: true });
    } catch {
      /* already gone — logout is idempotent */
    }
  }
}

/** The active credential store. Swap the constructor for a keychain backend later. */
export function credentialStore(): CredentialStore {
  return new FileCredentialStore();
}
