import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTown } from "@mossbrook/map-sdk";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = (script, args) => spawnSync(process.execPath, [resolve(root, "scripts", script), ...args], { cwd: root, encoding: "utf8" });
async function temporary(task) {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(resolve(parent, "rpg-cli-test-"));
  const child = relative(parent, await realpath(directory));
  assert(!isAbsolute(child) && !child.startsWith("..") && basename(directory).startsWith("rpg-cli-test-"));
  try { await task(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("CLI exports independently usable map and art JSON", async () => temporary(async (directory) => {
  const mapPath = resolve(directory, "city.json"); const artPath = resolve(directory, "art.json");
  const result = run("generate-map.js", ["--layout", "symmetric", "--width", "49", "--height", "49", "--walls", "--out", mapPath, "--art-out", artPath]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).passed, true);
  assert.equal(JSON.parse(await readFile(mapPath, "utf8")).exits.length, 4);
  assert.equal(JSON.parse(await readFile(artPath, "utf8")).statistics.collisionChanges, 0);
  assert.equal(run("validate-map.mjs", ["--input", mapPath]).status, 0);
}));

test("CLI errors are nonzero and invalid presets do not create misleading files", async () => temporary(async (directory) => {
  const path = resolve(directory, "map.json");
  for (const args of [["--kind", "unknown"], ["--layout", "symmetric", "--width", "50"], ["--unexpected"]])
    assert.equal(run("generate-map.js", args).status, 1);
  const result = run("generate-map.js", ["--out", path, "--art-out", resolve(directory, "art.json"), "--preset", "unknown"]);
  assert.equal(result.status, 1);
  await assert.rejects(readFile(path));
}));

test("validator reports blocked or stale navigation instead of success", async () => temporary(async (directory) => {
  const map = generateTown({ layout: "grid" });
  map.tiles[map.spawn.y][map.spawn.x] = 4;
  const path = resolve(directory, "broken.json");
  await writeFile(path, JSON.stringify(map));
  const result = run("validate-map.mjs", ["--input", path, "--rebuild"]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).passed, false);
}));
