import {
  TILE,
  CHARACTER_RADIUS,
  seededRandom,
  makeGrid,
  rectangleDistance,
  maximalRectangle,
  canOccupy,
  rebuildNavigation,
  reachableCells,
  validateMap,
} from "./core.js";

const WIDTH = 48;
const HEIGHT = 36;

export function generateWorld(seed = 42, options = {}) {
  const random = seededRandom(seed);
  const buildingRandom = seededRandom(`${seed}:building-lots`);
  const requestedDensity = Number(options.density ?? 0.55);
  const density = Number.isFinite(requestedDensity)
    ? Math.max(0, Math.min(1, requestedDensity))
    : 0.55;
  const world = {
    seed,
    width: WIDTH,
    height: HEIGHT,
    tiles: makeGrid(WIDTH, HEIGHT, TILE.GRASS),
    roadMask: makeGrid(WIDTH, HEIGHT, false),
    walkable: [],
    entities: [],
    collisionRadius: CHARACTER_RADIUS,
    spawn: { x: 23, y: 31 },
    landmarks: [
      { id: "elder", label: "Village elder", x: 14, y: 12, kind: "talk" },
      { id: "well", label: "Village well", x: 20, y: 18, kind: "inspect" },
      { id: "workshop", label: "Artisan workshop", x: 10, y: 17, kind: "talk" },
      { id: "bridge", label: "Willow bridge", x: 38, y: 22, kind: "cross" },
      { id: "meadow", label: "East meadow", x: 42, y: 27, kind: "explore" },
    ],
    mission: ["elder", "well", "workshop", "bridge", "meadow"],
    regions: [
      { id: "farm", type: "field", x: 6, y: 24, width: 7, height: 7 },
      { id: "square", type: "plaza", x: 20, y: 15, width: 8, height: 7 },
      { id: "meadow", type: "meadow", x: 39, y: 25, width: 7, height: 7 },
      { id: "western-woods", type: "woods", x: 0, y: 0, width: 5, height: 36 },
    ],
    generation: {
      density,
      algorithm: "seeded-lot-blockout-v2",
      removedObstacles: 0,
      buildingPlacement: {
        method: "seeded-road-aware-candidate-packing",
        footprintBuffer: 1,
        lots: [],
      },
    },
  };

  for (let y = 0; y < HEIGHT; y += 1) {
    const riverLeft = y < 8 ? 34 : y < 17 ? 35 : y < 28 ? 34 : 33;
    for (let x = riverLeft; x < riverLeft + 3; x += 1)
      world.tiles[y][x] = TILE.WATER;
  }

  function road(x, y, width, height, bridge = false) {
    for (let ty = y; ty < y + height; ty += 1) {
      for (let tx = x; tx < x + width; tx += 1) {
        if (world.tiles[ty][tx] === TILE.WATER && !bridge) continue;
        world.tiles[ty][tx] =
          world.tiles[ty][tx] === TILE.WATER ? TILE.BRIDGE : TILE.PATH;
        world.roadMask[ty][tx] = true;
      }
    }
  }

  road(22, 5, 3, 29);
  road(20, 16, 8, 6);
  road(6, 17, 27, 3);
  road(13, 11, 12, 3);
  road(23, 10, 8, 3);
  road(21, 21, 22, 3, true);
  road(40, 22, 3, 8);
  road(15, 25, 3, 4);
  road(11, 27, 13, 3);

  function building(id, type, x, y, width, height, label, roof) {
    world.entities.push({
      id,
      type,
      x,
      y,
      width,
      height,
      label,
      roof,
      solid: true,
      sprite: type,
      anchor: { x: 0.5, y: 1 },
      visual: {
        offsetX: -0.4,
        offsetY: -2.2,
        width: width + 0.8,
        height: height + 2.7,
      },
      door: { x: x + Math.floor(width / 2), y: y + height },
    });
  }

  const lots = [
    {
      id: "elder-home",
      type: "cottage",
      x: 11,
      y: 6,
      width: 9,
      height: 5,
      preferredX: 12,
      preferredY: 7,
      widths: [4, 5, 6],
      heights: [3, 4],
      frontageY: 13,
      label: "Elder cottage",
      roof: "terracotta",
      landmark: "elder",
    },
    {
      id: "guest-lodge",
      type: "lodge",
      x: 25,
      y: 5,
      width: 8,
      height: 5,
      preferredX: 25,
      preferredY: 6,
      widths: [5, 6],
      heights: [3, 4],
      frontageY: 12,
      label: "Wayfarer lodge",
      roof: "sage",
    },
    {
      id: "artisan-house",
      type: "workshop",
      x: 6,
      y: 12,
      width: 7,
      height: 5,
      preferredX: 7,
      preferredY: 12,
      widths: [5, 6],
      heights: [3, 4],
      frontageY: 19,
      label: "Artisan workshop",
      roof: "ochre",
      landmark: "workshop",
    },
    {
      id: "east-home",
      type: "cottage",
      x: 25,
      y: 13,
      width: 8,
      height: 4,
      preferredX: 26,
      preferredY: 13,
      widths: [4, 5],
      heights: [3],
      frontageY: 19,
      label: "Bluebell cottage",
      roof: "blue",
    },
    {
      id: "farm-home",
      type: "cottage",
      x: 14,
      y: 21,
      width: 6,
      height: 4,
      preferredX: 14,
      preferredY: 21,
      widths: [4, 5],
      heights: [3, 4],
      frontageY: 29,
      label: "Orchard cottage",
      roof: "rose",
    },
  ];
  for (const lot of lots) {
    const available = Array.from({ length: lot.height }, (_, y) =>
      Array.from(
        { length: lot.width },
        (_, x) =>
          world.tiles[lot.y + y][lot.x + x] === TILE.GRASS &&
          !world.entities.some(
            (entity) =>
              entity.solid &&
              rectangleDistance(lot.x + x + 0.5, lot.y + y + 0.5, entity) < 1.5,
          ),
      ),
    );
    const freeRectangle = maximalRectangle(available);
    const candidates = [];
    for (const width of lot.widths)
      for (const height of lot.heights) {
        if (width * height > freeRectangle.area) continue;
        for (let y = 0; y <= lot.height - height; y += 1)
          for (let x = 0; x <= lot.width - width; x += 1) {
            let fits = true;
            for (let row = y; row < y + height; row += 1) {
              for (let column = x; column < x + width; column += 1)
                fits &&= available[row][column];
            }
            if (!fits) continue;
            const candidate = { x: lot.x + x, y: lot.y + y, width, height };
            if (
              Math.abs(candidate.x - lot.preferredX) > 1 ||
              Math.abs(candidate.y - lot.preferredY) > 1
            )
              continue;
            const doorX = candidate.x + Math.floor(width / 2);
            const bottom = candidate.y + height;
            // Every selected footprint must have a three-cell approach to its reserved street.
            for (let row = bottom; row <= lot.frontageY; row += 1) {
              for (let column = doorX - 1; column <= doorX + 1; column += 1) {
                if (
                  world.tiles[row][column] === TILE.WATER ||
                  world.entities.some(
                    (entity) =>
                      entity.solid &&
                      rectangleDistance(column + 0.5, row + 0.5, entity) <
                        CHARACTER_RADIUS,
                  )
                )
                  fits = false;
              }
            }
            if (fits) candidates.push(candidate);
          }
      }
    if (!candidates.length)
      throw new Error(`No safe building footprint available in ${lot.id}.`);
    const selected =
      candidates[Math.floor(buildingRandom() * candidates.length)];
    building(
      lot.id,
      lot.type,
      selected.x,
      selected.y,
      selected.width,
      selected.height,
      lot.label,
      lot.roof,
    );
    const house = world.entities.at(-1);
    const frontage = {
      x: house.door.x - 1,
      y: house.door.y,
      width: 3,
      height: lot.frontageY - house.door.y + 1,
    };
    road(frontage.x, frontage.y, frontage.width, frontage.height);
    if (lot.landmark)
      Object.assign(
        world.landmarks.find((landmark) => landmark.id === lot.landmark),
        {
          x: house.door.x,
          y: house.door.y + 1,
        },
      );
    world.generation.buildingPlacement.lots.push({
      id: lot.id,
      bounds: { x: lot.x, y: lot.y, width: lot.width, height: lot.height },
      maxFreeRectangle: {
        ...freeRectangle,
        x: lot.x + freeRectangle.x,
        y: lot.y + freeRectangle.y,
      },
      candidateCount: candidates.length,
      selected: { ...selected },
      frontage,
    });
  }

  world.entities.push({
    id: "village-well",
    type: "well",
    x: 20.2,
    y: 15.2,
    width: 1.6,
    height: 1.6,
    label: "Village well",
    solid: true,
    sprite: "well",
    anchor: { x: 0.5, y: 1 },
    visual: { offsetX: -0.3, offsetY: -1.5, width: 2.2, height: 3.3 },
  });
  // The square is a destination space, not an uninterrupted road corridor.
  for (let y = 15; y <= 16; y += 1) {
    for (let x = 20; x <= 21; x += 1) world.roadMask[y][x] = false;
  }

  const farm = world.regions.find((region) => region.id === "farm");
  for (const [edge, y] of [
    ["north", farm.y - 0.25],
    ["south", farm.y + farm.height - 0.25],
  ]) {
    let start = null;
    // The radius-expanded rail blocks the north grid row as well as continuous movement.
    for (let x = farm.x; x <= farm.x + farm.width; x += 1) {
      const reserved =
        x === farm.x + farm.width ||
        [Math.floor(y), Math.floor(y + 0.2)].some(
          (row) =>
            world.roadMask[row]?.[x] || world.tiles[row]?.[x] !== TILE.GRASS,
        );
      if (!reserved && start === null) start = x;
      if (reserved && start !== null) {
        world.entities.push({
          id: `farm-fence-${edge}-${start}`,
          type: "fence",
          x: start,
          y,
          width: x - start,
          height: 0.2,
          label: "Farm fence",
          solid: true,
          visual: { offsetX: 0, offsetY: -0.7, width: x - start, height: 0.9 },
        });
        start = null;
      }
    }
  }

  const protectedPoints = [world.spawn, ...world.landmarks];
  function decorationAllowed(x, y, margin = 1) {
    for (
      let ty = Math.max(0, y - margin);
      ty <= Math.min(HEIGHT - 1, y + margin);
      ty += 1
    ) {
      for (
        let tx = Math.max(0, x - margin);
        tx <= Math.min(WIDTH - 1, x + margin);
        tx += 1
      ) {
        if (world.roadMask[ty][tx] || world.tiles[ty][tx] !== TILE.GRASS)
          return false;
      }
    }
    if (
      protectedPoints.some((point) => Math.hypot(point.x - x, point.y - y) < 3)
    )
      return false;
    if (
      world.entities.some(
        (entity) =>
          entity.solid && rectangleDistance(x + 0.5, y + 0.5, entity) < 1.5,
      )
    )
      return false;
    return !world.regions.some(
      (region) =>
        region.type === "field" &&
        x >= region.x - 1 &&
        x < region.x + region.width + 1 &&
        y >= region.y - 1 &&
        y < region.y + region.height + 1,
    );
  }

  for (const [x, y] of [
    [18, 16],
    [28, 20],
    [31, 20],
    [39, 25],
    [26, 30],
  ]) {
    if (!decorationAllowed(x, y, 0)) continue;
    world.entities.push({
      id: `lantern-${x}-${y}`,
      type: "lantern",
      sprite: "lantern",
      x: x + 0.35,
      y: y + 0.35,
      width: 0.3,
      height: 0.3,
      solid: true,
      label: "Village lantern",
      visual: { offsetX: -0.3, offsetY: -2.3, width: 0.9, height: 2.6 },
    });
  }
  for (const [type, x, y, width, height, visual] of [
    [
      "noticeboard",
      30,
      25,
      0.8,
      0.5,
      { offsetX: -0.5, offsetY: -1.8, width: 1.8, height: 2.3 },
    ],
    [
      "signpost",
      39,
      19,
      0.3,
      0.4,
      { offsetX: -0.4, offsetY: -1.6, width: 1.1, height: 2 },
    ],
  ]) {
    if (!decorationAllowed(x, y, 0)) continue;
    world.entities.push({
      id: `${type}-${x}-${y}`,
      type,
      sprite: type,
      x: x + (1 - width) / 2,
      y: y + (1 - height) / 2,
      width,
      height,
      solid: true,
      label: type === "noticeboard" ? "Village notices" : "Meadow sign",
      visual,
    });
  }
  const elder = world.landmarks.find((landmark) => landmark.id === "elder");
  world.entities.push({
    id: "village-elder",
    type: "elder",
    sprite: "elder",
    x: elder.x + 0.2,
    y: elder.y + 0.35,
    width: 0.6,
    height: 0.4,
    solid: false,
    label: "Village elder",
    visual: { offsetX: -0.25, offsetY: -1.4, width: 1.1, height: 1.8 },
  });
  for (const house of world.entities.filter((entity) =>
    ["cottage", "lodge", "workshop"].includes(entity.type),
  )) {
    const x = house.x - 1;
    const y = house.y + house.height - 1;
    if (world.tiles[y][x] !== TILE.GRASS) continue;
    world.entities.push({
      id: `flowers-${house.id}`,
      type: "flowerbed",
      sprite: "flowerbed",
      x,
      y,
      width: 1,
      height: 1,
      solid: false,
      label: "Garden flowers",
      visual: { offsetX: -0.15, offsetY: -0.3, width: 1.3, height: 1.3 },
    });
  }

  for (let y = 1; y < HEIGHT - 1; y += 3) {
    for (let x = 1; x < WIDTH - 1; x += 3) {
      const edge = x < 6 || x > 42 || y < 5 || y > 30;
      const chance = edge ? 0.45 + density * 0.55 : density * 0.42;
      if (random() > chance || !decorationAllowed(x, y)) continue;
      world.entities.push({
        id: `tree-${x}-${y}`,
        type: "tree",
        x: x + 0.16,
        y: y + 0.2,
        width: 0.68,
        height: 0.65,
        label: "Willow",
        solid: true,
        sprite: "tree",
        variant: Math.floor(random() * 3),
        anchor: { x: 0.5, y: 1 },
        visual: { offsetX: -1.16, offsetY: -3.2, width: 3, height: 4 },
      });
    }
  }

  for (const [x, y] of [
    [5, 11],
    [31, 7],
    [30, 27],
    [38, 14],
    [44, 19],
    [20, 32],
  ]) {
    if (!decorationAllowed(x, y, 0)) continue;
    world.entities.push({
      id: `rock-${x}-${y}`,
      type: "rock",
      x: x + 0.1,
      y: y + 0.2,
      width: 0.8,
      height: 0.65,
      label: "River stone",
      solid: true,
      sprite: "rock",
      visual: { offsetX: -0.15, offsetY: -0.45, width: 1.1, height: 1.2 },
    });
  }
  for (const [x, y] of [
    [5, 14],
    [28, 4],
    [19, 23],
  ]) {
    if (!decorationAllowed(x, y, 0)) continue;
    world.entities.push({
      id: `crate-${x}-${y}`,
      type: "crate",
      x: x + 0.15,
      y: y + 0.15,
      width: 0.7,
      height: 0.7,
      label: "Supplies",
      solid: true,
      sprite: "crate",
      visual: { offsetX: -0.1, offsetY: -0.3, width: 0.9, height: 1.1 },
    });
  }
  for (const [x, y] of [
    [18, 9],
    [20, 14],
    [29, 20],
    [12, 21],
    [43, 26],
    [41, 30],
    [37, 25],
    [19, 30],
  ]) {
    if (!canOccupy(world, x + 0.5, y + 0.5)) continue;
    world.entities.push({
      id: `flower-${x}-${y}`,
      type: "flower",
      x,
      y,
      width: 1,
      height: 1,
      label: "Wildflowers",
      solid: false,
      sprite: "flower",
      variant: Math.floor(random() * 3),
      visual: { offsetX: 0, offsetY: -0.25, width: 1, height: 1.25 },
    });
  }

  world.walkable = rebuildNavigation(world).walkable;
  // Repair decorative pockets, never landmarks/buildings or the authored road network.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const reached = new Set(
      reachableCells(world, world.spawn).map((cell) => cell.y * WIDTH + cell.x),
    );
    const unreachable = [];
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        if (world.walkable[y][x] && !reached.has(y * WIDTH + x))
          unreachable.push({ x, y });
      }
    }
    if (!unreachable.length) break;
    const previousCount = world.entities.length;
    world.entities = world.entities.filter(
      (entity) =>
        ![
          "tree",
          "rock",
          "crate",
          "lantern",
          "noticeboard",
          "signpost",
        ].includes(entity.type) ||
        !unreachable.some(
          (point) =>
            rectangleDistance(point.x + 0.5, point.y + 0.5, entity) < 1.5,
        ),
    );
    world.generation.removedObstacles += previousCount - world.entities.length;
    if (previousCount === world.entities.length) break;
    world.walkable = rebuildNavigation(world).walkable;
  }
  world.generation.treeCount = world.entities.filter(
    (entity) => entity.type === "tree",
  ).length;
  world.report = validateMap(world);
  return world;
}
