import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runNpm } from "./npm-process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const preflight = spawnSync(process.execPath, [resolve(root, "scripts/check-release.mjs")], { cwd: root, encoding: "utf8" });
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) throw new Error(preflight.stderr || "Release content check failed.");
await mkdir(resolve(root, "output"), { recursive: true });
const [packed] = JSON.parse(runNpm([
  "pack", "--workspace", "@mossbrook/map-sdk", "--pack-destination", "output", "--json",
], root));
const manifest = JSON.parse(await readFile(resolve(root, "packages/map-sdk/package.json"), "utf8"));
const paths = packed.files.map((entry) => entry.path);
const allowedFiles = new Set([
  "src/index.js", "src/core.js", "src/village.js", "src/town.js", "src/interior.js", "src/art.js",
  "package.json", "index.d.ts", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md",
]);
if (packed.version !== manifest.version || !paths.includes("LICENSE") || !paths.includes("index.d.ts") ||
    !paths.every((path) => allowedFiles.has(path)))
  throw new Error("Unexpected SDK package contents; do not publish this archive.");
await writeFile(resolve(root, "output/package-manifest.json"), `${JSON.stringify(packed, null, 2)}\n`);
console.log(JSON.stringify({ archive: `output/${packed.filename}`, files: paths, bytes: packed.size, integrity: packed.integrity }, null, 2));
