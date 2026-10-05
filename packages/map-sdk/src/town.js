import {
  TILE,
  CHARACTER_RADIUS,
  seededRandom,
  makeGrid,
  rebuildNavigation,
  validateMap,
} from "./core.js";

const BUILDING_TYPES = ["cottage", "lodge", "workshop"];
const ROOFS = ["terracotta", "sage", "ochre", "blue", "rose"];

function dimension(value, name) {
  if (!Number.isInteger(value) || value < 25 || value > 129) {
    throw new RangeError(`${name} must be an integer from 25 to 129.`);
  }
  return value;
}

function overlap(a, b, margin = 0) {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  );
}

function transforms(width, height, rotated) {
  const reflect = (transpose, flipX, flipY) => ({
    point({ x, y, side }) {
      let px = transpose ? y : x;
      let py = transpose ? x : y;
      let direction = side;
      if (transpose)
        direction = {
          north: "west",
          east: "south",
          south: "east",
          west: "north",
        }[direction];
      if (flipX) {
        px = width - 1 - px;
        direction = {
          east: "west",
          west: "east",
          north: "north",
          south: "south",
        }[direction];
      }
      if (flipY) {
        py = height - 1 - py;
        direction = {
          north: "south",
          south: "north",
          east: "east",
          west: "west",
        }[direction];
      }
      return side ? { x: px, y: py, side: direction } : { x: px, y: py };
    },
    box(box) {
      const w = transpose ? box.height : box.width;
      const h = transpose ? box.width : box.height;
      const x = transpose ? box.y : box.x;
      const y = transpose ? box.x : box.y;
      return {
        x: flipX ? width - x - w : x,
        y: flipY ? height - y - h : y,
        width: w,
        height: h,
      };
    },
  });
  const operations = [];
  for (const transpose of rotated ? [false, true] : [false]) {
    for (const flipX of [false, true]) {
      for (const flipY of [false, true])
        operations.push(reflect(transpose, flipX, flipY));
    }
  }
  return operations;
}

function buildingOrbit(box, door, operations) {
  const instances = new Map();
  for (const operation of operations) {
    const footprint = operation.box(box);
    const key = `${footprint.x},${footprint.y},${footprint.width},${footprint.height}`;
    const transformedDoor = operation.point(door);
    if (!instances.has(key)) instances.set(key, { ...footprint, doors: [] });
    const building = instances.get(key);
    if (
      !building.doors.some(
        (point) =>
          point.x === transformedDoor.x && point.y === transformedDoor.y,
      )
    ) {
      building.doors.push(transformedDoor);
    }
  }
  return [...instances.values()];
}

function driveToAxis(door, targetX, width) {
  const cells = [];
  const half = Math.floor(width / 2);
  for (
    let x = Math.min(door.x, targetX);
    x <= Math.max(door.x, targetX);
    x += 1
  ) {
    for (let y = door.y - half; y <= door.y + half; y += 1)
      cells.push({ x, y });
  }
  return cells;
}

function canPlace(world, buildings, driveway) {
  for (let index = 0; index < buildings.length; index += 1) {
    const box = buildings[index];
    if (
      box.x < 2 ||
      box.y < 2 ||
      box.x + box.width > world.width - 2 ||
      box.y + box.height > world.height - 2
    )
      return false;
    if (world.entities.some((entity) => overlap(box, entity, 1))) return false;
    if (buildings.slice(index + 1).some((other) => overlap(box, other, 1)))
      return false;
    for (let y = box.y - 1; y <= box.y + box.height; y += 1) {
      for (let x = box.x - 1; x <= box.x + box.width; x += 1) {
        if (world.roadMask[y]?.[x]) return false;
      }
    }
  }
  for (const { x, y } of driveway) {
    if (x < 1 || y < 1 || x >= world.width - 1 || y >= world.height - 1)
      return false;
    if (
      [...world.entities, ...buildings].some(
        (box) =>
          x >= box.x &&
          y >= box.y &&
          x < box.x + box.width &&
          y < box.y + box.height,
      )
    )
      return false;
  }
  return true;
}

