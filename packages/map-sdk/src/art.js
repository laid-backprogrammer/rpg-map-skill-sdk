import PoissonDiskSampling from 'poisson-disk-sampling';
import { TILE, canOccupy, findPath, makeGrid, seededRandom } from './core.js';

const NEIGHBORS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const BUILDINGS = new Set(['lecture_hall', 'medicine_house', 'dormitory', 'woodshed', 'mountain_gate', 'cottage', 'lodge', 'workshop']);
const TREES = new Set(['pine', 'bamboo', 'tree', 'pine_canopy', 'bamboo_canopy']);
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function validateInput(map, options) {
  if (!map || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1 ||
      !Array.isArray(map.tiles) || map.tiles.length !== map.height ||
      Array.from(map.tiles).some((row) => !Array.isArray(row) || row.length !== map.width || Array.from(row).some((tile) => !Number.isInteger(tile))))
    throw new TypeError('Art plans require a rectangular integer tile grid matching map dimensions.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Art options must be an object.');
  for (const field of ['roadMask', 'walkable'])
    if (map[field] !== undefined && (!Array.isArray(map[field]) || map[field].length !== map.height ||
        Array.from(map[field]).some((row) => !Array.isArray(row) || row.length !== map.width || Array.from(row).some((value) => typeof value !== 'boolean'))))
      throw new TypeError(`${field} must be a matching boolean grid.`);
  for (const field of ['entities', 'interactables', 'regions', 'landmarks', 'doors', 'exits'])
    if (map[field] !== undefined && !Array.isArray(map[field])) throw new TypeError(`${field} must be an array.`);
  for (const entity of map.entities ?? [])
    if (!entity || ![entity.x, entity.y, entity.width, entity.height].every(Number.isFinite) || entity.width <= 0 || entity.height <= 0 ||
        entity.x < 0 || entity.y < 0 || entity.x + entity.width > map.width || entity.y + entity.height > map.height)
      throw new TypeError('Art entity footprints must be finite positive rectangles.');
  const seed = options.seed ?? map.seed ?? 1042;
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed)))
    throw new TypeError('Art seed must be a string or finite number.');
  const tileSize = options.tileSize ?? 32;
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError('tileSize must be positive and finite.');
  const preset = options.preset ?? 'fangcun';
  if (!['fangcun', 'generic', 'plain'].includes(preset)) throw new RangeError(`Unknown art preset: ${preset}.`);
  return { seed, tileSize, preset };
}

// Multi-source Manhattan distances remain finite even when a material is absent.
function distanceField(map, source) {
  const field = makeGrid(map.width, map.height, map.width + map.height);
  const queue = [];
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1)
      if (source(x, y)) { field[y][x] = 0; queue.push([x, y]); }
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx; const ny = y + dy;
      if (field[ny]?.[nx] !== undefined && field[ny][nx] > field[y][x] + 1) {
        field[ny][nx] = field[y][x] + 1; queue.push([nx, ny]);
      }
    }
  }
  return field;
}

function blobMasks(map) {
  return map.tiles.map((row, y) => row.map((tile, x) => {
    const matches = NEIGHBORS.map(([dx, dy]) => map.tiles[y + dy]?.[x + dx] === tile);
    for (const diagonal of [1, 3, 5, 7])
      matches[diagonal] &&= matches[(diagonal + 7) % 8] && matches[(diagonal + 1) % 8];
    return matches.reduce((mask, same, bit) => mask | (same ? 1 << bit : 0), 0);
  }));
}

function noiseField(width, height, random, scale = 6) {
  const samples = makeGrid(Math.ceil(width / scale) + 2, Math.ceil(height / scale) + 2, 0).map((row) => row.map(() => random()));
  const smooth = (value) => value * value * (3 - 2 * value);
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const gx = Math.floor(x / scale); const gy = Math.floor(y / scale);
    const tx = smooth(x / scale - gx); const ty = smooth(y / scale - gy);
    const upper = samples[gy][gx] * (1 - tx) + samples[gy][gx + 1] * tx;
    const lower = samples[gy + 1][gx] * (1 - tx) + samples[gy + 1][gx + 1] * tx;
    return upper * (1 - ty) + lower * ty;
  }));
}

