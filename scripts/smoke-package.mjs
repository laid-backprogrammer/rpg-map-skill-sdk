import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runNpm } from "./npm-process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "output/package-manifest.json"), "utf8"));
const tempRoot = await realpath(tmpdir());
const workspace = await mkdtemp(resolve(tempRoot, "rpg-sdk-smoke-"));
const safeRelative = relative(tempRoot, await realpath(workspace));
if (isAbsolute(safeRelative) || safeRelative.startsWith("..") || !basename(workspace).startsWith("rpg-sdk-smoke-"))
  throw new Error("Unexpected temporary workspace; refusing installation and cleanup.");
try {
  await writeFile(resolve(workspace, "package.json"), JSON.stringify({ private: true, type: "module" }));
  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", resolve(root, "output", manifest.filename)], workspace);
  const consumer = `
    import assert from 'node:assert/strict';
    import { SDK_VERSION, createMapSDK, createArtPlan, findPath, generateBuildingInterior, assertValidMap } from '@mossbrook/map-sdk';
    assert.equal(SDK_VERSION, '${manifest.version}');
    const sdk = createMapSDK({seed:'tarball-consumer'});
    for (const layout of ['organic','symmetric','grid']) {
      const map = sdk.generateTown({layout});
      assert.equal(assertValidMap(map).report.passed, true);
      assert.equal(map.exits.length, 4);
      assert(findPath(map, map.exits[0], map.exits[2]).length);
      assert.equal(createArtPlan(map, {preset:'generic'}).statistics.collisionChanges, 0);
      assert.equal(generateBuildingInterior(map, map.buildings[0].id).report.passed, true);
    }
    for (const template of ['cottage','inn','workshop'])
      assert.equal(sdk.generateInterior({template,symmetry:'quadrilateral'}).report.passed,true);
    console.log('Packed SDK installs independently: six presets, linked interiors, routes and art plan passed.');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", consumer], { cwd: workspace, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  console.log(result.stdout.trim());
} finally {
  await rm(workspace, { recursive: true, force: true });
}