function paintRoad(world, cells) {
  for (const { x, y } of cells) {
    world.roadMask[y][x] = true;
    world.tiles[y][x] = TILE.PATH;
  }
}

function street(world, coordinate, horizontal, roadWidth) {
  const half = Math.floor(roadWidth / 2);
  const cells = [];
  for (let offset = -half; offset <= half; offset += 1) {
    for (
      let along = 0;
      along < (horizontal ? world.width : world.height);
      along += 1
    ) {
      const x = horizontal ? along : coordinate + offset;
      const y = horizontal ? coordinate + offset : along;
      if (x >= 0 && y >= 0 && x < world.width && y < world.height)
        cells.push({ x, y });
    }
  }
  paintRoad(world, cells);
}

function addBuildings(world, instances, random, orbitIndex) {
  const type = BUILDING_TYPES[Math.floor(random() * BUILDING_TYPES.length)];
  const roof = ROOFS[Math.floor(random() * ROOFS.length)];
  for (const [index, footprint] of instances.entries()) {
    const id = `building-${orbitIndex}-${index}`;
    const entity = {
      ...footprint,
      id,
      type,
      label: `${type} ${world.entities.length + 1}`,
      solid: true,
      sprite: type,
      roof,
      anchor: { x: 0.5, y: 1 },
      visual: {
        offsetX: -0.4,
        offsetY: -2.2,
        width: footprint.width + 0.8,
        height: footprint.height + 2.7,
      },
      door: footprint.doors[0],
      orientation: footprint.doors[0].side,
      interiorTemplate:
        type === "lodge" ? "inn" : type === "workshop" ? "workshop" : "cottage",
    };
    world.entities.push(entity);
    for (const [doorIndex, door] of entity.doors.entries()) {
      world.landmarks.push({
        id: `${id}-door-${doorIndex}`,
        label: `${entity.label} entrance`,
        ...door,
        entityId: id,
        type: "door",
      });
    }
  }
}

function generateSymmetricBuildings(world, count, random, roadWidth) {
  const square = world.width === world.height;
  const operations = transforms(world.width, world.height, square);
  const cx = world.spawn.x;
  const cy = world.spawn.y;
  let attempts = 0;
  let orbitIndex = 0;
  while (
    world.entities.length < count &&
    attempts < Math.max(1200, count * 160)
  ) {
    attempts += 1;
    const remainder = count - world.entities.length;
    const diagonal = square && remainder % 8 === 4;
    const size = random() < 0.7 ? 3 : 5;
    const width = diagonal ? size : 3 + Math.floor(random() * 3);
    const height = diagonal ? size : 3 + Math.floor(random() * 3);
    const roomX = cx - Math.floor(roadWidth / 2) - width - 3;
    const roomY = cy - Math.floor(roadWidth / 2) - height - 3;
    if (roomX < 1 || roomY < 1) continue;
    const x = 2 + Math.floor(random() * roomX);
    const y = diagonal ? x : 2 + Math.floor(random() * roomY);
    const box = { x, y, width, height };
    const door = { x: x + width, y: y + Math.floor(height / 2), side: "east" };
    const instances = buildingOrbit(box, door, operations);
    if (instances.length > remainder || (diagonal && instances.length !== 4))
      continue;
    const baseDriveway = driveToAxis(
      door,
      cx,
      Math.min(roadWidth, height % 2 ? height : height - 1),
    );
    const driveway = operations.flatMap((operation) =>
      baseDriveway.map((cell) => operation.point(cell)),
    );
    if (!canPlace(world, instances, driveway)) continue;
    paintRoad(world, driveway);
    addBuildings(world, instances, random, orbitIndex);
    orbitIndex += 1;
  }
  return attempts;
}