function reservePaths(map) {
  const protectedCells = makeGrid(map.width, map.height, false);
  const visits = makeGrid(map.width, map.height, 0);
  const reserve = (point, radius = 1) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    for (let y = Math.floor(point.y) - radius; y <= Math.floor(point.y) + radius; y += 1)
      for (let x = Math.floor(point.x) - radius; x <= Math.floor(point.x) + radius; x += 1)
        if (protectedCells[y]?.[x] !== undefined) protectedCells[y][x] = true;
  };
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1)
      if (map.roadMask?.[y]?.[x] || [TILE.PATH, TILE.BRIDGE].includes(map.tiles[y][x])) reserve({ x, y });
  const navigation = map.walkable ? map : {
    ...map, walkable: map.tiles.map((row, y) => row.map((_, x) => canOccupy(map, x + 0.5, y + 0.5))),
  };
  const destinations = [
    ...(map.interactables ?? []).map((item) => item.approach ?? item),
    ...(map.landmarks ?? []), ...(map.doors ?? []), ...(map.exits ?? []),
  ];
  reserve(map.spawn);
  for (const point of destinations) {
    reserve(point);
    if (!map.spawn || !Number.isInteger(point.x) || !Number.isInteger(point.y)) continue;
    for (const step of findPath(navigation, map.spawn, point)) {
      reserve(step); visits[step.y][step.x] += 1;
    }
  }
  for (const item of map.interactables ?? []) if (item.kind === 'door') reserve(item);
  for (const building of map.buildings ?? [])
    for (const door of building.doors ?? (building.door ? [building.door] : [])) reserve(door);
  return { protectedCells, visits };
}

function semanticZones(map) {
  const zones = [];
  for (const region of map.regions ?? []) {
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite)) continue;
    if (region.type === 'taiji' || region.type === 'mind-ring') continue;
    zones.push({ id: `zone-${zones.length}`, kind: region.type === 'herb-garden' ? 'garden' : region.type,
      x: region.x, y: region.y, width: region.width, height: region.height });
  }
  for (const entity of map.entities ?? [])
    if (BUILDINGS.has(entity.sprite ?? entity.type))
      zones.push({ id: `lot-${entity.id}`, kind: 'building-lot', parentId: entity.id,
        x: entity.x, y: entity.y, width: entity.width, height: entity.height });
  let left = map.width; let top = map.height; let right = 0; let bottom = 0;
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1)
      if (map.tiles[y][x] === TILE.WATER) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
  if (right > left) {
    zones.push({ id: 'zone-shore', kind: 'shore', x: left, y: top,
      width: right - left, height: bottom - top });
  }
  return zones;
}

function isOldBorder(entity) {
  return /^(edge-|north-canopy-|pond-lotus-)/.test(entity.id ?? '') && !entity.solid;
}

