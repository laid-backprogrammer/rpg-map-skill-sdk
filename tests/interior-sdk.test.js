import test from "node:test";
import assert from "node:assert/strict";
import { generateInterior } from "../packages/map-sdk/src/interior.js";
import {
  TILE,
  findPath,
  canTraverse,
  canOccupy,
} from "../packages/map-sdk/src/core.js";

function assertSafe(map) {
  assert.equal(map.report.passed, true, map.report.issues.join("\n"));
  assert.equal(map.report.components ?? map.report.componentCount, 1);
  assert.equal(map.report.blockedRoadCells, 0);
  assert.equal(map.kind, "interior");
  assert.equal(
    new Set(map.rooms.map((room) => room.id)).size,
    map.rooms.length,
  );
  assert.equal(
    new Set(map.entities.map((entity) => entity.id)).size,
    map.entities.length,
  );
  assert.equal(
    new Set(map.landmarks.map((landmark) => landmark.id)).size,
    map.landmarks.length,
  );
  for (const landmark of map.landmarks) {
    const path = findPath(map, map.spawn, landmark);
    assert.ok(path.length, `Unreachable ${landmark.id}`);
    for (let index = 1; index < path.length; index += 1) {
      const start = { x: path[index - 1].x + 0.5, y: path[index - 1].y + 0.5 };
      const end = { x: path[index].x + 0.5, y: path[index].y + 0.5 };
      assert.equal(canTraverse(map, start, end), true);
    }
  }
  for (const entity of map.entities) {
    assert.equal(entity.solid, true);
    assert.equal(canOccupy(map, entity.x + 0.5, entity.y + 0.5), false);
    assert.ok(findPath(map, map.spawn, entity.approach).length);
  }
}

test("three interior templates have distinct physical partitions and usable rooms", () => {
  const maps = ["cottage", "inn", "workshop"].map((template) =>
    generateInterior({ seed: 17, template }),
  );
  assert.deepEqual(
    maps.map((map) => map.rooms.length),
    [4, 6, 3],
  );
  for (const map of maps) {
    assertSafe(map);
    assert.ok(map.entities.length >= map.rooms.length);
    assert.ok(
      map.tiles
        .slice(1, -1)
        .some((row) => row.slice(1, -1).includes(TILE.WALL)),
    );
    for (const room of map.rooms) assert.ok(room.doors.length && room.anchor);
  }
});

test("all seeds, larger dimensions, and maximum furniture remain connected", () => {
  for (const template of ["cottage", "inn", "workshop"]) {
    for (let seed = 0; seed < 12; seed += 1) {
      assertSafe(generateInterior({ template, seed, furnitureDensity: 1 }));
      if (seed < 3)
        assertSafe(
          generateInterior({
            template,
            seed,
            width: 29,
            height: 25,
            furnitureDensity: 1,
          }),
        );
    }
  }
});

test("four off-axis boundary portals retain full-width access and crossflow", () => {
  const map = generateInterior({
    template: "inn",
    width: 29,
    height: 25,
    furnitureDensity: 1,
    doors: [
      { id: "north", side: "north", offset: 8 },
      { id: "east", side: "east", offset: 17 },
      { id: "south", side: "south", offset: 20 },
      { id: "west", side: "west", offset: 8 },
    ],
  });
  assertSafe(map);
  assert.equal(map.doors.length, 4);
  for (const door of map.doors) {
    for (let delta = -1; delta <= 1; delta += 1) {
      const x = ["north", "south"].includes(door.side)
        ? door.x + delta
        : door.x;
      const y = ["east", "west"].includes(door.side) ? door.y + delta : door.y;
      assert.equal(map.walkable[y][x], true);
      assert.equal(map.roadMask[y][x], true);
    }
    for (const other of map.doors) assert.ok(findPath(map, door, other).length);
  }
});