function generateGridBuildings(world, count, random, roadWidth) {
  const cx = world.spawn.x;
  const identity = transforms(world.width, world.height, false)[0];
  let attempts = 0;
  while (
    world.entities.length < count &&
    attempts < Math.max(1200, count * 160)
  ) {
    attempts += 1;
    const width = 3 + Math.floor(random() * 3);
    const height = 3 + Math.floor(random() * 3);
    const x = 2 + Math.floor(random() * (world.width - width - 4));
    const y = 2 + Math.floor(random() * (world.height - height - 4));
    const east = x + width / 2 < cx;
    const door = {
      x: east ? x + width : x - 1,
      y: y + Math.floor(height / 2),
      side: east ? "east" : "west",
    };
    const step = east ? 1 : -1;
    let targetX = door.x;
    while (
      targetX > 0 &&
      targetX < world.width - 1 &&
      !world.roadMask[door.y][targetX]
    )
      targetX += step;
    if (targetX <= 0 || targetX >= world.width - 1) continue;
    const driveway = driveToAxis(
      door,
      targetX,
      Math.min(roadWidth, height % 2 ? height : height - 1),
    );
    const instances = buildingOrbit({ x, y, width, height }, door, [identity]);
    if (!canPlace(world, instances, driveway)) continue;
    paintRoad(world, driveway);
    addBuildings(world, instances, random, world.entities.length);
  }
  return attempts;
}

