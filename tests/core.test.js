import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_RADIUS, TILE, canOccupy, canTraverse, findPath, findPathFromPosition, isWalkable, maximalRectangle, validateMap as validateWorld,
} from '../packages/map-sdk/src/core.js';
import { generateWorld } from '../packages/map-sdk/src/village.js';

test('generation is deterministic, and different seeds vary decoration', () => {
  assert.deepEqual(generateWorld('willow'), generateWorld('willow'));
  assert.notDeepEqual(generateWorld('willow').entities, generateWorld('harvest').entities);
});

test('seeded structural packing varies building footprints, not only decoration', () => {
  const footprint = (world) => world.entities.filter((entity) => ['cottage', 'lodge', 'workshop'].includes(entity.type))
    .map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  const first = generateWorld(1042);
  const second = generateWorld(1043);
  assert.notDeepEqual(footprint(first), footprint(second));
  assert.deepEqual(footprint(first), footprint(generateWorld(1042, { density: 1 })));
  assert.equal(first.generation.buildingPlacement.method, 'seeded-road-aware-candidate-packing');
  assert.equal(first.generation.buildingPlacement.lots.length, 5);
  for (const lot of first.generation.buildingPlacement.lots) {
    assert.ok(lot.candidateCount > 1);
    const house = first.entities.find((entity) => entity.id === lot.id);
    assert.ok(findPath(first, first.spawn, house.door).length);
    assert.equal(lot.frontage.width, 3);
    for (let y = lot.frontage.y; y < lot.frontage.y + lot.frontage.height; y += 1) {
      for (let x = lot.frontage.x; x < lot.frontage.x + lot.frontage.width; x += 1) assert.equal(isWalkable(first, x, y), true);
    }
  }
  for (const [id, landmarkId] of [['elder-home', 'elder'], ['artisan-house', 'workshop']]) {
    const house = first.entities.find((entity) => entity.id === id);
    const landmark = first.landmarks.find((point) => point.id === landmarkId);
    assert.equal(landmark.x, house.door.x);
    assert.equal(landmark.y, house.door.y + 1);
  }
});

test('all seeds and forest densities preserve the authored playable village', () => {
  let randomSeed = 61822;
  for (let sample = 0; sample < 100; sample += 1) {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
    const seed = randomSeed;
    for (const density of [0, 0.55, 1]) {
      const world = generateWorld(seed, { density });
      assert.equal(world.width, 48);
      assert.equal(world.height, 36);
      assert.equal(world.report.passed, true, `seed=${seed}, density=${density}: ${world.report.issues.join('; ')}`);
      assert.equal(world.report.components, 1);
      assert.equal(world.report.reachablePercent, 100);
      assert.equal(world.report.allLandmarksReachable, true);
      assert.equal(world.report.clearance.passed, true);
      assert.equal(world.report.blockedRoadCells, 0);
      assert.equal(world.report.mismatchedCells, 0);
      assert.ok(world.report.clearance.minimumRouteClearance > CHARACTER_RADIUS);
      assert.equal(world.entities.filter((entity) => ['cottage', 'lodge', 'workshop'].includes(entity.type)).length, 5);
      for (const landmark of world.landmarks) assert.ok(isWalkable(world, landmark.x, landmark.y));
      for (const house of world.entities.filter((entity) => ['cottage', 'lodge', 'workshop'].includes(entity.type))) {
        assert.ok(findPath(world, world.spawn, house.door).length, `Unreachable house ${house.id}, seed ${seed}`);
      }
    }
  }
});

test('village props have separate ground footprints and NPC follows the generated elder approach', () => {
  const world = generateWorld(1042);
  for (const type of ['lantern', 'noticeboard', 'signpost']) {
    const props = world.entities.filter((entity) => entity.type === type);
    assert.ok(props.length);
    for (const prop of props) {
      assert.equal(prop.solid, true);
      assert.equal(canOccupy(world, prop.x + prop.width / 2, prop.y + prop.height / 2), false);
      assert.ok(prop.visual.height > prop.height);
    }
  }
  const elder = world.entities.find((entity) => entity.id === 'village-elder');
  const destination = world.landmarks.find((landmark) => landmark.id === 'elder');
  assert.equal(elder.solid, false);
  assert.equal(Math.floor(elder.x), destination.x);
  assert.equal(Math.floor(elder.y), destination.y);
  assert.ok(findPath(world, world.spawn, destination).length);
});

