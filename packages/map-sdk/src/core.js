import PF from "pathfinding";

export const TILE = Object.freeze({
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  BRIDGE: 3,
  WALL: 4,
  FLOOR: 5,
});
export const CHARACTER_RADIUS = 0.28;
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const EPSILON = 1e-9;

export function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed))
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGrid(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

export function rectangleDistance(x, y, rectangle) {
  return Math.hypot(
    Math.max(rectangle.x - x, 0, x - rectangle.x - rectangle.width),
    Math.max(rectangle.y - y, 0, y - rectangle.y - rectangle.height),
  );
}

function segmentRectangleDistance(start, end, rectangle) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let near = 0;
  let far = 1;
  for (const [origin, direction, minimum, maximum] of [
    [start.x, dx, rectangle.x, rectangle.x + rectangle.width],
    [start.y, dy, rectangle.y, rectangle.y + rectangle.height],
  ]) {
    if (Math.abs(direction) < 1e-12) {
      if (origin < minimum || origin > maximum) {
        far = -1;
        break;
      }
    } else {
      const first = (minimum - origin) / direction;
      const last = (maximum - origin) / direction;
      near = Math.max(near, Math.min(first, last));
      far = Math.min(far, Math.max(first, last));
    }
  }
  if (near <= far) return 0;
  let distance = Math.min(
    rectangleDistance(start.x, start.y, rectangle),
    rectangleDistance(end.x, end.y, rectangle),
  );
  const lengthSquared = dx * dx + dy * dy;
  for (const x of [rectangle.x, rectangle.x + rectangle.width]) {
    for (const y of [rectangle.y, rectangle.y + rectangle.height]) {
      const progress = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared,
            ),
          )
        : 0;
      distance = Math.min(
        distance,
        Math.hypot(x - start.x - progress * dx, y - start.y - progress * dy),
      );
    }
  }
  return distance;
}

function solidTile(map, value) {
  return (map.solidTiles ?? [TILE.WATER, TILE.WALL]).includes(value);
}
const center = (point) => ({ x: point.x + 0.5, y: point.y + 0.5 });

export function isWalkable(map, x, y) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height &&
    map.walkable?.[y]?.[x] === true
  );
}

export function canOccupy(
  map,
  x,
  y,
  radius = map.collisionRadius ?? CHARACTER_RADIUS,
) {
  if (![x, y, radius].every(Number.isFinite) || radius < 0) return false;
  if (
    x - radius < 0 ||
    y - radius < 0 ||
    x + radius > map.width ||
    y + radius > map.height
  )
    return false;
  for (
    let ty = Math.max(0, Math.floor(y - radius));
    ty <= Math.min(map.height - 1, Math.floor(y + radius));
    ty += 1
  ) {
    for (
      let tx = Math.max(0, Math.floor(x - radius));
      tx <= Math.min(map.width - 1, Math.floor(x + radius));
      tx += 1
    ) {
      if (
        solidTile(map, map.tiles[ty][tx]) &&
        rectangleDistance(x, y, { x: tx, y: ty, width: 1, height: 1 }) <
          radius + EPSILON
      )
        return false;
    }
  }
  return !(map.entities ?? []).some(
    (entity) =>
      entity.solid && rectangleDistance(x, y, entity) < radius + EPSILON,
  );
}

export function canTraverse(
  map,
  start,
  end,
  radius = map.collisionRadius ?? CHARACTER_RADIUS,
) {
  if (
    !start ||
    !end ||
    ![start.x, start.y, end.x, end.y, radius].every(Number.isFinite) ||
    radius < 0
  )
    return false;
  const left = Math.min(start.x, end.x) - radius;
  const top = Math.min(start.y, end.y) - radius;
  const right = Math.max(start.x, end.x) + radius;
  const bottom = Math.max(start.y, end.y) + radius;
  if (left < 0 || top < 0 || right > map.width || bottom > map.height)
    return false;
  for (
    let y = Math.max(0, Math.floor(top));
    y <= Math.min(map.height - 1, Math.floor(bottom));
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.floor(left));
      x <= Math.min(map.width - 1, Math.floor(right));
      x += 1
    ) {
      if (
        solidTile(map, map.tiles[y][x]) &&
        segmentRectangleDistance(start, end, { x, y, width: 1, height: 1 }) <
          radius + EPSILON
      )
        return false;
    }
  }
  return !(map.entities ?? []).some(
    (entity) =>
      entity.solid &&
      entity.x <= right + EPSILON &&
      entity.y <= bottom + EPSILON &&
      entity.x + entity.width >= left - EPSILON &&
      entity.y + entity.height >= top - EPSILON &&
      segmentRectangleDistance(start, end, entity) < radius + EPSILON,
  );
}