function decorationsFor(map, plan, random, variation) {
  if (plan.preset !== 'fangcun' || map.sceneId !== 'courtyard') return;
  const isTerrain = (point, tile) => point[0] >= 0 && point[1] >= 0 && point[0] + 0.45 <= map.width && point[1] + 0.45 <= map.height &&
    [0, 0.45 - 1e-9].every((dy) => [0, 0.45 - 1e-9].every((dx) => {
      const x = Math.floor(point[0] + dx); const y = Math.floor(point[1] + dy);
      return map.tiles[y]?.[x] === tile && !plan.protected[y][x];
    }));
  const add = (group, sprite, point, scale, layer = 'entity') => {
    if (plan.decorations.length >= 105) return;
    const canopy = sprite.endsWith('_canopy');
    const cliff = sprite === 'cliff';
    const width = canopy ? 6.1 * scale : cliff ? 4.5 * scale : sprite === 'lotus' ? 1.7 * scale : 1.45 * scale;
    const height = canopy ? 4.9 * scale : cliff ? 3.8 * scale : sprite === 'lotus' ? 1.2 * scale : 1.2 * scale;
    const item = { id: `art-${group.id}-${group.memberIds.length}`, type: sprite, sprite,
      x: point[0], y: point[1], width: 0.45, height: 0.45, solid: false,
      visual: { offsetX: -width * 0.48, offsetY: -height * 0.83, width, height },
      layer, foreground: layer === 'foreground', opacity: sprite === 'herb_bed' ? 0.76 : 1, groupId: group.id };
    plan.decorations.push(item); group.memberIds.push(item.id);
  };
  const anchors = new PoissonDiskSampling({ shape: [map.width, map.height], minDistance: 5.2, maxDistance: 8.4, tries: 18 }, random).fill()
    .filter((point) => isTerrain(point, TILE.WALL) && variation[Math.floor(point[1])][Math.floor(point[0])] >= 0.24);
  // Share the finite prop budget across every cluster, rather than filling one edge first.
  const membersPerCluster = Math.max(1, Math.min(7, Math.floor(88 / Math.max(1, anchors.length))));
  for (const anchor of anchors) {
    if (plan.decorations.length >= 88) break;
    if (!isTerrain(anchor, TILE.WALL)) continue;
    const x = Math.floor(anchor[0]); const y = Math.floor(anchor[1]);
    if (variation[y][x] < 0.24) continue;
    const group = { id: `forest-${plan.groups.length}`, kind: 'forest-cluster', zone: 'forest',
      anchor: { x: anchor[0], y: anchor[1] }, radius: 3.3 + random() * 1.3, memberIds: [] };
    plan.groups.push(group);
    const bamboo = random() < 0.58;
    const radius = group.radius;
    const points = new PoissonDiskSampling({ shape: [radius * 2, radius * 2], minDistance: 1.25, maxDistance: 2.5, tries: 12,
      distanceFunction: (point) => clamp(Math.hypot(point[0] - radius, point[1] - radius) / radius), bias: 0.35 }, random).fill();
    let count = 0;
    for (const local of points) {
      if (count >= membersPerCluster || plan.decorations.length >= 88 || Math.hypot(local[0] - radius, local[1] - radius) > radius) continue;
      const point = [anchor[0] + local[0] - radius, anchor[1] + local[1] - radius];
      if (!isTerrain(point, TILE.WALL)) continue;
      const noise = variation[Math.floor(point[1])][Math.floor(point[0])];
      if (noise < 0.21) continue;
      const sprite = count === 0 && random() < 0.28 ? 'cliff' : random() < 0.17 ? 'herb_bed' : bamboo ? 'bamboo_canopy' : 'pine_canopy';
      add(group, sprite, point, 0.8 + random() * 0.36);
      count += 1;
    }
  }
  const shore = plan.semanticZones.find((zone) => zone.kind === 'shore');
  if (shore) {
    const group = { id: 'water-garden', kind: 'shore-cluster', zone: 'shore',
      anchor: { x: shore.x + shore.width / 2, y: shore.y + shore.height / 2 }, radius: Math.max(shore.width, shore.height) / 2, memberIds: [] };
    plan.groups.push(group);
    const points = new PoissonDiskSampling({ shape: [shore.width, shore.height], minDistance: 2.1, maxDistance: 3.4, tries: 12 }, random).fill();
    for (const local of points) {
      if (group.memberIds.length >= 7) break;
      const point = [shore.x + local[0], shore.y + local[1]];
      if (isTerrain(point, TILE.WATER)) add(group, 'lotus', point, 0.85 + random() * 0.35, 'ground');
    }
  }
}