test('farm fences block swept movement and grid routes while leaving the field sides open', () => {
  const world = generateWorld(1042);
  const fences = world.entities.filter((entity) => entity.type === 'fence');
  assert.equal(fences.length, 2);
  for (const fence of fences) {
    const x = fence.x + fence.width / 2;
    const start = { x, y: fence.y - 0.5 };
    const end = { x, y: fence.y + fence.height + 0.5 };
    assert.equal(canOccupy(world, start.x, start.y), true);
    assert.equal(canOccupy(world, end.x, end.y), true);
    assert.equal(canTraverse(world, start, end), false);
    const route = findPathFromPosition(world, start, { x: Math.floor(x), y: Math.floor(end.y) });
    assert.ok(route.length);
    assert.ok(route.some((point) => point.x < fence.x || point.x >= fence.x + fence.width));
    for (let index = 1; index < route.length; index += 1) {
      assert.ok(canTraverse(world,
        { x: route[index - 1].x + 0.5, y: route[index - 1].y + 0.5 },
        { x: route[index].x + 0.5, y: route[index].y + 0.5 }));
    }
  }
  assert.equal(world.report.components, 1);
  assert.equal(world.report.blockedRoadCells, 0);
});

test('the bridge objective finishes on the east bank after crossing bridge tiles', () => {
  const world = generateWorld(1042);
  const bridge = world.landmarks.find((landmark) => landmark.id === 'bridge');
  const route = findPath(world, world.spawn, bridge);
  assert.ok(route.some(({ x, y }) => world.tiles[y][x] === TILE.BRIDGE));
  assert.ok(bridge.x >= 38);
  assert.equal(world.tiles[bridge.y][bridge.x], TILE.PATH);
});

test('a continuous player can resume A* from a free corner of a blocked tile', () => {
  const world = generateWorld(1042);
  const start = { x: 20.001, y: 15.001 };
  assert.equal(canOccupy(world, start.x, start.y), true);
  assert.equal(isWalkable(world, Math.floor(start.x), Math.floor(start.y)), false);
  const path = findPathFromPosition(world, start, world.spawn);
  assert.ok(path.length > 0);
  assert.equal(canTraverse(world, start, { x: path[0].x + 0.5, y: path[0].y + 0.5 }), true);
  assert.deepEqual(path.at(-1), world.spawn);
  assert.deepEqual(findPathFromPosition(world, { x: 20.5, y: 15.5 }, world.spawn), []);
  assert.deepEqual(findPathFromPosition(world, start, { x: 34, y: 0 }), []);
});

test('continuous starts across the village join collision-safe cardinal routes', () => {
  const world = generateWorld(1042, { density: 1 });
  let state = 9814;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let validStarts = 0;
  for (let sample = 0; sample < 140; sample += 1) {
    const start = { x: random() * world.width, y: random() * world.height };
    if (!canOccupy(world, start.x, start.y)) continue;
    validStarts += 1;
    const route = findPathFromPosition(world, start, world.spawn);
    assert.ok(route.length, `No route from physical position ${start.x}, ${start.y}`);
    let previous = start;
    for (const point of route) {
      const center = { x: point.x + 0.5, y: point.y + 0.5 };
      assert.ok(canTraverse(world, previous, center));
      previous = center;
    }
  }
  assert.ok(validStarts > 90);
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      if (!isWalkable(world, x, y)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (isWalkable(world, x + dx, y + dy)) assert.ok(canTraverse(world,
          { x: x + 0.5, y: y + 0.5 }, { x: x + dx + 0.5, y: y + dy + 0.5 }));
      }
    }
  }
});

test('swept collision catches thin intermediate obstacles and allows rounded-corner clearance', () => {
  const world = {
    width: 5, height: 5, tiles: Array.from({ length: 5 }, () => Array(5).fill(TILE.GRASS)),
    collisionRadius: 0.28,
    entities: [{ x: 2, y: 1, width: 0.001, height: 3, solid: true }],
  };
  const start = { x: 1.5, y: 2.5 };
  const end = { x: 2.5, y: 2.5 };
  assert.equal(canOccupy(world, start.x, start.y), true);
  assert.equal(canOccupy(world, end.x, end.y), true);
  assert.equal(canTraverse(world, start, end), false);
  assert.equal(canTraverse(world, { x: 1, y: 0.5 }, { x: 4, y: 0.5 }), true);
  world.entities = [{ x: 2, y: 2, width: 1, height: 1, solid: true }];
  assert.equal(canTraverse(world, { x: 1.8, y: 1.8 }, { x: 1.5, y: 1.5 }), true);
  assert.equal(canTraverse(world, { x: 1.8, y: 1.8 }, { x: 2.5, y: 2.5 }), false);
  assert.equal(canTraverse(world, { x: -1, y: 0.5 }, end), false);
  assert.equal(canTraverse(world, start, { x: NaN, y: 1 }), false);
  assert.equal(canTraverse(world, start, end, -1), false);
  world.entities = [];
  world.tiles[2][2] = TILE.WATER;
  assert.equal(canTraverse(world, { x: 1.5, y: 2.5 }, { x: 3.5, y: 2.5 }), false);
});

