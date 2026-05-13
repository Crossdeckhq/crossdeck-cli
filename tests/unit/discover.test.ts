/**
 * Discovery: walk a temp dist tree, verify .js + .map pairing works
 * for the common cases — and the documented edge cases.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverSourcemaps, normaliseUrlPrefix } from "../../src/discover.js";

describe("normaliseUrlPrefix", () => {
  it("preserves app:/// sentinel exactly", () => {
    expect(normaliseUrlPrefix("app:///")).toBe("app:///");
  });
  it("preserves app:/// with a nested path", () => {
    expect(normaliseUrlPrefix("app:///nested/")).toBe("app:///nested/");
  });
  it("collapses extra trailing slashes on the path part", () => {
    expect(normaliseUrlPrefix("app:///nested/////")).toBe("app:///nested/");
  });
  it("preserves webpack:// sentinel", () => {
    expect(normaliseUrlPrefix("webpack:///")).toBe("webpack:///");
  });
  it("preserves capacitor://localhost", () => {
    expect(normaliseUrlPrefix("capacitor://localhost/")).toBe("capacitor://localhost/");
  });
  it("adds trailing slash when missing", () => {
    expect(normaliseUrlPrefix("https://example.com")).toBe("https://example.com/");
  });
  it("collapses double trailing slashes on browser URL path", () => {
    expect(normaliseUrlPrefix("https://example.com/static//")).toBe("https://example.com/static/");
  });
  it("preserves single trailing slash on browser URL", () => {
    expect(normaliseUrlPrefix("https://example.com/static/")).toBe("https://example.com/static/");
  });
});

function makeDist(): string {
  return mkdtempSync(join(tmpdir(), "crossdeck-cli-test-"));
}

function writeBundle(
  dir: string,
  relPath: string,
  jsContent: string,
  mapContent: string | null,
): void {
  const jsPath = join(dir, relPath);
  mkdirSync(jsPath.substring(0, jsPath.lastIndexOf("/")), { recursive: true });
  writeFileSync(jsPath, jsContent, "utf8");
  if (mapContent !== null) {
    writeFileSync(`${jsPath}.map`, mapContent, "utf8");
  }
}

const VALID_MAP = JSON.stringify({
  version: 3,
  sources: ["src/foo.ts"],
  sourcesContent: ["export const x = 1;\n"],
  mappings: "AAAA",
  names: [],
});

describe("discoverSourcemaps", () => {
  let dist: string;

  beforeEach(() => {
    dist = makeDist();
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("finds .js + adjacent .map pairs", () => {
    writeBundle(
      dist,
      "main.a1b2c3.js",
      "console.log(1);\n//# sourceMappingURL=main.a1b2c3.js.map\n",
      VALID_MAP,
    );

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/static/",
    });

    expect(result.files.length).toBe(1);
    expect(result.files[0]!.relativePath).toBe("main.a1b2c3.js");
    expect(result.files[0]!.fileUrl).toBe(
      "https://example.com/static/main.a1b2c3.js",
    );
  });

  it("recurses into nested directories but skips node_modules", () => {
    writeBundle(
      dist,
      "assets/js/app.js",
      "x;\n//# sourceMappingURL=app.js.map\n",
      VALID_MAP,
    );
    writeBundle(
      dist,
      "node_modules/lib/lib.js",
      "x;\n//# sourceMappingURL=lib.js.map\n",
      VALID_MAP,
    );

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    expect(result.files.length).toBe(1);
    expect(result.files[0]!.relativePath).toBe("assets/js/app.js");
  });

  it("normalises trailing slash on url prefix", () => {
    writeBundle(
      dist,
      "a.js",
      "x;\n//# sourceMappingURL=a.js.map\n",
      VALID_MAP,
    );

    const withSlash = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/static/",
    });
    const withoutSlash = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/static",
    });

    expect(withSlash.files[0]!.fileUrl).toBe("https://example.com/static/a.js");
    expect(withoutSlash.files[0]!.fileUrl).toBe(
      "https://example.com/static/a.js",
    );
  });

  it("skips .js files without a sourceMappingURL comment", () => {
    writeBundle(dist, "vendor.js", "console.log(1);\n", null);

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    expect(result.files.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0]!.reason).toMatch(/No `\/\/# sourceMappingURL=/);
  });

  it("skips inline data-URI source maps", () => {
    writeBundle(
      dist,
      "inline.js",
      "x;\n//# sourceMappingURL=data:application/json;base64,abc123\n",
      null,
    );

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    expect(result.files.length).toBe(0);
    expect(result.skipped[0]!.reason).toMatch(/Map is inline/);
  });

  it("skips when the referenced .map file is missing", () => {
    writeBundle(
      dist,
      "broken.js",
      "x;\n//# sourceMappingURL=broken.js.map\n",
      null,
    );

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    expect(result.files.length).toBe(0);
    expect(result.skipped[0]!.reason).toMatch(/doesn't exist/);
  });

  it("honours an absolute / relative map basename in the comment", () => {
    // Bundler emits foo.js with `//# sourceMappingURL=maps/foo.js.map`
    writeBundle(
      dist,
      "foo.js",
      "x;\n//# sourceMappingURL=maps/foo.js.map\n",
      null,
    );
    // Map at the referenced path.
    writeBundle(dist, "maps/foo.js.map", "x", VALID_MAP);

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    // The js file itself was discovered + paired with the map at the
    // sibling-of-comment path.
    const fooEntry = result.files.find((f) => f.relativePath === "foo.js");
    expect(fooEntry).toBeDefined();
    expect(fooEntry!.mapPath.endsWith("maps/foo.js.map")).toBe(true);
  });

  it("handles `?v=…` query suffix on the sourceMappingURL comment", () => {
    writeBundle(
      dist,
      "ver.js",
      "x;\n//# sourceMappingURL=ver.js.map?v=123\n",
      VALID_MAP,
    );

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    expect(result.files.length).toBe(1);
  });

  it("recognises .mjs and .cjs extensions", () => {
    writeBundle(
      dist,
      "esm.mjs",
      "x;\n//# sourceMappingURL=esm.mjs.map\n",
      VALID_MAP,
    );
    writeBundle(
      dist,
      "cjs.cjs",
      "x;\n//# sourceMappingURL=cjs.cjs.map\n",
      VALID_MAP,
    );

    const result = discoverSourcemaps({
      distDir: dist,
      urlPrefix: "https://example.com/",
    });

    expect(result.files.length).toBe(2);
    const exts = result.files.map((f) => f.relativePath).sort();
    expect(exts).toEqual(["cjs.cjs", "esm.mjs"]);
  });
});
