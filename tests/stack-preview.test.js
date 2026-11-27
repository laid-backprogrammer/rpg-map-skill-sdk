import assert from "node:assert/strict";
import test from "node:test";
import { createArtPlan, findPath, generateTown, validateMap } from "@mossbrook/map-sdk";
import { artOptionsFor } from "../examples/beginner-village/village.js";
import { previewSlices, project, sliceOutline, stacksInDrawOrder } from "../examples/demo/stacks.js";

function span(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    midY: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

test("the stack preview reads art-plan height and does not change routes", () => {
  const map = generateTown({ layout: "organic", seed: 1042 });
  const before = structuredClone(map);
  const routes = map.exits.map((exit) => findPath(map, map.spawn, exit));
  const report = validateMap(map);
  const art = createArtPlan(map, artOptionsFor(map));
  const snapshot = structuredClone(art.spriteStacks);
  const tree = art.spriteStacks.find((stack) => stack.sprite === "tree");
  const well = art.spriteStacks.find((stack) => stack.footprintId === "village-well");
  const lodge = art.spriteStacks.find((stack) => stack.footprintId === "guest-lodge");

  assert.deepEqual(project(3, 4, 0, 1.4), { x: 3, y: 4 });
  assert.ok(project(3, 4, 2, 1).y < 4);

  const treeGround = span(sliceOutline(tree, tree.slices[0], 1));
  const treeTop = span(sliceOutline(tree, tree.slices.at(-1), 1));
  assert.ok(Math.abs(treeGround.width - tree.footprint.width) < 1e-9);
  assert.ok(treeTop.width > treeGround.width);
  assert.ok(treeGround.midY - treeTop.midY > tree.height * 0.9);

  const lip = span(sliceOutline(well, well.slices.find((slice) => slice.sprite === "well_lip"), 0.8));
  const cap = span(sliceOutline(well, well.slices.find((slice) => slice.sprite === "well_cap"), 0.8));
  assert.ok(lip.width > cap.width);
  assert.ok(span(sliceOutline(well, well.slices.at(-1), 1)).midY < span(sliceOutline(well, well.slices[0], 1)).midY);

  const foundation = lodge.slices[0];
  const corners = sliceOutline(lodge, foundation, 1.2);
  const footprint = lodge.footprint;
  for (const [x, y] of [
    [footprint.x, footprint.y],
    [footprint.x + footprint.width, footprint.y],
    [footprint.x + footprint.width, footprint.y + footprint.height],
    [footprint.x, footprint.y + footprint.height],
  ]) assert.ok(corners.some((point) => Math.abs(point.x - x) < 1e-9 && Math.abs(point.y - y) < 1e-9));
  assert.equal(previewSlices(lodge, 1)[0].kind, "slab");
  assert.equal(previewSlices(tree, 1)[0].kind, "disc");

  const ordered = stacksInDrawOrder(art.spriteStacks);
  assert.deepEqual(art.spriteStacks, snapshot);
  assert.ok(ordered.every((stack, index) => index === 0 || ordered[index - 1].sortDepth <= stack.sortDepth));
  assert.equal(art.spriteStacks.some((stack) => stack.footprintId === "noticeboard-30-25"), false);
  assert.equal(art.statistics.collisionChanges, 0);
  assert.deepEqual(map, before);
  assert.deepEqual(map.exits.map((exit) => findPath(map, map.spawn, exit)), routes);
  assert.deepEqual(validateMap(map), report);
});
