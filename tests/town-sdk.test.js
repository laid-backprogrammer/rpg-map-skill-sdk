import assert from "node:assert/strict";
import test from "node:test";
import { generateTown } from "../packages/map-sdk/src/town.js";
import {
  TILE,
  findPath,
  canTraverse,
  canOccupy,
} from "../packages/map-sdk/src/core.js";

function footprintKey(box) {
  return [box.x, box.y, box.width, box.height].join(",");
}

function assertMirrored(map) {
  const footprints = new Set(map.entities.map(footprintKey));
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      for (const grid of [map.tiles, map.roadMask, map.walkable]) {
        assert.equal(
          grid[y][x],
          grid[y][map.width - 1 - x],
          `horizontal mirror at ${x},${y}`,
        );
        assert.equal(
          grid[y][x],
          grid[map.height - 1 - y][x],
          `vertical mirror at ${x},${y}`,
        );
        if (map.width === map.height)
          assert.equal(grid[y][x], grid[x][y], `diagonal mirror at ${x},${y}`);
      }
    }
  }
  for (const box of map.entities) {
    assert.ok(
      footprints.has(
        footprintKey({ ...box, x: map.width - box.x - box.width }),
      ),
    );
    assert.ok(
      footprints.has(
        footprintKey({ ...box, y: map.height - box.y - box.height }),
      ),
    );
    if (map.width === map.height) {
      assert.ok(
        footprints.has(
          footprintKey({
            x: box.y,
            y: box.x,
            width: box.height,
            height: box.width,
          }),
        ),
      );
    }
  }
}

function assertPhysicallySafePath(map, start, end) {
  const path = findPath(map, start, end);
  assert.ok(
    path.length,
    `no route between ${JSON.stringify(start)} and ${JSON.stringify(end)}`,
  );
  for (let index = 0; index < path.length; index += 1) {
    const center = { x: path[index].x + 0.5, y: path[index].y + 0.5 };
    assert.ok(canOccupy(map, center.x, center.y));
    if (index > 0) {
      const previous = {
        x: path[index - 1].x + 0.5,
        y: path[index - 1].y + 0.5,
      };
      assert.ok(
        canTraverse(map, previous, center),
        `swept collision at ${JSON.stringify(center)}`,
      );
    }
  }
}

test("symmetric towns retain exact mirrors and rotations across seeds and sizes", () => {
  for (const width of [25, 33, 49, 65]) {
    for (const seed of ["north", "east", "south"]) {
      const map = generateTown({
        layout: "symmetric",
        width,
        height: width,
        seed,
        perimeterWalls: true,
      });
      assert.equal(map.schemaVersion, "1.0");
      assert.equal(map.kind, "town");
      assert.equal(map.validation.passed, true);
      assert.equal(map.validation.componentCount, 1);
      assert.equal(map.validation.reachableCount, map.validation.walkableCount);
      assert.equal(map.generation.actualBuildingCount, map.buildings.length);
      assert.ok(map.buildings.length >= 4);
      assert.equal(map.buildings.length % 4, 0);
      assertMirrored(map);
    }
  }
});

test("rectangular symmetric towns preserve both axes without imposing square dimensions", () => {
  const map = generateTown({
    width: 41,
    height: 31,
    seed: 42,
    buildingCount: 8,
  });
  assert.equal(map.buildings.length, 8);
  assert.equal(map.generation.symmetry, "mirror-xy");
  assertMirrored(map);
});

test("four boundary exits have mutually connected routes with swept-circle clearance", () => {
  for (const layout of ["symmetric", "grid"]) {
    const map = generateTown({ layout, seed: "ports", perimeterWalls: true });
    assert.deepEqual(
      map.exits.map((exit) => exit.id),
      ["north", "east", "south", "west"],
    );
    assert.equal(map.exits[0].y, 0);
    assert.equal(map.exits[1].x, map.width - 1);
    assert.equal(map.exits[2].y, map.height - 1);
    assert.equal(map.exits[3].x, 0);
    const boundarySides = [
      map.walkable[0],
      map.walkable.at(-1),
      map.walkable.map((row) => row[0]),
      map.walkable.map((row) => row.at(-1)),
    ];
    for (const side of boundarySides) {
      const openRuns = side.reduce(
        (runs, open, index) => runs + (open && !side[index - 1] ? 1 : 0),
        0,
      );
      assert.equal(openRuns, 1, "each perimeter side has exactly one gate");
      assert.equal(side.filter(Boolean).length, map.generation.roadWidth);
    }
    for (let first = 0; first < map.exits.length; first += 1) {
      assert.equal(
        map.tiles[map.exits[first].y][map.exits[first].x],
        TILE.PATH,
      );
      for (let second = first + 1; second < map.exits.length; second += 1) {
        assertPhysicallySafePath(map, map.exits[first], map.exits[second]);
      }
    }
  }
});

