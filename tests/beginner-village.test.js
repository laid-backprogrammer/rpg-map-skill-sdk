import assert from "node:assert/strict";
import test from "node:test";
import { createArtPlan, findPath, generateTown, validateMap } from "@mossbrook/map-sdk";
import { artOptionsFor, spriteStacksFor, storyFor } from "../examples/beginner-village/village.js";

test("the beginner village stacks scenery onto the organic layout without changing routes", () => {
  const map = generateTown({ layout: "organic", seed: 1042 });
  const untouched = generateTown({ layout: "organic", seed: 1042 });
  const before = structuredClone(map);
  const routes = [
    ...map.exits.map((exit) => findPath(map, map.spawn, exit)),
    ...map.landmarks.map((landmark) => findPath(map, map.spawn, landmark)),
    ...map.buildings.flatMap((building) => (building.doors ?? [building.door]).map((door) => findPath(map, map.spawn, door))),
  ];
  const report = validateMap(map);
  const options = artOptionsFor(map);
  const plain = createArtPlan(map, { preset: "generic", seed: map.seed });
  const art = createArtPlan(map, options);
  const story = storyFor(map);

  assert.deepEqual(map, before);
  assert.deepEqual(map, untouched);
  assert.equal(art.statistics.collisionChanges, 0);
  assert.equal(art.statistics.spriteStackCount, spriteStacksFor(map).length);
  assert.equal(art.spriteStacks.length, 5);
  assert.deepEqual(
    routes,
    [
      ...map.exits.map((exit) => findPath(map, map.spawn, exit)),
      ...map.landmarks.map((landmark) => findPath(map, map.spawn, landmark)),
      ...map.buildings.flatMap((building) => (building.doors ?? [building.door]).map((door) => findPath(map, map.spawn, door))),
    ],
  );
  assert.deepEqual(validateMap(map), report);
  const { spriteStacks, statistics, ...artRest } = art;
  const { spriteStacks: plainStacks, statistics: plainStats, ...plainRest } = plain;
  assert.deepEqual(artRest, plainRest);
  assert.deepEqual(plainStacks, []);
  assert.deepEqual({ ...plainStats, spriteStackCount: spriteStacks.length }, statistics);

  const trees = spriteStacks.filter((stack) => stack.sprite === "tree");
  const well = spriteStacks.find((stack) => stack.footprintId === "village-well");
  const inn = spriteStacks.find((stack) => stack.footprintId === "guest-lodge");
  assert.equal(trees.length, 3);
  assert.ok(trees.every((stack) => stack.spacingMode === "uniform" && stack.height === 2.16 && stack.collision === "footprint-only"));
  assert.equal(well.spacingMode, "per-slice");
  assert.equal(well.height, 1.35);
  assert.deepEqual(well.slices.map((slice) => slice.sprite), ["well_base", "well_course", "well_course", "well_lip", "well_cap"]);
  assert.equal(inn.spacingMode, "uniform");
  assert.deepEqual(inn.slices.map((slice) => slice.sprite), ["lodge_foundation", "lodge_wall", "lodge_eaves", "lodge_roof"]);
  for (const stack of spriteStacks) {
    const entity = map.entities.find((item) => item.id === stack.footprintId);
    assert.deepEqual(stack.footprint, { x: entity.x, y: entity.y, width: entity.width, height: entity.height });
    assert.equal(stack.sortDepth, stack.foot.y);
    assert.equal(stack.sortMode, "world-foot-y");
    assert.equal(entity.height, stack.footprint.height);
    assert.notEqual(stack.height, 0);
    assert.equal(entity.solid, true);
  }
  for (const id of ["noticeboard-30-25", "signpost-39-19", "village-elder"])
    assert.equal(spriteStacks.some((stack) => stack.footprintId === id), false);

  assert.equal(story.beats.length, 4);
  assert.deepEqual(story.beats.map((beat) => beat.id), ["arrival", "notice", "elder", "departure"]);
  assert.ok(story.beats.every((beat) => beat.reachable));
  assert.equal(story.beats[0].pathLength, 0);
  assert.ok(story.beats.slice(1).every((beat) => beat.pathLength > 0));
  assert.equal(story.beats[3].point.x, map.exits.find((exit) => exit.id === "north").x);
  assert.equal(story.beats[3].point.y, map.exits.find((exit) => exit.id === "north").y);
});