export function rebuildNavigation(map) {
  assertGeometry(map);
  map.walkable = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) =>
      canOccupy(map, x + 0.5, y + 0.5),
    ),
  );
  return map;
}

// Every graph edge uses the same circle sweep as continuous player movement.
function navigationGraph(map) {
  const physicalCells = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) =>
      canOccupy(map, x + 0.5, y + 0.5),
    ),
  );
  const cells = physicalCells.map((row, y) =>
    row.map((value, x) => value && map.walkable?.[y]?.[x] === true),
  );
  const edges = makeGrid(map.width, map.height, 0);
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      if (!cells[y][x]) continue;
      for (const direction of [1, 2]) {
        const [dx, dy] = DIRECTIONS[direction];
        if (
          cells[y + dy]?.[x + dx] &&
          canTraverse(map, center({ x, y }), center({ x: x + dx, y: y + dy }))
        ) {
          edges[y][x] |= 1 << direction;
          edges[y + dy][x + dx] |= 1 << ((direction + 2) % 4);
        }
      }
    }
  return { cells, physicalCells, edges };
}

function flood(graph, start, visited = new Set()) {
  if (
    !start ||
    !Number.isInteger(start.x) ||
    !Number.isInteger(start.y) ||
    !graph.cells[start.y]?.[start.x]
  )
    return [];
  const width = graph.cells[0].length;
  const queue = [{ x: start.x, y: start.y }];
  visited.add(start.y * width + start.x);
  for (let head = 0; head < queue.length; head += 1) {
    const { x, y } = queue[head];
    for (let direction = 0; direction < 4; direction += 1) {
      if (!(graph.edges[y][x] & (1 << direction))) continue;
      const [dx, dy] = DIRECTIONS[direction];
      const key = (y + dy) * width + x + dx;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ x: x + dx, y: y + dy });
      }
    }
  }
  return queue;
}

export function reachableCells(map, start = map.spawn) {
  return flood(navigationGraph(map), start);
}

export function findPath(map, start, end) {
  if (
    !start ||
    !end ||
    !isWalkable(map, start.x, start.y) ||
    !isWalkable(map, end.x, end.y) ||
    !canOccupy(map, start.x + 0.5, start.y + 0.5) ||
    !canOccupy(map, end.x + 0.5, end.y + 0.5)
  )
    return [];
  const grid = new PF.Grid(
    map.walkable.map((row) => row.map((value) => (value ? 0 : 1))),
  );
  const neighbors = grid.getNeighbors.bind(grid);
  const edgeCache = new Map();
  grid.getNeighbors = (node, movement) =>
    neighbors(node, movement).filter((next) => {
      const first = node.y * map.width + node.x;
      const second = next.y * map.width + next.x;
      const key = `${Math.min(first, second)}:${Math.max(first, second)}`;
      if (!edgeCache.has(key))
        edgeCache.set(key, canTraverse(map, center(node), center(next)));
      return edgeCache.get(key);
    });
  const finder = new PF.AStarFinder({
    allowDiagonal: false,
    dontCrossCorners: true,
  });
  return finder
    .findPath(start.x, start.y, end.x, end.y, grid)
    .map(([x, y]) => ({ x, y }));
}

export function findPathFromPosition(map, start, end) {
  if (
    !start ||
    !end ||
    !canOccupy(map, start.x, start.y) ||
    !isWalkable(map, end.x, end.y)
  )
    return [];
  const candidates = [];
  for (
    let y = Math.max(0, Math.floor(start.y) - 2);
    y <= Math.min(map.height - 1, Math.floor(start.y) + 2);
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.floor(start.x) - 2);
      x <= Math.min(map.width - 1, Math.floor(start.x) + 2);
      x += 1
    ) {
      if (isWalkable(map, x, y))
        candidates.push({
          x,
          y,
          distance: Math.hypot(x + 0.5 - start.x, y + 0.5 - start.y),
        });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates) {
    if (!canTraverse(map, start, center(candidate))) continue;
    const path = findPath(map, candidate, end);
    if (path.length) return path;
  }
  return [];
}