/** Reserve the street network before placing complete geometric building orbits. */
export function generateTown(options = {}) {
  const layout = options.layout ?? "symmetric";
  if (!["symmetric", "grid"].includes(layout))
    throw new RangeError('Town layout must be "symmetric" or "grid".');
  const width = dimension(options.width ?? 49, "width");
  const height = dimension(options.height ?? 49, "height");
  if (layout === "symmetric" && (width % 2 === 0 || height % 2 === 0)) {
    throw new RangeError(
      "Symmetric towns require odd width and height so the four exits share exact center axes.",
    );
  }
  const roadWidth = options.roadWidth ?? 3;
  if (
    !Number.isInteger(roadWidth) ||
    roadWidth < 3 ||
    roadWidth > 7 ||
    roadWidth % 2 === 0
  ) {
    throw new RangeError("roadWidth must be an odd integer: 3, 5, or 7.");
  }
  const explicitCount = options.buildingCount !== undefined;
  const defaultCount = Math.max(
    4,
    Math.floor((width * height) / (roadWidth > 3 ? 220 : 150) / 4) * 4,
  );
  const count = options.buildingCount ?? Math.min(64, defaultCount);
  if (!Number.isInteger(count) || count < 0 || count > 256) {
    throw new RangeError("buildingCount must be an integer from 0 to 256.");
  }
  if (layout === "symmetric" && count % 4 !== 0) {
    throw new RangeError(
      "Symmetric buildingCount must be a multiple of 4; use grid layout for arbitrary counts.",
    );
  }
  if (
    options.perimeterWalls !== undefined &&
    typeof options.perimeterWalls !== "boolean"
  ) {
    throw new TypeError("perimeterWalls must be a boolean.");
  }
  const seed = options.seed ?? "town-1";
  const random = seededRandom(seed);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const world = {
    schemaVersion: "1.0",
    kind: "town",
    id: `town-${String(seed)}`,
    name: layout === "symmetric" ? "Four Gates Town" : "Crossroads Town",
    seed,
    width,
    height,
    tiles: makeGrid(width, height, TILE.GRASS),
    roadMask: makeGrid(width, height, false),
    walkable: [],
    entities: [],
    buildings: [],
    landmarks: [],
    mission: [],
    collisionRadius: CHARACTER_RADIUS,
    spawn: { x: cx, y: cy },
    exits: [
      { id: "north", label: "North Gate", x: cx, y: 0, side: "north" },
      { id: "east", label: "East Gate", x: width - 1, y: cy, side: "east" },
      { id: "south", label: "South Gate", x: cx, y: height - 1, side: "south" },
      { id: "west", label: "West Gate", x: 0, y: cy, side: "west" },
    ],
    regions: [],
    generation: {
      layout,
      seed,
      algorithm: "route-first-lots",
      requestedBuildingCount: explicitCount ? count : null,
      roadWidth,
      perimeterWalls: options.perimeterWalls ?? false,
    },
  };
  street(world, cx, false, roadWidth);
  street(world, cy, true, roadWidth);
  if (layout === "grid") {
    const spacing = roadWidth + 9;
    for (
      let offset = spacing;
      offset < Math.max(width, height);
      offset += spacing
    ) {
      for (const axis of [cx - offset, cx + offset])
        if (axis >= 4 && axis < width - 4)
          street(world, axis, false, roadWidth);
      for (const axis of [cy - offset, cy + offset])
        if (axis >= 4 && axis < height - 4)
          street(world, axis, true, roadWidth);
    }
  }
  const plazaSize = Math.max(
    roadWidth + 2,
    Math.min(9, Math.floor(Math.min(width, height) / 7) * 2 + 1),
  );
  const halfPlaza = Math.floor(plazaSize / 2);
  const plaza = {
    id: "central-plaza",
    label: "Central Plaza",
    type: "plaza",
    x: cx - halfPlaza,
    y: cy - halfPlaza,
    width: plazaSize,
    height: plazaSize,
  };
  world.regions.push(plaza);
  const plazaCells = [];
  for (let y = plaza.y; y < plaza.y + plaza.height; y += 1) {
    for (let x = plaza.x; x < plaza.x + plaza.width; x += 1)
      plazaCells.push({ x, y });
  }
  paintRoad(world, plazaCells);
  for (const [id, x, y, districtWidth, districtHeight] of [
    ["northwest", 1, 1, cx - 1, cy - 1],
    ["northeast", cx + 1, 1, width - cx - 2, cy - 1],
    ["southwest", 1, cy + 1, cx - 1, height - cy - 2],
    ["southeast", cx + 1, cy + 1, width - cx - 2, height - cy - 2],
  ])
    world.regions.push({
      id,
      label: `${id} district`,
      type: "district",
      x,
      y,
      width: districtWidth,
      height: districtHeight,
    });
  if (options.perimeterWalls) {
    const halfRoad = Math.floor(roadWidth / 2);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
        const gate =
          ((y === 0 || y === height - 1) && Math.abs(x - cx) <= halfRoad) ||
          ((x === 0 || x === width - 1) && Math.abs(y - cy) <= halfRoad);
        world.tiles[y][x] = gate ? TILE.PATH : TILE.WALL;
        world.roadMask[y][x] = gate;
      }
    }
  }
  const attempts =
    layout === "symmetric"
      ? generateSymmetricBuildings(world, count, random, roadWidth)
      : generateGridBuildings(world, count, random, roadWidth);
  if (explicitCount && world.entities.length !== count) {
    throw new RangeError(
      `Could place ${world.entities.length} of ${count} buildings while preserving roads and clearance. Reduce buildingCount or roadWidth, or increase map dimensions.`,
    );
  }
  world.buildings = world.entities;
  world.generation.actualBuildingCount = world.buildings.length;
  world.generation.placementAttempts = attempts;
  world.generation.symmetry =
    layout === "symmetric"
      ? width === height
        ? "dihedral-4"
        : "mirror-xy"
      : "none";
  world.generation.stages = [
    "blockout",
    "reserved-streets",
    "building-lots",
    "navigation-validation",
  ];
  rebuildNavigation(world);
  world.report = validateMap(world);
  world.validation = world.report;
  if (!world.report.passed)
    throw new Error(
      `Town navigation validation failed: ${world.report.issues.join("; ")}`,
    );
  return world;
}
