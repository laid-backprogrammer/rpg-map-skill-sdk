import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { findPath, generateTown } from "@mossbrook/map-sdk";
import { sceneProps } from "../examples/demo/scene-layout.js";

test("HD-2D placement uses painted stacks without moving the organic village", async () => {
  const manifest = JSON.parse(await readFile(new URL("../examples/beginner-village/assets/stacks.json", import.meta.url), "utf8"));
  const expected = { oak: [2.3, 2.5], well: [1.6, 1.85], lodge: [3.15, 3.45] };
  for (const kind of ["oak", "well", "lodge"]) {
    assert.ok(manifest[kind].files.length >= 32 && manifest[kind].files.length <= 48);
    assert.ok(manifest[kind].spacing >= 0.045 && manifest[kind].spacing <= 0.08);
    const height = 0.05 + (manifest[kind].files.length - 1) * manifest[kind].spacing;
    assert.ok(height >= expected[kind][0] && height <= expected[kind][1], `${kind} height ${height}`);
    for (const file of new Set(manifest[kind].files))
      await access(new URL(`../examples/beginner-village/assets/${file}`, import.meta.url));
  }
  const map = generateTown({ layout: "organic", seed: 1042 });
  const before = structuredClone(map);
  const routes = map.exits.map((exit) => findPath(map, map.spawn, exit));
  const props = sceneProps(map);
  assert.deepEqual(map, before);
  assert.deepEqual(map.exits.map((exit) => findPath(map, map.spawn, exit)), routes);
  assert.equal(props.filter((prop) => prop.kind === "well").length, 1);
  assert.equal(props.find((prop) => prop.id === "guest-lodge").kind, "lodge");
  assert.ok(props.filter((prop) => prop.kind === "oak").length >= 3);
  const well = props.find((prop) => prop.id === "village-well");
  const entity = map.entities.find((item) => item.id === "village-well");
  assert.equal(well.x, entity.x + entity.width / 2);
  assert.equal(well.z, entity.y + entity.height / 2);
  assert.ok(props.every((prop) => ["oak", "well", "lodge"].includes(prop.kind)));
});
