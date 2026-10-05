export type Seed = string | number;
export type TownLayout = "organic" | "symmetric" | "grid";
export type InteriorTemplate = "cottage" | "inn" | "workshop";
export type Side = "north" | "east" | "south" | "west";
/** Integer tile index. Its continuous center is (x + 0.5, y + 0.5). */
export interface TilePoint {
  x: number;
  y: number;
}
/** Continuous map-space position, not a tile index. */
export interface Position {
  x: number;
  y: number;
}
export interface Rectangle extends Position {
  width: number;
  height: number;
}
export interface Portal extends TilePoint {
  id: string;
  label?: string;
  side: Side;
  width?: number;
  offset?: number;
}
export interface Landmark extends TilePoint {
  id: string;
  label?: string;
  kind?: string;
}
export interface Entity extends Rectangle {
  id: string;
  type: string;
  solid: boolean;
  label?: string;
  sprite?: string;
  visual?: { offsetX: number; offsetY: number; width: number; height: number };
  anchor?: Position;
  approach?: TilePoint;
  door?: TilePoint & { side?: Side };
  doors?: Array<TilePoint & { side?: Side }>;
  [key: string]: unknown;
}
export interface Building extends Entity {
  interiorTemplate: InteriorTemplate;
  door: TilePoint & { side?: Side };
  doors: Array<TilePoint & { side?: Side }>;
}
export interface Room extends Rectangle {
  id: string;
  type: string;
  anchor: TilePoint;
  doors: TilePoint[];
}
export interface RouteResult {
  id: string;
  label: string;
  reachable: boolean;
  pathLength: number;
  clearancePassed: boolean;
}
export interface ValidationReport {
  passed: boolean;
  issues: string[];
  reachableCount: number;
  walkableCount: number;
  reachablePercent: number;
  components: number;
  componentCount: number;
  componentSizes: number[];
  allLandmarksReachable: boolean;
  allExitsReachable: boolean;
  landmarkResults: RouteResult[];
  exitResults: RouteResult[];
  /** Largest rectangle of valid grid centers, not a continuous obstacle-free region. */
  maxRectangle: Rectangle & { area: number };
  missionLength: number;
  mismatchedCells: number;
  blockedRoadCells: number;
  clearance: {
    characterRadius: number;
    minRoadWidth: number;
    minimumRouteClearance: number;
    passed: boolean;
  };
  symmetry: { mode: string; passed: boolean };
}
export interface NavigationMap {
  width: number;
  height: number;
  tiles: number[][];
  walkable: boolean[][];
  entities: Entity[];
  spawn: TilePoint;
  collisionRadius?: number;
  solidTiles?: number[];
  roadMask?: boolean[][];
  landmarks?: Landmark[];
  exits?: Portal[];
  doors?: Portal[];
  mission?: string[];
  kind?: "town" | "interior";
  generation?: Record<string, unknown>;
}
export interface MapData extends NavigationMap {
  id: string;
  schemaVersion: "1.0";
  seed: Seed;
  kind: "town" | "interior";
  landmarks: Landmark[];
  exits: Portal[];
  mission: string[];
  roadMask: boolean[][];
  generation: { sdkVersion: string; [key: string]: unknown };
  regions: Array<Rectangle & { id: string; type: string }>;
  report: ValidationReport;
}
export interface TownMap extends MapData {
  kind: "town";
  buildings: Building[];
}
export interface InteriorMap extends MapData {
  kind: "interior";
  rooms: Room[];
  doors: Portal[];
  parent?: { mapId: string; buildingId: string };
  connections?: Array<{
    outside: TilePoint & { mapId: string; buildingId: string; side: Side };
    inside: string | null;
  }>;
}
export interface TownOptions {
  seed?: Seed;
  /** Default organic: 48x36, five houses. Other layouts support configurable size. */
  layout?: TownLayout;
  /** Structured town dimensions 25..129; symmetric requires odd dimensions. */
  width?: number;
  height?: number;
  /** Organic forest density, 0..1. */
  density?: number;
  /** Odd width 3, 5 or 7 for structured towns. */
  roadWidth?: number;
  /** Explicit count must fit; symmetric counts must be multiples of four. */
  buildingCount?: number;
  perimeterWalls?: boolean;
}
export interface InteriorDoorOptions {
  id?: string;
  side: Side;
  offset?: number;
}
export interface InteriorOptions {
  seed?: Seed;
  template?: InteriorTemplate;
  width?: number;
  height?: number;
  corridorWidth?: number;
  furnitureDensity?: number;
  symmetry?: "none" | "bilateral" | "quadrilateral";
  doors?: InteriorDoorOptions[];
}
export const SDK_VERSION: string;
export const CHARACTER_RADIUS: number;
export const TILE: Readonly<{
  GRASS: 0;
  PATH: 1;
  WATER: 2;
  BRIDGE: 3;
  WALL: 4;
  FLOOR: 5;
}>;
export class MapValidationError extends Error {
  report: ValidationReport;
  constructor(report: ValidationReport);
}
export function generateTown(options?: TownOptions): TownMap;
export function generateInterior(options?: InteriorOptions): InteriorMap;
export function generateBuildingInterior(
  town: TownMap,
  buildingId: string,
  options?: InteriorOptions,
): InteriorMap;
export function validateMap(map: NavigationMap): ValidationReport;
export function assertValidMap<T extends NavigationMap>(
  map: T,
): T & { report: ValidationReport };
export function rebuildNavigation<T extends NavigationMap>(map: T): T;
export function findPath(
  map: NavigationMap,
  start: TilePoint,
  end: TilePoint,
): TilePoint[];
export function findPathFromPosition(
  map: NavigationMap,
  start: Position,
  end: TilePoint,
): TilePoint[];
export function canOccupy(
  map: NavigationMap,
  x: number,
  y: number,
  radius?: number,
): boolean;
export function canTraverse(
  map: NavigationMap,
  start: Position,
  end: Position,
  radius?: number,
): boolean;
export function isWalkable(map: NavigationMap, x: number, y: number): boolean;
export function maximalRectangle(
  grid: boolean[][],
): Rectangle & { area: number };
export interface ArtMap extends NavigationMap {
  seed?: Seed;
  sceneId?: string;
  regions?: Array<Rectangle & { type: string; id?: string }>;
  interactables?: Array<TilePoint & { id: string; kind: string; approach?: TilePoint }>;
  buildings?: Building[];
}
export interface ArtOptions { seed?: Seed; tileSize?: number; preset?: "fangcun" | "generic" | "plain" }
export type GroundDecalKind = "foundation-dirt" | "moss" | "wear" | "crack" | "root-soil" | "leaf-litter" | "shore-wet";
export interface GroundDecal extends Rectangle { id: string; kind: GroundDecalKind; alpha: number; parentId?: string }
export interface ContactShadow extends Rectangle { id: string; kind: "soft"; alpha: number; parentId: string }
export interface ArtDecoration extends Entity {
  solid: false; sprite: string; groupId: string;
  layer: "background" | "ground" | "entity" | "foreground";
  foreground: boolean; opacity: number;
  visual: { offsetX: number; offsetY: number; width: number; height: number };
}
export interface ArtGroup {
  id: string; kind: string; zone: string; anchor: Position; radius: number;
  memberIds: string[]; parentId?: string;
}
export interface ArtPlan {
  version: "1.0"; seed: Seed; width: number; height: number; tileSize: number;
  preset: "fangcun" | "generic" | "plain";
  materials: number[][];
  /** N NE E SE S SW W NW bits; corner bits require their adjacent cardinal bits. */
  transitions: number[][];
  protected: boolean[][];
  fields: { roadDistance: number[][]; waterDistance: number[][]; wallDistance: number[][]; shade: number[][]; traffic: number[][]; moisture: number[][] };
  semanticZones: Array<Rectangle & { id: string; kind: string; parentId?: string }>;
  groups: ArtGroup[]; groundDecals: GroundDecal[]; contactShadows: ContactShadow[]; decorations: ArtDecoration[];
  statistics: { decorationCount: number; groupCount: number; decalCount: number; shadowCount: number; protectedCellCount: number; collisionChanges: 0; sampler: string; transitionRule: string };
}
/** Produces render-only art data without mutating the physical map. */
export function createArtPlan(map: ArtMap, options?: ArtOptions): ArtPlan;
export interface MapSDK {
  generateTown(options?: TownOptions): TownMap;
  generateInterior(options?: InteriorOptions): InteriorMap;
  generateBuildingInterior: typeof generateBuildingInterior;
  createArtPlan: typeof createArtPlan;
  validateMap: typeof validateMap;
  assertValidMap: typeof assertValidMap;
  rebuildNavigation: typeof rebuildNavigation;
  findPath: typeof findPath;
  canOccupy: typeof canOccupy;
}
export function createMapSDK(defaults?: { seed?: Seed }): Readonly<MapSDK>;