test('every walkable tile agrees with radius-aware ground collision', () => {
  const world = generateWorld(42);
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      assert.equal(world.walkable[y][x], canOccupy(world, x + 0.5, y + 0.5));
    }
  }
  const house = world.entities.find((entity) => entity.id === 'elder-home');
  assert.equal(canOccupy(world, house.x - CHARACTER_RADIUS / 2, house.y + 1), false);
  assert.equal(canOccupy(world, house.x - CHARACTER_RADIUS - 0.01, house.y + 1), true);
  assert.equal(canOccupy(world, house.x + 1, house.y + 1), false);
  assert.equal(canOccupy(world, -0.1, 2), false);
  assert.equal(canOccupy(world, 0.1, 2), false);
  assert.equal(canOccupy(world, NaN, 2), false);
  assert.equal(canOccupy(world, 2, 2, -1), false);
});

test('large tree canopies do not block ground outside the trunk footprint', () => {
  const world = generateWorld(42, { density: 1 });
  const tree = world.entities.find((entity) => entity.type === 'tree' && entity.y > 5);
  assert.ok(tree);
  assert.equal(canOccupy(world, tree.x + tree.width / 2, tree.y + tree.height / 2), false);
  assert.equal(canOccupy(world, tree.x + tree.width / 2, tree.y - 0.6), true);
});

test('A* routes are cardinal, collision-safe, stable across repeated calls, and cross the bridge', () => {
  const world = generateWorld(314);
  const destination = world.landmarks.find((landmark) => landmark.id === 'meadow');
  const path = findPath(world, world.spawn, destination);
  assert.deepEqual(path, findPath(world, world.spawn, destination));
  assert.deepEqual(path[0], world.spawn);
  assert.deepEqual(path.at(-1), { x: destination.x, y: destination.y });
  assert.ok(path.some(({ x, y }) => world.tiles[y][x] === TILE.BRIDGE));
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    assert.equal(Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y), 1);
    for (let step = 0; step <= 10; step += 1) {
      assert.ok(canOccupy(world, previous.x + 0.5 + (current.x - previous.x) * step / 10,
        previous.y + 0.5 + (current.y - previous.y) * step / 10));
    }
  }
  assert.deepEqual(findPath(world, world.spawn, { x: 34, y: 0 }), []);
  assert.deepEqual(findPath(world, { x: -1, y: 0 }, destination), []);
  assert.deepEqual(findPath(world, world.spawn, world.spawn), [world.spawn]);
  assert.deepEqual(findPath(world, world.spawn, { x: 12.5, y: 12 }), []);
});

test('validation detects a destroyed bridge, blocked spawn, and stale collision data', () => {
  const world = generateWorld(42);
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      if (world.tiles[y][x] === TILE.BRIDGE) {
        world.tiles[y][x] = TILE.WATER;
        world.walkable[y][x] = false;
      }
    }
  }
  const report = validateWorld(world);
  assert.equal(report.passed, false);
  assert.equal(report.allLandmarksReachable, false);
  assert.ok(report.components >= 2);
  assert.ok(report.reachablePercent < 100);
  const blocked = generateWorld(8);
  blocked.walkable[blocked.spawn.y][blocked.spawn.x] = false;
  const blockedReport = validateWorld(blocked);
  assert.equal(blockedReport.passed, false);
  assert.equal(blockedReport.reachableCount, 0);
  assert.equal(blockedReport.mismatchedCells, 1);
});

test('maximum rectangle handles empty, blocked, and non-square inputs', () => {
  assert.deepEqual(maximalRectangle([]), { x: 0, y: 0, width: 0, height: 0, area: 0 });
  assert.equal(maximalRectangle([[false, false]]).area, 0);
  assert.deepEqual(maximalRectangle([[true, true, true], [true, true, true]]), {
    x: 0, y: 0, width: 3, height: 2, area: 6,
  });
  assert.equal(maximalRectangle([[true, false, true], [true, true, true], [true, true, true]]).area, 6);
  assert.throws(() => maximalRectangle([[true], [true, true]]), /rectangular/);
});

test('histogram maximum rectangle agrees with brute force on randomized small grids', () => {
  let state = 145;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let sample = 0; sample < 80; sample += 1) {
    const width = 1 + Math.floor(random() * 6);
    const height = 1 + Math.floor(random() * 5);
    const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => random() > 0.35));
    let bruteArea = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      for (let bottom = y; bottom < height; bottom += 1) for (let right = x; right < width; right += 1) {
        let free = true;
        for (let yy = y; yy <= bottom; yy += 1) for (let xx = x; xx <= right; xx += 1) free &&= grid[yy][xx];
        if (free) bruteArea = Math.max(bruteArea, (right - x + 1) * (bottom - y + 1));
      }
    }
    const result = maximalRectangle(grid);
    assert.equal(result.area, bruteArea);
    for (let y = result.y; y < result.y + result.height; y += 1) {
      for (let x = result.x; x < result.x + result.width; x += 1) assert.equal(grid[y][x], true);
    }
  }
});

test('density options are normalized and the report can be serialized', () => {
  assert.equal(generateWorld(42, { density: -4 }).generation.density, 0);
  assert.equal(generateWorld(42, { density: 8 }).generation.density, 1);
  assert.equal(generateWorld(42, { density: NaN }).generation.density, 0.55);
  assert.doesNotThrow(() => JSON.stringify(generateWorld('a seed').report));
});