test("all building entrances connect to spawn and have integer collision footprints", () => {
  for (const layout of ["symmetric", "grid"]) {
    const map = generateTown({ layout, seed: "entrances", buildingCount: 12 });
    assert.equal(map.buildings.length, 12);
    for (const building of map.buildings) {
      assert.ok(
        [building.x, building.y, building.width, building.height].every(
          Number.isInteger,
        ),
      );
      assert.equal(building.solid, true);
      assert.ok(building.interiorTemplate);
      assert.ok(building.visual.height > building.height);
      for (const door of building.doors)
        assertPhysicallySafePath(map, map.spawn, door);
    }
    assert.ok(
      map.validation.landmarkResults.every(
        (result) => result.reachable && result.clearancePassed,
      ),
    );
    assert.ok(
      map.validation.exitResults.every(
        (result) => result.reachable && result.clearancePassed,
      ),
    );
  }
});

test("seeds are reproducible and affect lot placement rather than breaking symmetry", () => {
  const first = generateTown({ seed: "repeat" });
  const repeated = generateTown({ seed: "repeat" });
  const second = generateTown({ seed: "different" });
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(
    first.buildings.map(footprintKey),
    second.buildings.map(footprintKey),
  );
  assertMirrored(first);
  assertMirrored(second);
});

test("grid layout allows even sizes and arbitrary exact building counts", () => {
  const map = generateTown({
    layout: "grid",
    width: 48,
    height: 36,
    seed: "grid",
    buildingCount: 7,
  });
  assert.equal(map.buildings.length, 7);
  assert.equal(map.validation.passed, true);
  assert.equal(map.generation.requestedBuildingCount, 7);
  assert.ok(map.tiles.every((row) => row.every((tile) => tile !== TILE.WATER)));
  for (const roadWidth of [3, 5, 7]) {
    const small = generateTown({
      layout: "grid",
      width: 33,
      height: 33,
      seed: "small-grid",
      roadWidth,
    });
    assert.ok(
      small.buildings.length >= 4,
      "secondary streets must leave usable building lots",
    );
  }
});

test("empty towns and wider gate streets remain connected", () => {
  for (const roadWidth of [3, 5, 7]) {
    const map = generateTown({
      width: 25,
      height: 25,
      roadWidth,
      buildingCount: 0,
      perimeterWalls: true,
    });
    assert.equal(map.buildings.length, 0);
    assert.equal(map.validation.passed, true);
    for (const exit of map.exits)
      assertPhysicallySafePath(map, map.spawn, exit);
    assertMirrored(map);
  }
});

test("invalid options fail with actionable messages rather than silently changing geometry", () => {
  assert.throws(() => generateTown({ width: 24 }), /width.*25.*129/);
  assert.throws(() => generateTown({ height: 130 }), /height.*25.*129/);
  assert.throws(() => generateTown({ width: 48 }), /odd width and height/);
  assert.throws(() => generateTown({ roadWidth: 2 }), /odd integer/);
  assert.throws(() => generateTown({ roadWidth: 9 }), /odd integer/);
  assert.throws(() => generateTown({ layout: "circular" }), /symmetric.*grid/);
  assert.throws(() => generateTown({ buildingCount: 7 }), /multiple of 4/);
  assert.throws(() => generateTown({ buildingCount: -4 }), /buildingCount/);
  assert.throws(() => generateTown({ perimeterWalls: "yes" }), /boolean/);
  assert.throws(
    () => generateTown({ width: 25, height: 25, buildingCount: 256 }),
    /Reduce buildingCount/,
  );
});
