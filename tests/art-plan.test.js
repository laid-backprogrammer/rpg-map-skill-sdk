import assert from "node:assert/strict";
import test from "node:test";
import { createArtPlan, generateTown, generateInterior, rebuildNavigation, findPath, canOccupy, validateMap, TILE } from "@mossbrook/map-sdk";
import { makeGrid } from "../packages/map-sdk/src/core.js";

function courtyardFixture() {
  const width = 60; const height = 36;
  const map = {
    seed: "public-geometric-fixture", sceneId: "courtyard", width, height,
    tiles: makeGrid(width, height, TILE.WALL), roadMask: makeGrid(width, height, false),
    entities: [{ id: "sample-house", type: "cottage", solid: true, x: 18, y: 7, width: 10, height: 6 }],
    spawn: { x: 30, y: 29 }, landmarks: [{ id: "sample-door", x: 23, y: 14 }], exits: [],
    interactables: [{ id: "sample-door", kind: "door", x: 23, y: 14, approach: { x: 23, y: 14 } }],
  };
  for (let y = 5; y < 32; y += 1)
    for (let x = 8; x < 52; x += 1) map.tiles[y][x] = TILE.GRASS;
  for (let y = 6; y < 15; y += 1)
    for (let x = 42; x < 51; x += 1) map.tiles[y][x] = TILE.WATER;
  for (let y = 5; y < 32; y += 1)
    for (let x = 29; x <= 31; x += 1) { map.tiles[y][x] = TILE.PATH; map.roadMask[y][x] = true; }
  for (let y = 20; y <= 22; y += 1)
    for (let x = 8; x < 52; x += 1) { map.tiles[y][x] = TILE.PATH; map.roadMask[y][x] = true; }
  rebuildNavigation(map);
  return map;
}