export function maximalRectangle(grid) {
  const width = grid[0]?.length ?? 0;
  if (grid.some((row) => row.length !== width))
    throw new TypeError("The rectangle grid must be rectangular.");
  const histogram = Array(width).fill(0);
  let best = { x: 0, y: 0, width: 0, height: 0, area: 0 };
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < width; x += 1)
      histogram[x] = grid[y][x] ? histogram[x] + 1 : 0;
    const stack = [];
    for (let x = 0; x <= width; x += 1) {
      const height = x === width ? 0 : histogram[x];
      while (stack.length && histogram[stack.at(-1)] > height) {
        const rectangleHeight = histogram[stack.pop()];
        const left = stack.length ? stack.at(-1) + 1 : 0;
        const rectangleWidth = x - left;
        if (rectangleWidth * rectangleHeight > best.area)
          best = {
            x: left,
            y: y - rectangleHeight + 1,
            width: rectangleWidth,
            height: rectangleHeight,
            area: rectangleWidth * rectangleHeight,
          };
      }
      stack.push(x);
    }
  }
  return best;
}

function assertGeometry(map) {
  if (
    !map ||
    !Number.isInteger(map.width) ||
    !Number.isInteger(map.height) ||
    map.width < 1 ||
    map.height < 1 ||
    !Array.isArray(map.tiles) ||
    map.tiles.length !== map.height ||
    Array.from(map.tiles).some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== map.width ||
        Array.from(row).some((value) => !Number.isInteger(value)),
    )
  )
    throw new TypeError(
      "Map dimensions must match its rectangular integer tile grid.",
    );
  for (const field of ["entities", "landmarks", "exits", "doors", "mission"]) {
    if (map[field] !== undefined && !Array.isArray(map[field]))
      throw new TypeError(`${field} must be an array.`);
  }
  if (
    map.collisionRadius !== undefined &&
    (!Number.isFinite(map.collisionRadius) ||
      map.collisionRadius < 0 ||
      map.collisionRadius >= 0.5)
  )
    throw new RangeError("collisionRadius must be in [0, 0.5).");
  for (const entity of map.entities ?? []) {
    if (
      ![entity.x, entity.y, entity.width, entity.height].every(
        Number.isFinite,
      ) ||
      entity.width <= 0 ||
      entity.height <= 0 ||
      entity.x < 0 ||
      entity.y < 0 ||
      entity.x + entity.width > map.width + EPSILON ||
      entity.y + entity.height > map.height + EPSILON
    )
      throw new RangeError(
        `Invalid entity footprint: ${entity.id ?? "unnamed"}.`,
      );
  }
}

function pathIsSafe(map, path) {
  return (
    path.length > 0 &&
    path.every(
      (point, index) =>
        canOccupy(map, point.x + 0.5, point.y + 0.5) &&
        (index === 0 ||
          (Math.abs(point.x - path[index - 1].x) +
            Math.abs(point.y - path[index - 1].y) ===
            1 &&
            canTraverse(map, center(path[index - 1]), center(point)))),
    )
  );
}

function symmetryReport(map) {
  const mode = map.generation?.symmetry ?? "none";
  if (mode === "none") return { mode, passed: true };
  if (!["bilateral", "quadrilateral", "mirror-xy", "dihedral-4"].includes(mode))
    return { mode, passed: false };
  if (mode === "dihedral-4" && map.width !== map.height)
    return { mode, passed: false };
  const operations = [
    {
      point: (x, y) => [map.width - 1 - x, y],
      box: (entity) => ({ ...entity, x: map.width - entity.x - entity.width }),
    },
  ];
  if (mode !== "bilateral")
    operations.push({
      point: (x, y) => [x, map.height - 1 - y],
      box: (entity) => ({
        ...entity,
        y: map.height - entity.y - entity.height,
      }),
    });
  if (mode === "dihedral-4")
    operations.push({
      point: (x, y) => [y, x],
      box: (entity) => ({
        ...entity,
        x: entity.y,
        y: entity.x,
        width: entity.height,
        height: entity.width,
      }),
    });
  const key = (entity) =>
    [
      entity.type,
      ...[entity.x, entity.y, entity.width, entity.height].map((value) =>
        Math.round(value * 1e6),
      ),
    ].join(":");
  const footprints = new Map();
  for (const entity of map.entities ?? [])
    if (entity.solid)
      footprints.set(key(entity), (footprints.get(key(entity)) ?? 0) + 1);
  const ports = new Set(
    (map.exits ?? map.doors ?? []).map((port) => `${port?.x}:${port?.y}`),
  );
  for (const operation of operations) {
    for (let y = 0; y < map.height; y += 1)
      for (let x = 0; x < map.width; x += 1) {
        const [tx, ty] = operation.point(x, y);
        if (
          map.tiles[y][x] !== map.tiles[ty][tx] ||
          Boolean(map.roadMask?.[y]?.[x]) !== Boolean(map.roadMask?.[ty]?.[tx])
        )
          return { mode, passed: false };
      }
    const transformed = new Map();
    for (const entity of map.entities ?? [])
      if (entity.solid) {
        const transformedKey = key(operation.box(entity));
        transformed.set(
          transformedKey,
          (transformed.get(transformedKey) ?? 0) + 1,
        );
      }
    if (
      [...footprints].some(
        ([footprint, count]) => transformed.get(footprint) !== count,
      )
    )
      return { mode, passed: false };
    for (const port of map.exits ?? map.doors ?? []) {
      if (!port || !ports.has(operation.point(port.x, port.y).join(":")))
        return { mode, passed: false };
    }
  }
  return { mode, passed: true };
}