test("interior seeds reproduce layout and furniture, without decorating empty density", () => {
  const options = {
    template: "cottage",
    seed: "stable-house",
    furnitureDensity: 1,
  };
  assert.deepEqual(generateInterior(options), generateInterior(options));
  assert.notDeepEqual(
    generateInterior(options).entities,
    generateInterior({ ...options, seed: "other-house" }).entities,
  );
  assert.equal(generateInterior({ furnitureDensity: 0 }).entities.length, 0);
  assertSafe(
    generateInterior({ doors: [{ side: "south", id: "room-northwest" }] }),
  );
});

test("bilateral and quadrilateral interiors reflect terrain and ground footprints exactly", () => {
  for (const template of ["cottage", "inn", "workshop"]) {
    for (const symmetry of ["bilateral", "quadrilateral"]) {
      const map = generateInterior({
        template,
        symmetry,
        seed: 5,
        furnitureDensity: 1,
      });
      assertSafe(map);
      for (let y = 0; y < map.height; y += 1) {
        for (let x = 0; x < map.width; x += 1) {
          assert.equal(map.tiles[y][x], map.tiles[y][map.width - x - 1]);
          assert.equal(map.roadMask[y][x], map.roadMask[y][map.width - x - 1]);
          if (symmetry === "quadrilateral") {
            assert.equal(map.tiles[y][x], map.tiles[map.height - y - 1][x]);
            assert.equal(
              map.roadMask[y][x],
              map.roadMask[map.height - y - 1][x],
            );
          }
        }
      }
      for (const entity of map.entities) {
        assert.ok(
          map.entities.some(
            (other) =>
              other.type === entity.type &&
              other.x === map.width - entity.x - entity.width &&
              other.y === entity.y &&
              other.width === entity.width &&
              other.height === entity.height,
          ),
        );
        if (symmetry === "quadrilateral")
          assert.ok(
            map.entities.some(
              (other) =>
                other.type === entity.type &&
                other.y === map.height - entity.y - entity.height &&
                other.x === entity.x &&
                other.width === entity.width &&
                other.height === entity.height,
            ),
          );
      }
    }
  }
});

test("a wider reserved corridor is honored without furniture encroachment", () => {
  const map = generateInterior({
    template: "inn",
    width: 35,
    height: 25,
    corridorWidth: 5,
    furnitureDensity: 1,
  });
  assertSafe(map);
  const door = map.doors[0];
  for (let delta = -2; delta <= 2; delta += 1)
    assert.equal(map.walkable[door.y][door.x + delta], true);
});

test("minimum footprints, even unsymmetric dimensions, and larger symmetric wings remain usable", () => {
  for (const [template, width, height] of [
    ["cottage", 15, 15],
    ["inn", 21, 19],
    ["workshop", 17, 15],
  ]) {
    assertSafe(
      generateInterior({ template, width, height, furnitureDensity: 1 }),
    );
    assertSafe(
      generateInterior({
        template,
        width: width + 1,
        height: height + 1,
        furnitureDensity: 1,
      }),
    );
    assertSafe(
      generateInterior({
        template,
        width: 29,
        height: 25,
        symmetry: "quadrilateral",
        furnitureDensity: 1,
      }),
    );
  }
});

test("invalid dimensions, density, symmetry, and conflicting doors are rejected", () => {
  for (const options of [
    { template: "castle" },
    { width: 7 },
    { width: 17.2 },
    { height: 102 },
    { template: "inn", width: 19 },
    { corridorWidth: 2 },
    { corridorWidth: 9 },
    { symmetry: "rotational" },
    { symmetry: "bilateral", width: 18 },
    { furnitureDensity: -0.1 },
    { furnitureDensity: 1.1 },
    { furnitureDensity: NaN },
    { doors: [] },
    { doors: [{ side: "ceiling" }] },
    { doors: [{ side: "north", offset: 1 }] },
    {
      doors: [
        { side: "north", offset: 6 },
        { side: "north", offset: 7 },
      ],
    },
    {
      doors: [
        { side: "north", id: "same" },
        { side: "south", id: "same" },
      ],
    },
    { symmetry: "bilateral", doors: [{ side: "east" }] },
    { symmetry: "quadrilateral", doors: [{ side: "south" }] },
  ])
    assert.throws(() => generateInterior(options), { name: "RangeError" });
  assert.throws(() => generateInterior(null), { name: "TypeError" });
});