test("art plans are reproducible, serializable and leave physics unchanged", () => {
  const map = courtyardFixture();
  const before = structuredClone(map);
  const plan = createArtPlan(map, { seed: "art" });
  assert.deepEqual(plan, createArtPlan(map, { seed: "art" }));
  assert.notDeepEqual(plan.decorations, createArtPlan(map, { seed: "variant" }).decorations);
  assert.deepEqual(map, before);
  assert.equal(plan.statistics.collisionChanges, 0);
  assert.notEqual(plan.materials, map.tiles);
  assert.notEqual(plan.materials[0], map.tiles[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});

test("specialized Poisson groups place complete render-only roots on existing blocked terrain", () => {
  const map = courtyardFixture();
  const plan = createArtPlan(map);
  assert(plan.decorations.length > 20 && plan.decorations.length <= 105);
  assert(plan.groups.some((group) => group.kind === "forest-cluster" && group.memberIds.length > 1));
  assert(plan.groups.some((group) => group.kind === "building-attachment"));
  assert(plan.decorations.some((item) => item.sprite === "lotus"));
  assert.equal(new Set(plan.decorations.map((item) => item.id)).size, plan.decorations.length);
  for (const item of plan.decorations) {
    assert.equal(item.solid, false);
    const expected = item.sprite === "lotus" ? TILE.WATER : TILE.WALL;
    for (const dy of [0, item.height - 1e-9])
      for (const dx of [0, item.width - 1e-9]) {
        const x = Math.floor(item.x + dx); const y = Math.floor(item.y + dy);
        assert.equal(map.tiles[y]?.[x], expected);
        assert.equal(plan.protected[y][x], false);
      }
    assert(Object.values(item.visual).every(Number.isFinite));
    assert(plan.groups.find((group) => group.id === item.groupId)?.memberIds.includes(item.id));
  }
});

test("interaction routes and approaches retain a three-cell art protection band", () => {
  const map = courtyardFixture();
  const plan = createArtPlan(map);
  const route = findPath(map, map.spawn, map.landmarks[0]);
  assert(route.length);
  for (const point of route)
    for (let y = point.y - 1; y <= point.y + 1; y += 1)
      for (let x = point.x - 1; x <= point.x + 1; x += 1)
        if (map.tiles[y]?.[x] !== undefined) assert.equal(plan.protected[y][x], true);
});

test("all six generic presets produce finite art fields without specialized decoration", () => {
  const maps = [
    ...["organic", "symmetric", "grid"].map((layout) => generateTown({ layout })),
    ...["cottage", "inn", "workshop"].map((template) => generateInterior({ template })),
  ];
  for (const map of maps) {
    for (const preset of ["generic", "plain", "fangcun"]) {
      const plan = createArtPlan(map, { preset });
      assert.equal(plan.decorations.length, 0);
      for (const grid of [plan.materials, plan.transitions, ...Object.values(plan.fields)]) {
        assert.equal(grid.length, map.height);
        assert(grid.every((row) => row.length === map.width && row.every(Number.isFinite)));
      }
      for (const name of ["shade", "traffic", "moisture"])
        assert(plan.fields[name].flat().every((value) => value >= 0 && value <= 1));
      for (const item of [...plan.groundDecals, ...plan.contactShadows]) {
        assert([item.x, item.y, item.width, item.height, item.alpha].every(Number.isFinite));
        assert(item.width > 0 && item.height > 0 && item.alpha >= 0 && item.alpha <= 1);
      }
    }
  }
});

test("Blob masks gate diagonals and missing distance sources remain finite", () => {
  const map = { width: 3, height: 3, tiles: makeGrid(3, 3, TILE.GRASS), entities: [] };
  const full = createArtPlan(map, { preset: "generic" });
  assert.equal(full.transitions[1][1], 255);
  assert(full.fields.waterDistance.flat().every((value) => value === 6));
  map.tiles[0][1] = TILE.WATER;
  const partial = createArtPlan(map);
  assert.equal(partial.transitions[1][1] & (1 | 2 | 128), 0);
  assert.equal(partial.transitions[1][1] & 8, 8);
});

test("malformed art options and geometry fail explicitly", () => {
  const map = { width: 3, height: 3, tiles: makeGrid(3, 3, TILE.GRASS), entities: [] };
  for (const seed of [NaN, Infinity, {}, true]) assert.throws(() => createArtPlan(map, { seed }), /seed/);
  for (const tileSize of [0, -1, NaN, Infinity]) assert.throws(() => createArtPlan(map, { tileSize }), /tileSize/);
  assert.throws(() => createArtPlan(map, { preset: "unknown" }), /preset/);
  assert.throws(() => createArtPlan(map, null), /object/);
  assert.throws(() => createArtPlan({ ...map, width: 4 }), /rectangular/);
  assert.throws(() => createArtPlan({ ...map, tiles: Array(3) }), /rectangular/);
  assert.throws(() => createArtPlan({ ...map, walkable: makeGrid(2, 3, true) }), /walkable/);
  assert.throws(() => createArtPlan({ ...map, entities: [{ x: -1, y: 0, width: 1, height: 1 }] }), /footprints/);
});

test("sprite stacks are opt-in render data and leave collision alone", () => {
  const map = {
    width: 5, height: 5, tiles: makeGrid(5, 5, TILE.GRASS),
    spawn: { x: 0, y: 2 },
    entities: [
      { id: "pine", type: "tree", sprite: "tree", solid: true, x: 2.1, y: 2.2, width: 0.68, height: 0.65,
        anchor: { x: 0.5, y: 1 }, visual: { offsetX: -1.16, offsetY: -3.2, width: 3, height: 4 } },
      { id: "crate", type: "crate", sprite: "crate", solid: true, x: 4, y: 4, width: 0.7, height: 0.7 },
    ],
  };
  rebuildNavigation(map);
  const before = structuredClone(map);
  const routeBefore = findPath(map, map.spawn, { x: 4, y: 2 });
  const reportBefore = validateMap(map);
  const plain = createArtPlan(map, { preset: "plain", seed: "stack" });
  const stacked = createArtPlan(map, {
    preset: "plain", seed: "stack",
    spriteStacks: [{
      footprintId: "pine", sliceCount: 4, spacing: 0.5, height: 1.5, pivot: { x: 0.5, y: 1 },
      slices: [
        { sprite: "pine_trunk", visual: { offsetX: -0.2, offsetY: -0.4, width: 0.5, height: 0.4 } },
        { spacing: 0.5, sprite: "pine_canopy", visual: { offsetX: -1, offsetY: -0.3, width: 2.2, height: 0.4 } },
        { spacing: 0.5 },
        { spacing: 0.5 },
      ],
    }],
  });
  assert.equal(plain.spriteStacks.length, 0);
  assert.equal(plain.statistics.spriteStackCount, 0);
  assert.equal(stacked.statistics.spriteStackCount, 1);
  assert.equal(stacked.statistics.collisionChanges, 0);
  const { spriteStacks: stackedRows, statistics: stackedStats, ...stackedRest } = stacked;
  const { spriteStacks: plainRows, statistics: plainStats, ...plainRest } = plain;
  assert.deepEqual(stackedRest, plainRest);
  assert.deepEqual({ ...plainStats, spriteStackCount: 1 }, stackedStats);
  assert.deepEqual(plainRows, []);
  const stack = stackedRows[0];
  assert.equal(stack.collision, "footprint-only");
  assert.equal(stack.sortMode, "world-foot-y");
  assert.equal(stack.spacingMode, "uniform");
  assert.equal(stack.spacing, 0.5);
  assert.equal(stack.height, 1.5);
  assert.equal(stack.sortDepth, stack.foot.y);
  assert.deepEqual(stack.foot, { x: 2.1 + 0.68 * 0.5, y: 2.2 + 0.65 });
  assert.deepEqual(stack.footprint, { x: 2.1, y: 2.2, width: 0.68, height: 0.65 });
  assert.deepEqual(stack.slices.map((slice) => slice.elevation), [0, 0.5, 1, 1.5]);
  assert.equal(stack.slices[1].sprite, "pine_canopy");
  assert.equal(stack.slices[1].visual.width, 2.2);
  assert.equal(stack.slices[3].sprite, "tree");
  assert.deepEqual(map, before);
  assert.equal(map.entities[0].height, 0.65);
  assert.equal(map.entities[0].solid, true);
  assert.deepEqual(findPath(map, map.spawn, { x: 4, y: 2 }), routeBefore);
  assert.deepEqual(validateMap(map), reportBefore);
  const besideCanopy = { x: map.entities[0].x - 0.3, y: map.entities[0].y + 0.3 };
  assert.equal(canOccupy(map, besideCanopy.x, besideCanopy.y), true);
  assert.equal(stacked.spriteStacks.some((item) => item.footprintId === "crate"), false);
});

test("entity sprite stacks and uneven slices normalize without editing the entity", () => {
  const map = {
    width: 3, height: 3, tiles: makeGrid(3, 3, TILE.GRASS), entities: [
      { id: "monument", type: "well", solid: true, x: 1, y: 1, width: 1, height: 1,
        spriteStack: { sliceCount: 3, height: 1, slices: [{}, { spacing: 0.25 }, { spacing: 0.75 }] } },
    ],
  };
  const before = structuredClone(map);
  const plan = createArtPlan(map, { preset: "generic" });
  assert.equal(plan.spriteStacks[0].spacingMode, "per-slice");
  assert.equal(plan.spriteStacks[0].spacing, undefined);
  assert.equal(plan.spriteStacks[0].height, 1);
  assert.deepEqual(plan.spriteStacks[0].slices.map((slice) => slice.elevation), [0, 0.25, 1]);
  assert.equal(plan.spriteStacks[0].pivot.y, 1);
  assert.equal(plan.spriteStacks[0].collision, "footprint-only");
  assert.deepEqual(map, before);
  const open = structuredClone(map);
  delete open.entities[0].spriteStack;
  const derived = createArtPlan(open, { preset: "generic", spriteStacks: [{ footprintId: "monument", sliceCount: 3, height: 1.5 }] });
  assert.equal(derived.spriteStacks[0].spacingMode, "uniform");
  assert.equal(derived.spriteStacks[0].spacing, 0.75);
  assert.equal(derived.spriteStacks[0].height, 1.5);
  assert.deepEqual(open.entities[0].width, 1);
});

test("malformed sprite stacks fail before they can describe a collider", () => {
  const map = {
    width: 3, height: 3, tiles: makeGrid(3, 3, TILE.GRASS),
    entities: [{ id: "pine", type: "tree", solid: true, x: 1, y: 1, width: 0.6, height: 0.6 }],
  };
  const hinted = structuredClone(map);
  hinted.entities[0].spriteStack = { sliceCount: 3, spacing: 0.2 };
  const before = structuredClone(map);
  for (const [spriteStacks, pattern] of [
    [[{ footprintId: "missing", sliceCount: 2, spacing: 0.2 }], /footprint not found/],
    [[{ footprintId: "pine", sliceCount: 1, spacing: 0.2 }], /sliceCount/],
    [[{ footprintId: "pine", sliceCount: 2, spacing: 0.2 }, { footprintId: "pine", sliceCount: 3, height: 1 }], /Duplicate sprite stack/],
    [[{ footprintId: "pine", sliceCount: 2, spacing: 0.2, height: 0.4 }], /height must equal/],
    [[{ footprintId: "pine", sliceCount: 2, pivot: { x: 1.2, y: 1 } }], /pivot/],
    [[{ footprintId: "pine", sliceCount: 2, slices: [{ spacing: 0.2 }, { spacing: 0.2 }] }], /ground slice spacing/],
    ["pine", /spriteStacks must be an array/],
  ]) assert.throws(() => createArtPlan(map, { preset: "plain", spriteStacks }), pattern);
  assert.throws(() => createArtPlan(hinted, {
    preset: "plain",
    spriteStacks: [{ footprintId: "pine", sliceCount: 2, spacing: 0.3 }],
  }), /declared both/);
  assert.deepEqual(map, before);
  assert.equal(hinted.entities[0].spriteStack.sliceCount, 3);
});
