import test from "node:test";
import assert from "node:assert/strict";
import {
  createMapSDK,
  createArtPlan,
  generateTown,
  generateInterior,
  generateBuildingInterior,
  validateMap,
  assertValidMap,
  rebuildNavigation,
  findPath,
  canTraverse,
  TILE,
  MapValidationError,
} from "@mossbrook/map-sdk";

function simpleMap(entities = []) {
  return {
    width: 3,
    height: 3,
    tiles: Array.from({ length: 3 }, () => [0, 0, 0]),
    walkable: Array.from({ length: 3 }, () => [true, true, true]),
    entities,
    spawn: { x: 0, y: 1 },
    landmarks: [{ id: "target", x: 2, y: 1 }],
    exits: [],
    mission: [],
  };
}

test('public art planner and factory return immutable-world, serializable rendering plans', () => {
  const sdk = createMapSDK({ seed: 'art-public' });
  const town = sdk.generateTown({ layout: 'symmetric' });
  const before = JSON.stringify(town);
  const plan = createArtPlan(town, { preset: 'generic' });
  assert.deepEqual(sdk.createArtPlan(town, { preset: 'generic' }), plan);
  assert.equal(JSON.stringify(town), before);
  assert.equal(plan.statistics.collisionChanges, 0);
  assert.equal(plan.materials.length, town.height);
  assert.equal(JSON.parse(JSON.stringify(plan)).version, '1.0');
  assert.equal(sdk.createArtPlan(sdk.generateInterior()).statistics.collisionChanges, 0);
});

test("public SDK has no renderer dependency and deterministic factory defaults", () => {
  const sdk = createMapSDK({ seed: "integration" });
  assert(Object.isFrozen(sdk));
  assert.deepEqual(
    sdk.generateTown({ layout: "symmetric" }),
    sdk.generateTown({ layout: "symmetric" }),
  );
  assert.equal(TILE.WALL, 4);
  assert.equal(sdk.generateInterior().report.passed, true);
});

test("every public town preset connects four boundary exits and every entrance", () => {
  for (const layout of ["organic", "symmetric", "grid"])
    for (const seed of [0, 1, 1042, "sdk"]) {
      const map = generateTown({ layout, seed });
      assert.equal(map.kind, "town");
      assert.equal(map.report.passed, true);
      assert.equal(map.exits.length, 4);
      assert.deepEqual(
        new Set(map.exits.map((port) => port.side)),
        new Set(["north", "east", "south", "west"]),
      );
      for (const start of map.exits)
        for (const end of map.exits) assert(findPath(map, start, end).length);
      for (const building of map.buildings)
        for (const door of building.doors)
          assert(findPath(map, map.spawn, door).length);
      assert.equal(validateMap(JSON.parse(JSON.stringify(map))).passed, true);
    }
});

test("thin intermediate obstacles split the physical graph, not only cell occupancy", () => {
  const map = simpleMap([
    {
      id: "fence",
      type: "fence",
      solid: true,
      x: 1.95,
      y: 0,
      width: 0.1,
      height: 3,
    },
  ]);
  rebuildNavigation(map);
  assert(map.walkable.every((row) => row.every(Boolean)));
  assert.equal(canTraverse(map, { x: 1.5, y: 1.5 }, { x: 2.5, y: 1.5 }), false);
  assert.deepEqual(findPath(map, map.spawn, map.landmarks[0]), []);
  const report = validateMap(map);
  assert.equal(report.components, 2);
  assert.equal(report.passed, false);
});

test("A* finds a safe detour instead of rejecting the unsafe shortest path afterward", () => {
  const map = simpleMap([
    {
      id: "fence",
      type: "fence",
      solid: true,
      x: 0.5,
      y: 0.95,
      width: 1,
      height: 0.1,
    },
  ]);
  map.spawn = { x: 1, y: 0 };
  map.landmarks = [{ id: "target", x: 1, y: 1 }];
  rebuildNavigation(map);
  const path = findPath(map, map.spawn, map.landmarks[0]);
  assert(path.length > 2);
  for (let index = 1; index < path.length; index += 1)
    assert(
      canTraverse(
        map,
        { x: path[index - 1].x + 0.5, y: path[index - 1].y + 0.5 },
        { x: path[index].x + 0.5, y: path[index].y + 0.5 },
      ),
    );
  assert.equal(validateMap(map).passed, true);
});