function surfaceDetails(map, plan, random) {
  const add = (kind, x, y, width, height, alpha, parentId) => {
    const left = clamp(x, 0, map.width); const top = clamp(y, 0, map.height);
    const right = clamp(x + width, 0, map.width); const bottom = clamp(y + height, 0, map.height);
    if (right <= left || bottom <= top || plan.groundDecals.length >= 130) return;
    plan.groundDecals.push({ id: `decal-${plan.groundDecals.length}`, kind, x: left, y: top,
      width: right - left, height: bottom - top, alpha, ...(parentId ? { parentId } : {}) });
  };
  const entities = (map.entities ?? []).filter((entity) => !isOldBorder(entity));
  for (const entity of [...entities, ...plan.decorations]) {
    const sprite = entity.sprite ?? entity.type;
    const isTree = TREES.has(sprite);
    if (entity.solid || isTree || sprite === 'cliff') {
      const building = BUILDINGS.has(sprite);
      const width = Math.min(map.width, building ? entity.width * 1.05 : isTree ? 2.4 : Math.max(0.6, entity.width * 1.4));
      const height = Math.min(map.height, building ? Math.max(0.7, entity.height * 0.35) : isTree ? 0.7 : Math.max(0.3, entity.height * 0.4));
      plan.contactShadows.push({ id: `shadow-${entity.id}`, kind: 'soft', parentId: entity.id,
        x: clamp(entity.x + entity.width / 2 - width / 2 - 0.2, 0, map.width - width),
        y: clamp(entity.y + entity.height - height / 2 + 0.1, 0, map.height - height),
        width, height, alpha: building ? 0.19 : isTree ? 0.13 : 0.11 });
    }
    if (BUILDINGS.has(sprite)) {
      const group = { id: `attachment-${entity.id}`, kind: 'building-attachment', zone: 'building-lot', parentId: entity.id,
        anchor: { x: entity.x + entity.width / 2, y: entity.y + entity.height }, radius: entity.width / 2, memberIds: [] };
      plan.groups.push(group);
      add('foundation-dirt', entity.x - 0.35, entity.y + entity.height - 0.35, entity.width + 0.7, 1.15, 0.23, entity.id);
      add('moss', entity.x - 0.35, entity.y + entity.height - 0.1, Math.max(0.65, entity.width * 0.24), 0.55, 0.22, entity.id);
      add('moss', entity.x + entity.width * 0.76, entity.y + entity.height - 0.1, Math.max(0.65, entity.width * 0.24), 0.6, 0.18, entity.id);
    }
    if (isTree && (entity.solid || random() < 0.32)) {
      add('root-soil', entity.x - 0.4, entity.y + 0.15, 1.3, 0.65, 0.24, entity.id);
      if (random() < 0.45) add('leaf-litter', entity.x - 0.85, entity.y + 0.2, 2.2, 0.8, 0.2, entity.id);
    }
  }
  for (const item of map.interactables ?? []) {
    const point = item.approach ?? item;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (item.kind === 'door') add('wear', point.x - 0.15, point.y - 0.25, 1.35, 1.25, 0.13, item.id);
  }
  if (plan.preset !== 'fangcun' || map.sceneId !== 'courtyard') return;
  const samples = new PoissonDiskSampling({ shape: [map.width, map.height], minDistance: 2.7, maxDistance: 4.1, tries: 12 }, random).fill();
  let count = 0;
  for (const [x, y] of samples) {
    if (count >= 24) break;
    const tx = Math.floor(x); const ty = Math.floor(y); const tile = map.tiles[ty][tx];
    if (tile === TILE.GRASS && !plan.protected[ty][tx] && plan.fields.waterDistance[ty][tx] <= 2) {
      add('shore-wet', x - 0.4, y - 0.3, 1.7, 0.8, 0.21); count += 1;
    } else if ([TILE.PATH, TILE.FLOOR].includes(tile) && random() < 0.35) {
      add(plan.fields.traffic[ty][tx] > 0.45 ? 'wear' : 'crack', x - 0.2, y - 0.15, 0.9 + random() * 0.7, 0.45, 0.1); count += 1;
    } else if (tile === TILE.GRASS && !plan.protected[ty][tx] && plan.fields.wallDistance[ty][tx] < 3) {
      add('leaf-litter', x - 0.6, y - 0.2, 1.8, 0.8, 0.2); count += 1;
    }
  }
}

const STACK_LIMIT = 64;
const STACK_EPSILON = 1e-8;