export function validateMap(map) {
  assertGeometry(map);
  const issues = [];
  const graph = navigationGraph(map);
  const reached = flood(graph, map.spawn);
  const visited = new Set();
  const components = [];
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      if (graph.cells[y][x] && !visited.has(y * map.width + x))
        components.push(flood(graph, { x, y }, visited).length);
    }
  const walkableCount = graph.cells.reduce(
    (sum, row) => sum + row.filter(Boolean).length,
    0,
  );
  let mismatchedCells = 0;
  let blockedRoadCells = 0;
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      if (map.walkable?.[y]?.[x] !== graph.physicalCells[y][x])
        mismatchedCells += 1;
      if (map.roadMask?.[y]?.[x] && !graph.cells[y][x]) blockedRoadCells += 1;
    }
  const requiredPaths = [];
  const resultFor = (value) => {
    const point = value ?? {};
    if (
      typeof point.id !== "string" ||
      !point.id.length ||
      !Number.isInteger(point.x) ||
      !Number.isInteger(point.y)
    )
      issues.push(
        "Required nodes need a nonempty id and integer tile coordinates.",
      );
    const path = findPath(map, map.spawn, point);
    requiredPaths.push(path);
    return {
      id: point.id,
      label: point.label ?? point.id,
      reachable: path.length > 0,
      pathLength: Math.max(0, path.length - 1),
      clearancePassed: pathIsSafe(map, path),
    };
  };
  const landmarkResults = (map.landmarks ?? []).map(resultFor);
  const exitResults = (map.exits ?? map.doors ?? []).map(resultFor);
  const allLandmarksReachable = landmarkResults.every(
    (result) => result.reachable,
  );
  const allExitsReachable = exitResults.every((result) => result.reachable);
  const ports = map.exits ?? map.doors ?? [];
  const portIds = new Set();
  const portPositions = new Set();
  for (const port of ports) {
    if (!port) {
      issues.push("Invalid exit node.");
      continue;
    }
    if (portIds.has(port.id)) issues.push(`Duplicate exit id: ${port.id}.`);
    portIds.add(port.id);
    const position = `${port.x}:${port.y}`;
    if (portPositions.has(position))
      issues.push(`Duplicate exit position: ${position}.`);
    portPositions.add(position);
    const onBoundary = {
      north: port.y === 0,
      south: port.y === map.height - 1,
      west: port.x === 0,
      east: port.x === map.width - 1,
    }[port.side];
    if (!onBoundary)
      issues.push(`Exit ${port.id} is not on its declared boundary.`);
  }
  if (
    map.kind === "town" &&
    (ports.length !== 4 ||
      ["north", "east", "south", "west"].some(
        (side) => ports.filter((port) => port?.side === side).length !== 1,
      ))
  )
    issues.push("A town requires exactly one exit on each cardinal side.");
  if (
    map.kind === "interior" ||
    (map.kind === "town" && map.generation?.perimeterWalls)
  ) {
    let boundaryPassed = true;
    const boundary = [
      ["north", map.width, (offset) => [offset, 0]],
      ["south", map.width, (offset) => [offset, map.height - 1]],
      ["west", map.height, (offset) => [0, offset]],
      ["east", map.height, (offset) => [map.width - 1, offset]],
    ];
    for (const [side, length, point] of boundary)
      for (let offset = 0; offset < length; offset += 1) {
        const [x, y] = point(offset);
        const expected = ports.some((port) => {
          if (port?.side !== side) return false;
          const coordinate =
            side === "north" || side === "south" ? port.x : port.y;
          const width =
            port.width ??
            map.generation?.roadWidth ??
            map.generation?.corridorWidth ??
            3;
          return Math.abs(coordinate - offset) <= Math.floor(width / 2);
        });
        if (graph.physicalCells[y][x] !== expected) boundaryPassed = false;
      }
    if (!boundaryPassed)
      issues.push(
        "Boundary openings must match the declared portals and their widths.",
      );
  }
  if (
    !map.spawn ||
    !Number.isInteger(map.spawn.x) ||
    !Number.isInteger(map.spawn.y) ||
    !graph.cells[map.spawn.y]?.[map.spawn.x]
  )
    issues.push("The spawn tile is blocked or invalid.");
  if (!allLandmarksReachable)
    issues.push("Some landmarks are unreachable from spawn.");
  if (!allExitsReachable) issues.push("Some exits are unreachable from spawn.");
  if (components.length !== 1)
    issues.push(`Expected one walkable component; found ${components.length}.`);
  if (reached.length !== walkableCount)
    issues.push("Walkable pockets are disconnected from spawn.");
  if (mismatchedCells)
    issues.push(
      `${mismatchedCells} navigation cells disagree with physical collision.`,
    );
  if (blockedRoadCells)
    issues.push(`${blockedRoadCells} reserved road cells are blocked.`);
  let previous = map.spawn;
  let missionLength = 0;
  let missionPassed = true;
  for (const id of map.mission ?? []) {
    const point = (map.landmarks ?? []).find((landmark) => landmark.id === id);
    const path = point ? findPath(map, previous, point) : [];
    requiredPaths.push(path);
    if (!pathIsSafe(map, path)) {
      missionPassed = false;
      issues.push(`Mission segment to ${id} is not safely traversable.`);
    } else {
      missionLength += path.length - 1;
      previous = point;
    }
  }
  const clearancePassed =
    missionPassed &&
    [...landmarkResults, ...exitResults].every(
      (result) => result.clearancePassed,
    );
  if (!clearancePassed)
    issues.push("A required route fails character clearance.");
  const symmetry = symmetryReport(map);
  if (!symmetry.passed)
    issues.push(
      `The map violates its ${symmetry.mode} structural symmetry constraint.`,
    );
  const obstacles = (map.entities ?? []).filter((entity) => entity.solid);
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      if (solidTile(map, map.tiles[y][x]))
        obstacles.push({ x, y, width: 1, height: 1 });
    }
  const sampled = new Set();
  let minimumRouteClearance = Infinity;
  for (const path of requiredPaths)
    for (const point of path) {
      const key = point.y * map.width + point.x;
      if (sampled.has(key)) continue;
      sampled.add(key);
      const { x, y } = center(point);
      let clearance = Math.min(x, y, map.width - x, map.height - y);
      for (const obstacle of obstacles)
        clearance = Math.min(clearance, rectangleDistance(x, y, obstacle));
      minimumRouteClearance = Math.min(minimumRouteClearance, clearance);
    }
  return {
    reachableCount: reached.length,
    walkableCount,
    reachablePercent: walkableCount
      ? Math.round((reached.length / walkableCount) * 10000) / 100
      : 0,
    components: components.length,
    componentCount: components.length,
    componentSizes: components.sort((a, b) => b - a),
    allLandmarksReachable,
    allExitsReachable,
    landmarkResults,
    exitResults,
    maxRectangle: maximalRectangle(graph.cells),
    missionLength,
    mismatchedCells,
    blockedRoadCells,
    clearance: {
      characterRadius: map.collisionRadius ?? CHARACTER_RADIUS,
      minRoadWidth:
        map.generation?.roadWidth ?? map.generation?.corridorWidth ?? 3,
      minimumRouteClearance: Number.isFinite(minimumRouteClearance)
        ? Number(minimumRouteClearance.toFixed(3))
        : 0,
      passed: clearancePassed,
    },
    symmetry,
    passed: issues.length === 0,
    issues,
  };
}
