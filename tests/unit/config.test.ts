/**
 * Config resolution: env var, flag, default — and the secret-key
 * shape gate that prevents customers from accidentally pasting a
 * publishable key into a CI variable.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CliError, resolveConfig } from "../../src/config.js";

const ENV_KEYS = [
  "CROSSDECK_AUTH_TOKEN",
  "CROSSDECK_PROJECT_ID",
  "CROSSDECK_BASE_URL",
];

describe("resolveConfig", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("reads authToken from --auth-token flag", () => {
    const cfg = resolveConfig({ authToken: "cd_sk_live_abc123" });
    expect(cfg.authToken).toBe("cd_sk_live_abc123");
    expect(cfg.baseUrl).toBe("https://api.cross-deck.com");
    expect(cfg.projectId).toBeUndefined();
  });

  it("reads authToken from CROSSDECK_AUTH_TOKEN env var when no flag", () => {
    process.env.CROSSDECK_AUTH_TOKEN = "cd_sk_test_xyz789";
    const cfg = resolveConfig({});
    expect(cfg.authToken).toBe("cd_sk_test_xyz789");
  });

  it("flag overrides env var", () => {
    process.env.CROSSDECK_AUTH_TOKEN = "cd_sk_live_env";
    const cfg = resolveConfig({ authToken: "cd_sk_live_flag" });
    expect(cfg.authToken).toBe("cd_sk_live_flag");
  });

  it("throws CliError with helpful copy when no token is found", () => {
    expect(() => resolveConfig({})).toThrow(CliError);
    try {
      resolveConfig({});
    } catch (err) {
      expect((err as Error).message).toMatch(/CROSSDECK_AUTH_TOKEN/);
      expect((err as Error).message).toMatch(/api-keys/);
    }
  });

  it("rejects publishable keys (cd_pub_*) with a clear message", () => {
    expect(() => resolveConfig({ authToken: "cd_pub_live_abc" })).toThrow(
      /publishable keys/i,
    );
  });

  it("rejects random strings that don't look like cd_sk_*", () => {
    expect(() => resolveConfig({ authToken: "not-a-key" })).toThrow(
      /cd_sk_test_/,
    );
  });

  it("reads projectId from flag + env", () => {
    process.env.CROSSDECK_PROJECT_ID = "proj_from_env";
    const fromEnv = resolveConfig({ authToken: "cd_sk_live_x" });
    expect(fromEnv.projectId).toBe("proj_from_env");

    const fromFlag = resolveConfig({
      authToken: "cd_sk_live_x",
      project: "proj_from_flag",
    });
    expect(fromFlag.projectId).toBe("proj_from_flag");
  });

  it("strips trailing slashes from baseUrl", () => {
    const cfg = resolveConfig({
      authToken: "cd_sk_live_x",
      baseUrl: "https://staging.example.com/v1/",
    });
    expect(cfg.baseUrl).toBe("https://staging.example.com/v1");
  });

  it("reads baseUrl from env when no flag", () => {
    process.env.CROSSDECK_BASE_URL = "https://staging.example.com/";
    const cfg = resolveConfig({ authToken: "cd_sk_live_x" });
    expect(cfg.baseUrl).toBe("https://staging.example.com");
  });

  it("falls back to default production base URL", () => {
    const cfg = resolveConfig({ authToken: "cd_sk_live_x" });
    expect(cfg.baseUrl).toBe("https://api.cross-deck.com");
  });
});
