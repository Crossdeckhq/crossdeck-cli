/**
 * api-client: batching + auth header + error mapping.
 *
 * We mock `globalThis.fetch` so the tests don't touch the network.
 * The CLI exports `uploadSourcemaps` directly so tests can drive the
 * batch flow with a synthetic DiscoveredFile list.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApiError, uploadSourcemaps } from "../../src/api-client.js";
import type { DiscoveredFile, UploadResponse } from "../../src/types.js";

const ORIGINAL_FETCH = globalThis.fetch;

function makeFile(): { tmpDir: string; file: DiscoveredFile } {
  const tmpDir = mkdtempSync(join(tmpdir(), "crossdeck-api-test-"));
  const mapPath = join(tmpDir, "main.js.map");
  writeFileSync(mapPath, JSON.stringify({ version: 3 }), "utf8");
  return {
    tmpDir,
    file: {
      mapPath,
      jsPath: join(tmpDir, "main.js"),
      relativePath: "main.js",
      fileUrl: "https://example.com/main.js",
    },
  };
}

function makeFiles(n: number): { tmpDir: string; files: DiscoveredFile[] } {
  const tmpDir = mkdtempSync(join(tmpdir(), "crossdeck-api-test-batch-"));
  const files: DiscoveredFile[] = [];
  for (let i = 0; i < n; i++) {
    const mapPath = join(tmpDir, `bundle-${i}.js.map`);
    writeFileSync(mapPath, JSON.stringify({ version: 3, idx: i }), "utf8");
    files.push({
      mapPath,
      jsPath: join(tmpDir, `bundle-${i}.js`),
      relativePath: `bundle-${i}.js`,
      fileUrl: `https://example.com/bundle-${i}.js`,
    });
  }
  return { tmpDir, files };
}

function okResponse(uploaded: number): UploadResponse {
  const results = Array.from({ length: uploaded }).map((_, i) => ({
    fileUrl: `url-${i}`,
    status: "uploaded" as const,
  }));
  return {
    object: "sourcemap_batch",
    release: "v1",
    environment: "production",
    uploaded,
    skipped: 0,
    errors: [],
    results,
  };
}

describe("uploadSourcemaps", () => {
  const config = {
    authToken: "cd_sk_live_test",
    projectId: undefined,
    baseUrl: "https://api.example.com",
  };
  let cleanupDirs: string[] = [];

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
    cleanupDirs = [];
  });

  it("posts one batch when files ≤ 100", async () => {
    const { tmpDir, file } = makeFile();
    cleanupDirs.push(tmpDir);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(okResponse(1)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await uploadSourcemaps({
      config,
      release: "v1.2.3",
      environment: "production",
      files: [file],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(summary.uploaded).toBe(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/releases/sourcemaps");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer cd_sk_live_test");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.release).toBe("v1.2.3");
    expect(body.environment).toBe("production");
    expect(body.files).toHaveLength(1);
    expect(body.files[0].fileUrl).toBe("https://example.com/main.js");
    expect(typeof body.files[0].sourceMap).toBe("string");
  });

  it("chunks files into batches of 100", async () => {
    const { tmpDir, files } = makeFiles(243);
    cleanupDirs.push(tmpDir);

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(okResponse(0)), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await uploadSourcemaps({
      config,
      release: "v1",
      environment: "production",
      files,
    });

    // 243 / 100 = 3 batches (100, 100, 43)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string),
    );
    expect(bodies[0].files).toHaveLength(100);
    expect(bodies[1].files).toHaveLength(100);
    expect(bodies[2].files).toHaveLength(43);
  });

  it("aggregates uploaded + errors across batches", async () => {
    const { tmpDir, files } = makeFiles(150);
    cleanupDirs.push(tmpDir);

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      const body: UploadResponse = {
        object: "sourcemap_batch",
        release: "v1",
        environment: "production",
        uploaded: call === 1 ? 100 : 49,
        skipped: 0,
        errors:
          call === 2
            ? [
                {
                  fileUrl: "https://example.com/oops.js",
                  status: "error",
                  error: { code: "invalid_sourcemap", message: "Not v3" },
                },
              ]
            : [],
        results: [],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const summary = await uploadSourcemaps({
      config,
      release: "v1",
      environment: "production",
      files,
    });

    expect(summary.uploaded).toBe(149);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]!.error?.code).toBe("invalid_sourcemap");
  });

  it("maps non-2xx responses to ApiError with code + request_id", async () => {
    const { tmpDir, file } = makeFile();
    cleanupDirs.push(tmpDir);
    const errorBody = {
      error: {
        type: "authentication_error",
        code: "invalid_api_key",
        message: "Unknown secret key.",
        request_id: "req_test_42",
      },
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(errorBody), {
        status: 401,
        headers: { "x-request-id": "req_test_42" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      uploadSourcemaps({
        config,
        release: "v1",
        environment: "production",
        files: [file],
      }),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_api_key",
      requestId: "req_test_42",
    });

    // And it's the right subclass
    await expect(
      uploadSourcemaps({
        config,
        release: "v1",
        environment: "production",
        files: [file],
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("invokes onBatchComplete with per-batch progress", async () => {
    const { tmpDir, files } = makeFiles(120);
    cleanupDirs.push(tmpDir);
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(okResponse(50)), { status: 200 }),
    ) as unknown as typeof fetch;

    const progress: number[] = [];
    await uploadSourcemaps({
      config,
      release: "v1",
      environment: "production",
      files,
      onBatchComplete: ({ batchIndex, batchCount }) => {
        progress.push(batchIndex);
        expect(batchCount).toBe(2);
      },
    });

    expect(progress).toEqual([0, 1]);
  });
});