function isUnitPoint(point) {
  return Boolean(point) && typeof point === 'object' && !Array.isArray(point) &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function stackSprite(value, fallback, label) {
  const sprite = value ?? fallback;
  if (typeof sprite !== 'string' || sprite.length === 0)
    throw new TypeError(`${label} must be a non-empty string.`);
  return sprite;
}

function stackVisual(visual) {
  if (visual === undefined) return undefined;
  if (!visual || typeof visual !== 'object' || Array.isArray(visual))
    throw new TypeError('Sprite stack visual must be an object.');
  const copy = {};
  for (const key of ['offsetX', 'offsetY', 'width', 'height']) {
    if (!Number.isFinite(visual[key])) throw new RangeError(`Sprite stack visual ${key} must be finite.`);
    copy[key] = visual[key];
  }
  if (copy.width <= 0 || copy.height <= 0)
    throw new RangeError('Sprite stack visual width and height must be positive.');
  return copy;
}

function entityForStack(map, id) {
  if (typeof id !== 'string' || id.length === 0)
    throw new TypeError('Sprite stacks require a footprintId string.');
  const matches = (map.entities ?? []).filter((entity) => entity.id === id);
  if (matches.length === 0) throw new TypeError(`Sprite stack footprint not found: ${id}.`);
  if (matches.length > 1) throw new TypeError(`Sprite stack footprint id is not unique: ${id}.`);
  return matches[0];
}

function stackElevations(entry, sliceCount, sprite) {
  if (entry.slices === undefined) {
    const gap = entry.spacing ?? (entry.height === undefined ? undefined : entry.height / (sliceCount - 1));
    if (gap === undefined) throw new RangeError('Sprite stacks need spacing, height, or per-slice spacing.');
    if (!Number.isFinite(gap) || gap <= 0)
      throw new RangeError('Sprite stack spacing must be a positive finite number.');
    return Array.from({ length: sliceCount }, (_, index) => ({
      index,
      elevation: index === sliceCount - 1 && entry.spacing === undefined ? entry.height : gap * index,
      spacing: index === 0 ? 0 : gap,
      sprite,
    }));
  }
  if (!Array.isArray(entry.slices) || entry.slices.length !== sliceCount)
    throw new RangeError('Sprite stack slices must be an array matching sliceCount.');
  let elevation = 0;
  return entry.slices.map((slice, index) => {
    if (!slice || typeof slice !== 'object' || Array.isArray(slice))
      throw new TypeError('Each sprite stack slice must be an object.');
    let gap = 0;
    if (index === 0) {
      if (slice.spacing !== undefined && slice.spacing !== 0)
        throw new RangeError('The ground slice spacing must be 0 or omitted.');
    } else {
      const gapSource = slice.spacing ?? entry.spacing;
      if (gapSource === undefined)
        throw new RangeError('Each upper slice needs spacing, or the stack needs uniform spacing.');
      if (!Number.isFinite(gapSource) || gapSource <= 0)
        throw new RangeError('Slice spacing must be a positive finite number.');
      gap = gapSource;
    }
    elevation += gap;
    const visual = stackVisual(slice.visual);
    return {
      index, elevation, spacing: gap,
      sprite: stackSprite(slice.sprite, sprite, 'Slice sprite'),
      ...(visual ? { visual } : {}),
    };
  });
}

// Render metadata only. The entity footprint stays the collision body.
function compileSpriteStack(map, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new TypeError('Each sprite stack must be an object.');
  const entity = entityForStack(map, entry.footprintId);
  const sliceCount = entry.sliceCount;
  if (!Number.isInteger(sliceCount) || sliceCount < 2 || sliceCount > STACK_LIMIT)
    throw new RangeError(`Sprite stack sliceCount must be an integer from 2 to ${STACK_LIMIT}.`);
  const pivot = entry.pivot === undefined
    ? (isUnitPoint(entity.anchor) ? { x: entity.anchor.x, y: entity.anchor.y } : { x: 0.5, y: 1 })
    : entry.pivot;
  if (!isUnitPoint(pivot))
    throw new RangeError('Sprite stack pivot must be a normalized point inside the ground footprint.');
  const sprite = stackSprite(entry.sprite, entity.sprite ?? entity.type, 'Sprite stack sprite');
  if (entry.spacing !== undefined && (!Number.isFinite(entry.spacing) || entry.spacing <= 0))
    throw new RangeError('Sprite stack spacing must be a positive finite number.');
  if (entry.height !== undefined && (!Number.isFinite(entry.height) || entry.height <= 0))
    throw new RangeError('Sprite stack height must be a positive finite number.');
  const slices = stackElevations(entry, sliceCount, sprite);
  let height = slices.at(-1).elevation;
  if (!(height > 0)) throw new RangeError('Sprite stack height must be positive.');
  if (entry.height !== undefined) {
    if (Math.abs(entry.height - height) > STACK_EPSILON)
      throw new RangeError('Sprite stack height must equal the top slice elevation.');
    slices.at(-1).elevation = entry.height;
    height = entry.height;
  }
  const gaps = slices.slice(1).map((slice) => slice.spacing);
  const uniform = gaps.every((gap) => gap === gaps[0]);
  const footprint = { x: entity.x, y: entity.y, width: entity.width, height: entity.height };
  const foot = {
    x: footprint.x + footprint.width * pivot.x,
    y: footprint.y + footprint.height * pivot.y,
  };
  return {
    id: `stack-${entity.id}`, footprintId: entity.id, sprite, sliceCount,
    spacingMode: uniform ? 'uniform' : 'per-slice',
    ...(uniform ? { spacing: gaps[0] } : {}),
    height, pivot: { x: pivot.x, y: pivot.y }, foot, sortDepth: foot.y, sortMode: 'world-foot-y',
    footprint, collision: 'footprint-only', slices,
  };
}

function compileSpriteStacks(map, options) {
  if (options.spriteStacks !== undefined && !Array.isArray(options.spriteStacks))
    throw new TypeError('spriteStacks must be an array.');
  const claimed = new Set();
  const pending = [];
  for (const entry of options.spriteStacks ?? []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new TypeError('Each sprite stack must be an object.');
    if (claimed.has(entry.footprintId))
      throw new TypeError(`Duplicate sprite stack for ${entry.footprintId}.`);
    claimed.add(entry.footprintId);
    pending.push(entry);
  }
  for (const entity of map.entities ?? []) {
    if (entity.spriteStack === undefined) continue;
    if (claimed.has(entity.id))
      throw new TypeError(`Sprite stack for ${entity.id} is declared both on the entity and in options.`);
    const hint = entity.spriteStack;
    if (!hint || typeof hint !== 'object' || Array.isArray(hint))
      throw new TypeError(`Entity ${entity.id ?? '(missing id)'} spriteStack must be an object.`);
    if (hint.footprintId !== undefined && hint.footprintId !== entity.id)
      throw new TypeError(`Entity ${entity.id} spriteStack footprintId must match the entity.`);
    claimed.add(entity.id);
    pending.push({ ...hint, footprintId: entity.id });
  }
  return pending.map((entry) => compileSpriteStack(map, entry));
}

/** A render-only plan; no world entity, route, collision, or story state is edited. */
export function createArtPlan(map, options = {}) {
  const settings = validateInput(map, options);
  const spriteStacks = compileSpriteStacks(map, options);
  const random = seededRandom(`${settings.seed}:art-v1`);
  const variation = noiseField(map.width, map.height, random);
  const roadDistance = distanceField(map, (x, y) => Boolean(map.roadMask?.[y]?.[x]) || [TILE.PATH, TILE.BRIDGE, TILE.FLOOR].includes(map.tiles[y][x]));
  const waterDistance = distanceField(map, (x, y) => map.tiles[y][x] === TILE.WATER);
  const wallDistance = distanceField(map, (x, y) => map.tiles[y][x] === TILE.WALL);
  const { protectedCells, visits } = reservePaths(map);
  const shade = variation.map((row, y) => row.map((noise, x) => clamp(Math.exp(-wallDistance[y][x] / 3) * 0.6 + noise * 0.25)));
  const traffic = visits.map((row, y) => row.map((count, x) => clamp((count ? 0.45 + Math.min(count, 8) * 0.065 : 0) + Math.exp(-roadDistance[y][x] / 1.8) * 0.24)));
  const moisture = shade.map((row, y) => row.map((shadow, x) => clamp(Math.exp(-waterDistance[y][x] / 3.2) * 0.8 + shadow * 0.2)));
  const plan = { version: '1.0', ...settings, width: map.width, height: map.height,
    materials: map.tiles.map((row) => [...row]), fields: { roadDistance, waterDistance, wallDistance, shade, traffic, moisture },
    protected: protectedCells, transitions: blobMasks(map), semanticZones: semanticZones(map),
    groundDecals: [], contactShadows: [], decorations: [], groups: [], spriteStacks, statistics: {} };
  decorationsFor(map, plan, random, variation);
  surfaceDetails(map, plan, random);
  plan.statistics = { decorationCount: plan.decorations.length, groupCount: plan.groups.length,
    decalCount: plan.groundDecals.length, shadowCount: plan.contactShadows.length,
    protectedCellCount: protectedCells.reduce((count, row) => count + row.filter(Boolean).length, 0),
    spriteStackCount: plan.spriteStacks.length,
    collisionChanges: 0, sampler: 'poisson-disk-sampling', transitionRule: 'blob-47' };
  return plan;
}
