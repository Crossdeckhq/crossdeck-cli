import { defineConfig } from "tsup";

// Two entry points:
//   - cli.ts → the bin executable (gets the #!/usr/bin/env node banner)
//   - index.ts → programmatic API (so dotfile loaders / Jenkins jobs
//                / Vite plugins can call our CLI helpers directly
//                without spawning a child process)
//
// Both ship CJS + ESM so consumers on either module system work
// without surprises. The bin is CJS so older Node-bin shims still
// resolve it correctly.

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["cjs", "esm"],
  outExtension({ format }) {
    if (format === "cjs") return { js: ".cjs" };
    if (format === "esm") return { js: ".mjs" };
    return { js: ".js" };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  // Tell tsup to prepend the shebang to the CLI bundle so npm-link'd
  // bin entries are directly executable on POSIX.
  banner: ({ format }) =>
    format === "cjs" ? { js: "#!/usr/bin/env node" } : {},
});