test("malformed and sparse geometry cannot produce a successful validation", () => {
  const map = simpleMap();
  map.spawn = { x: "0", y: "0" };
  assert.equal(validateMap(map).passed, false);
  assert.throws(
    () =>
      validateMap({ ...simpleMap(), tiles: [Array(3), Array(3), Array(3)] }),
    /tile grid/,
  );
  assert.throws(
    () => validateMap({ ...simpleMap(), tiles: Array(3) }),
    /tile grid/,
  );
  map.spawn = { x: 0, y: 0 };
  map.landmarks = [null];
  assert.equal(validateMap(map).passed, false);
});

test("invalid SDK parameters fail loudly instead of silently changing presets", () => {
  assert.throws(() => generateTown({ layout: "unknown" }), /Unknown/);
  assert.throws(() => generateTown({ width: 49 }), /48 x 36/);
  assert.throws(() => generateTown({ density: Infinity }), /density/);
  assert.throws(() => generateTown({ seed: 1n }), /seed/);
  for (const layout of ["organic", "symmetric", "grid"])
    for (const perimeterWalls of ["yes", 1, null])
      assert.throws(() => generateTown({ layout, perimeterWalls }), /boolean/);
  assert.throws(() => generateInterior({ seed: Infinity }), /seed/);
  assert.throws(() => createMapSDK([]), /object/);
  assert.throws(() => generateInterior({ template: "unknown" }), /template/);
});

test("revalidation detects stale navigation, missing gates and duplicate port positions", () => {
  const map = generateTown({ layout: "grid" });
  map.walkable[map.spawn.y][map.spawn.x] = false;
  assert.equal(validateMap(map).reachableCount, 0);
  assert.equal(validateMap(map).mismatchedCells, 1);
  rebuildNavigation(map);
  assert.equal(assertValidMap(map), map);
  map.exits.pop();
  assert.equal(validateMap(map).passed, false);
  const second = generateTown({ layout: "symmetric" });
  second.exits[1] = { ...second.exits[0], id: "other" };
  assert.equal(validateMap(second).passed, false);
});

test("building interiors use stable parent links and match exterior entrance sides", () => {
  const town = generateTown({ layout: "symmetric", seed: "linked" });
  for (const building of town.buildings) {
    const inside = generateBuildingInterior(town, building.id);
    assert.equal(inside.report.passed, true);
    assert.equal(inside.parent.mapId, town.id);
    assert.equal(inside.parent.buildingId, building.id);
    for (const connection of inside.connections)
      assert(inside.doors.some((door) => door.id === connection.inside));
  }
  assert.throws(
    () => generateBuildingInterior(town, "missing"),
    /Unknown building/,
  );
  assert.throws(
    () => generateBuildingInterior(generateInterior(), "missing"),
    /town/,
  );
});

test("assertValidMap provides a structured error report for impossible modifications", () => {
  const map = generateInterior();
  map.tiles[map.spawn.y][map.spawn.x] = TILE.WALL;
  rebuildNavigation(map);
  assert.throws(
    () => assertValidMap(map),
    (error) => error instanceof MapValidationError && !error.report.passed,
  );
});

test("revalidation preserves declared structural symmetry after external edits", () => {
  const map = generateTown({ layout: "symmetric" });
  assert.equal(map.report.symmetry.passed, true);
  map.tiles[0][0] = TILE.FLOOR;
  rebuildNavigation(map);
  const report = validateMap(map);
  assert.equal(report.symmetry.passed, false);
  assert.equal(report.passed, false);
  assert.throws(() => assertValidMap(map), MapValidationError);
});

test("walled towns reject extra physical gates even if every declared exit remains reachable", () => {
  const map = generateTown({ layout: "grid", perimeterWalls: true });
  map.tiles[0][2] = TILE.PATH;
  rebuildNavigation(map);
  const report = validateMap(map);
  assert.equal(report.allExitsReachable, true);
  assert.equal(report.passed, false);
  assert(report.issues.some((issue) => issue.includes("Boundary openings")));
});
