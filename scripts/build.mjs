import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

mkdirSync(dist, { recursive: true });

function copyStatic() {
  copyFileSync(join(root, "manifest.json"), join(dist, "manifest.json"));
  copyFileSync(join(root, "src/styles/overlay.css"), join(dist, "overlay.css"));
}

const shared = {
  bundle: true,
  format: "esm",
  target: "chrome110",
  sourcemap: true,
  logLevel: "info",
};

const contexts = await Promise.all([
  esbuild.context({
    ...shared,
    entryPoints: [join(root, "src/background/service-worker.ts")],
    outfile: join(dist, "background.js"),
  }),
  // IIFE so chrome.scripting.executeScript can inject without module support
  esbuild.context({
    ...shared,
    format: "iife",
    entryPoints: [join(root, "src/content/index.ts")],
    outfile: join(dist, "content.js"),
  }),
]);
copyStatic();

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes…");
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  console.log("Build complete → dist/");
}
