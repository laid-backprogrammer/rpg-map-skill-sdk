import { generateWorld } from "./village.js";
import { generateTown as generateStructuredTown } from "./town.js";
import { generateInterior as generateRooms } from "./interior.js";
import { createArtPlan } from "./art.js";
import {
  TILE,
  rebuildNavigation,
  validateMap,
  findPath,
  canOccupy,
  rectangleDistance,
} from "./core.js";

export {
  TILE,
  CHARACTER_RADIUS,
  findPath,
  findPathFromPosition,
  canOccupy,
  canTraverse,
  isWalkable,
  maximalRectangle,
  rebuildNavigation,
  validateMap,
} from "./core.js";
export { createArtPlan };
export const SDK_VERSION = "0.3.0";

export class MapValidationError extends Error {
  constructor(report) {
    super(`Map validation failed: ${report.issues.join(" ")}`);
    this.name = "MapValidationError";
    this.report = report;
  }
}

function optionsObject(options) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Generator options must be an object.");
  if (
    options.seed !== undefined &&
    ((typeof options.seed !== "string" && typeof options.seed !== "number") ||
      (typeof options.seed === "number" && !Number.isFinite(options.seed)))
  )
    throw new TypeError("seed must be a string or finite number.");
  return options;
}

export function assertValidMap(map) {
  const report = validateMap(map);
  if (!report.passed) throw new MapValidationError(report);
  map.report = report;
  return map;
}

function finish(map) {
  map.schemaVersion = "1.0";
  map.generation.sdkVersion = SDK_VERSION;
  map.id ??= `${map.kind}:${map.generation.layout ?? map.generation.template}:${map.width}x${map.height}:${map.seed}`;
  return assertValidMap(map);
}

function organicTown(options) {
  if (
    (options.width !== undefined && options.width !== 48) ||
    (options.height !== undefined && options.height !== 36)
  )
    throw new RangeError(
      "The organic village preset is 48 x 36; use grid or symmetric for custom dimensions.",
    );
  if (
    (options.roadWidth !== undefined && options.roadWidth !== 3) ||
    (options.buildingCount !== undefined && options.buildingCount !== 5) ||
    options.perimeterWalls === true
  )
    throw new RangeError(
      "Organic uses five houses and three-cell streets without perimeter walls.",
    );
  const density = options.density ?? 0.55;
  if (!Number.isFinite(density) || density < 0 || density > 1)
    throw new RangeError("density must be between 0 and 1.");
  const map = generateWorld(options.seed ?? 1042, { density });
  map.kind = "town";
  map.generation.layout = "organic";
  map.generation.roadWidth = 3;
  map.generation.requiredExitSides = ["north", "east", "south", "west"];
  const road = (x, y, width, height) => {
    for (let ty = y; ty < y + height; ty += 1)
      for (let tx = x; tx < x + width; tx += 1) {
        map.tiles[ty][tx] =
          map.tiles[ty][tx] === TILE.WATER ? TILE.BRIDGE : TILE.PATH;
        map.roadMask[ty][tx] = true;
      }
  };
  road(22, 0, 3, 36);
  road(0, 17, 23, 3);
  road(23, 21, 25, 3);
  const removable = new Set([
    "tree",
    "rock",
    "crate",
    "lantern",
    "signpost",
    "noticeboard",
  ]);
  const previousCount = map.entities.length;
  map.entities = map.entities.filter(
    (entity) =>
      !removable.has(entity.type) ||
      !map.roadMask.some((row, y) =>
        row.some(
          (reserved, x) =>
            reserved &&
            rectangleDistance(x + 0.5, y + 0.5, entity) <= map.collisionRadius,
        ),
      ),
  );
  map.generation.removedObstacles += previousCount - map.entities.length;
  map.generation.treeCount = map.entities.filter(
    (entity) => entity.type === "tree",
  ).length;
  map.exits = [
    { id: "north", label: "North exit", side: "north", x: 23, y: 0, width: 3 },
    { id: "east", label: "East exit", side: "east", x: 47, y: 22, width: 3 },
    { id: "south", label: "South exit", side: "south", x: 23, y: 35, width: 3 },
    { id: "west", label: "West exit", side: "west", x: 0, y: 18, width: 3 },
  ];
  map.buildings = map.entities.filter((entity) =>
    ["cottage", "lodge", "workshop"].includes(entity.type),
  );
  for (const building of map.buildings) {
    building.interiorTemplate =
      building.type === "lodge" ? "inn" : building.type;
    building.doors = [{ ...building.door, side: "south" }];
  }
  rebuildNavigation(map);
  return map;
}

export function generateTown(options = {}) {
  optionsObject(options);
  if (options.perimeterWalls !== undefined && typeof options.perimeterWalls !== "boolean")
    throw new TypeError("perimeterWalls must be a boolean.");
  const layout = options.layout ?? "organic";
  if (!["organic", "symmetric", "grid"].includes(layout))
    throw new RangeError(`Unknown town layout: ${layout}.`);
  const map =
    layout === "organic"
      ? organicTown(options)
      : generateStructuredTown({ ...options, layout });
  map.kind = "town";
  map.generation.requiredExitSides = ["north", "east", "south", "west"];
  return finish(map);
}

export function generateInterior(options = {}) {
  optionsObject(options);
  return finish(generateRooms(options));
}

export function generateBuildingInterior(town, buildingId, options = {}) {
  optionsObject(options);
  if (town?.kind !== "town")
    throw new TypeError("generateBuildingInterior requires a generated town.");
  const building = town.buildings?.find((item) => item.id === buildingId);
  if (!building) throw new RangeError(`Unknown building: ${buildingId}.`);
  const outsideDoors = building.doors ?? [{ ...building.door, side: "south" }];
  const sides = [...new Set(outsideDoors.map((door) => door.side ?? "south"))];
  const interior = generateInterior({
    template: building.interiorTemplate ?? "cottage",
    seed: `${town.seed}:${buildingId}:interior`,
    ...options,
    doors:
      options.doors ?? sides.map((side) => ({ id: `entrance-${side}`, side })),
  });
  interior.id = `${town.id}:${buildingId}:interior`;
  interior.parent = { mapId: town.id, buildingId };
  interior.connections = outsideDoors.map((door) => ({
    outside: {
      mapId: town.id,
      buildingId,
      x: door.x,
      y: door.y,
      side: door.side ?? "south",
    },
    inside:
      interior.doors.find((port) => port.side === (door.side ?? "south"))?.id ??
      null,
  }));
  if (interior.connections.some((connection) => !connection.inside))
    throw new RangeError(
      "Interior doors must include every exterior entrance side.",
    );
  return interior;
}

export function createMapSDK(defaults = {}) {
  optionsObject(defaults);
  const seed = defaults.seed ?? 1042;
  return Object.freeze({
    generateTown: (options = {}) =>
      generateTown({ seed, ...optionsObject(options) }),
    generateInterior: (options = {}) =>
      generateInterior({ seed, ...optionsObject(options) }),
    generateBuildingInterior,
    createArtPlan,
    validateMap,
    assertValidMap,
    rebuildNavigation,
    findPath,
    canOccupy,
  });
}
