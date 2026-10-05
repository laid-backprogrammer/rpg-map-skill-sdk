import {
  TILE,
  CHARACTER_RADIUS,
  seededRandom,
  makeGrid,
  rebuildNavigation,
  validateMap,
  canTraverse,
} from "./core.js";

const SIDES = ["north", "east", "south", "west"];
const TEMPLATES = {
  cottage: { width: 17, height: 15, minimumWidth: 15, minimumHeight: 15 },
  inn: { width: 23, height: 19, minimumWidth: 21, minimumHeight: 19 },
  workshop: { width: 21, height: 17, minimumWidth: 17, minimumHeight: 15 },
};
const FURNITURE = {
  bedroom: ["bed", "shelf", "table"],
  guest: ["bed", "table", "shelf"],
  kitchen: ["stove", "counter", "crate"],
  living: ["table", "shelf", "stove"],
  lobby: ["counter", "table", "shelf"],
  storage: ["shelf", "crate", "crate"],
  workshop: ["counter", "desk", "shelf"],
  office: ["desk", "shelf", "table"],
};
const FOOTPRINTS = {
  bed: [1, 2],
  table: [2, 1],
  desk: [2, 1],
  counter: [2, 1],
  shelf: [2, 1],
  crate: [1, 1],
  stove: [1, 1],
};

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Interior options must be an object.");
  }
  const template = options.template ?? "cottage";
  const specification = TEMPLATES[template];
  if (!specification)
    throw new RangeError(`Unknown interior template: ${template}.`);
  const width = options.width ?? specification.width;
  const height = options.height ?? specification.height;
  const corridorWidth = options.corridorWidth ?? 3;
  const symmetry = options.symmetry ?? "none";
  const furnitureDensity = options.furnitureDensity ?? 0.55;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < specification.minimumWidth ||
    height < specification.minimumHeight ||
    width > 101 ||
    height > 101
  ) {
    throw new RangeError(
      `${template} requires integer dimensions between ${specification.minimumWidth} x ${specification.minimumHeight} and 101 x 101.`,
    );
  }
  if (
    !Number.isInteger(corridorWidth) ||
    corridorWidth < 3 ||
    corridorWidth % 2 !== 1
  ) {
    throw new RangeError("corridorWidth must be an odd integer of at least 3.");
  }
  if (!["none", "bilateral", "quadrilateral"].includes(symmetry)) {
    throw new RangeError(`Unknown interior symmetry: ${symmetry}.`);
  }
  if (symmetry !== "none" && (width % 2 !== 1 || height % 2 !== 1)) {
    throw new RangeError("Symmetric interiors require odd width and height.");
  }
  if (
    !Number.isFinite(furnitureDensity) ||
    furnitureDensity < 0 ||
    furnitureDensity > 1
  ) {
    throw new RangeError("furnitureDensity must be between 0 and 1.");
  }
  const leftWidth = Math.floor((width - corridorWidth) / 2) - 2;
  const rightWidth =
    width - Math.floor((width - corridorWidth) / 2) - corridorWidth - 2;
  const northHeight = Math.floor((height - corridorWidth) / 2) - 2;
  const southHeight =
    height - Math.floor((height - corridorWidth) / 2) - corridorWidth - 2;
  const minimumWingWidth =
    template === "inn" ? corridorWidth * 2 + 1 : corridorWidth;
  if (
    Math.min(leftWidth, rightWidth) < minimumWingWidth ||
    Math.min(northHeight, southHeight) < corridorWidth
  ) {
    throw new RangeError(
      "The dimensions cannot fit the requested corridors and functional rooms.",
    );
  }
  const requestedDoors =
    options.doors ??
    (symmetry === "quadrilateral"
      ? SIDES.map((side) => ({ side }))
      : [{ side: "south" }]);
  if (
    !Array.isArray(requestedDoors) ||
    requestedDoors.length === 0 ||
    requestedDoors.length > 16
  ) {
    throw new RangeError(
      "doors must contain between 1 and 16 boundary portals.",
    );
  }
  const half = Math.floor(corridorWidth / 2);
  const doors = requestedDoors.map((door, index) => {
    if (!door || !SIDES.includes(door.side))
      throw new RangeError("Each door needs a valid boundary side.");
    const dimension = ["north", "south"].includes(door.side) ? width : height;
    const offset = door.offset ?? Math.floor(dimension / 2);
    if (
      !Number.isInteger(offset) ||
      offset - half < 1 ||
      offset + half > dimension - 2
    ) {
      throw new RangeError(`Door ${index} lies outside its usable boundary.`);
    }
    const id = door.id ?? `door-${door.side}-${offset}`;
    if (typeof id !== "string" || !id.length)
      throw new TypeError("Door ids must be nonempty strings.");
    const x =
      door.side === "west" ? 0 : door.side === "east" ? width - 1 : offset;
    const y =
      door.side === "north" ? 0 : door.side === "south" ? height - 1 : offset;
    return {
      id,
      side: door.side,
      offset,
      x,
      y,
      width: corridorWidth,
      kind: "exit",
      label: `${door.side} door`,
    };
  });
  for (let index = 0; index < doors.length; index += 1) {
    const door = doors[index];
    if (
      doors.some(
        (other, otherIndex) =>
          otherIndex < index &&
          (other.id === door.id ||
            (other.side === door.side &&
              Math.abs(other.offset - door.offset) < corridorWidth)),
      )
    ) {
      throw new RangeError("Door ids and boundary openings must not overlap.");
    }
    const mirrorXSide =
      door.side === "east" ? "west" : door.side === "west" ? "east" : door.side;
    const mirrorXOffset = ["north", "south"].includes(door.side)
      ? width - 1 - door.offset
      : door.offset;
    const mirrorYSide =
      door.side === "north"
        ? "south"
        : door.side === "south"
          ? "north"
          : door.side;
    const mirrorYOffset = ["east", "west"].includes(door.side)
      ? height - 1 - door.offset
      : door.offset;
    if (
      symmetry !== "none" &&
      !doors.some(
        (other) => other.side === mirrorXSide && other.offset === mirrorXOffset,
      )
    ) {
      throw new RangeError(
        "Door configuration does not satisfy bilateral symmetry.",
      );
    }
    if (
      symmetry === "quadrilateral" &&
      !doors.some(
        (other) => other.side === mirrorYSide && other.offset === mirrorYOffset,
      )
    ) {
      throw new RangeError(
        "Door configuration does not satisfy quadrilateral symmetry.",
      );
    }
  }
  return {
    seed: options.seed ?? 42,
    template,
    width,
    height,
    corridorWidth,
    symmetry,
    furnitureDensity,
    doors,
  };
}

function reflectedRectangle(rectangle, width, height, flipX, flipY) {
  return {
    ...rectangle,
    x: flipX ? width - rectangle.x - rectangle.width : rectangle.x,
    y: flipY ? height - rectangle.y - rectangle.height : rectangle.y,
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function allNavigationConnected(map) {
  if (!map.walkable[map.spawn.y]?.[map.spawn.x]) return false;
  const queue = [map.spawn];
  const visited = new Set([map.spawn.y * map.width + map.spawn.x]);
  for (let head = 0; head < queue.length; head += 1) {
    const point = queue[head];
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const x = point.x + dx;
      const y = point.y + dy;
      const key = y * map.width + x;
      if (!map.walkable[y]?.[x] || visited.has(key)) continue;
      if (
        !canTraverse(
          map,
          { x: point.x + 0.5, y: point.y + 0.5 },
          { x: x + 0.5, y: y + 0.5 },
        )
      )
        continue;
      queue.push({ x, y });
      visited.add(key);
    }
  }
  return (
    visited.size ===
      map.walkable.reduce(
        (total, row) => total + row.filter(Boolean).length,
        0,
      ) &&
    map.landmarks.every((point) =>
      visited.has(point.y * map.width + point.x),
    ) &&
    map.roadMask.every((row, y) =>
      row.every((reserved, x) => !reserved || map.walkable[y][x]),
    )
  );
}

function furnitureCandidates(room, type, random) {
  const [width, height] = FOOTPRINTS[type];
  const candidates = [];
  const seen = new Set();
  const add = (x, y) => {
    const key = `${x},${y}`;
    if (
      seen.has(key) ||
      x < room.x ||
      y < room.y ||
      x + width > room.x + room.width ||
      y + height > room.y + room.height
    )
      return;
    seen.add(key);
    candidates.push({ type, x, y, width, height });
  };
  for (let x = room.x; x <= room.x + room.width - width; x += 1) {
    add(x, room.y);
    add(x, room.y + room.height - height);
  }
  for (let y = room.y; y <= room.y + room.height - height; y += 1) {
    add(room.x, y);
    add(room.x + room.width - width, y);
  }
  return shuffle(candidates, random);
}

function approachCandidates(entity, room) {
  const candidates = [];
  for (let x = entity.x; x < entity.x + entity.width; x += 1) {
    candidates.push({ x, y: entity.y - 1 }, { x, y: entity.y + entity.height });
  }
  for (let y = entity.y; y < entity.y + entity.height; y += 1) {
    candidates.push({ x: entity.x - 1, y }, { x: entity.x + entity.width, y });
  }
  return candidates
    .filter(
      (point) =>
        point.x >= room.x &&
        point.x < room.x + room.width &&
        point.y >= room.y &&
        point.y < room.y + room.height,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - room.anchor.x, a.y - room.anchor.y) -
        Math.hypot(b.x - room.anchor.x, b.y - room.anchor.y),
    );
}

/** Reserved routes are authoritative; furniture is accepted only after physical connectivity checks. */
export function generateInterior(options = {}) {
  const settings = normalizeOptions(options);
  const {
    width,
    height,
    seed,
    template,
    symmetry,
    corridorWidth,
    furnitureDensity,
    doors,
  } = settings;
  const random = seededRandom(`${seed}:interior:${template}`);
  const half = Math.floor(corridorWidth / 2);
  const vertical = Math.floor((width - corridorWidth) / 2);
  const horizontal = Math.floor((height - corridorWidth) / 2);
  const centerX = vertical + half;
  const centerY = horizontal + half;
  const map = {
    kind: "interior",
    schemaVersion: "1.0",
    seed,
    width,
    height,
    tiles: makeGrid(width, height, TILE.WALL),
    roadMask: makeGrid(width, height, false),
    walkable: [],
    entities: [],
    collisionRadius: CHARACTER_RADIUS,
    spawn: { x: centerX, y: centerY },
    doors,
    exits: doors.map((door) => ({ ...door })),
    rooms: [],
    regions: [],
    landmarks: doors.map((door) => ({ ...door })),
    mission: [],
    generation: {
      template,
      symmetry,
      corridorWidth,
      furnitureDensity,
      solver: "template-reserved-corridors",
      algorithm: "route-first-interior-v1",
      rejectedFurniture: 0,
      symmetryScope: "tiles-ground-footprints-and-room-types",
    },
  };
  const landmarkIds = new Set(map.landmarks.map((landmark) => landmark.id));
  const landmarkId = (base) => {
    let id = base;
    for (let suffix = 2; landmarkIds.has(id); suffix += 1)
      id = `${base}-${suffix}`;
    landmarkIds.add(id);
    return id;
  };
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) map.tiles[y][x] = TILE.FLOOR;
  }
  const reserve = (x, y, rectangleWidth, rectangleHeight) => {
    for (
      let row = Math.max(0, y);
      row < Math.min(height, y + rectangleHeight);
      row += 1
    ) {
      for (
        let column = Math.max(0, x);
        column < Math.min(width, x + rectangleWidth);
        column += 1
      ) {
        map.roadMask[row][column] = true;
        map.tiles[row][column] = TILE.FLOOR;
      }
    }
  };
  reserve(vertical, 1, corridorWidth, height - 2);
  reserve(1, horizontal, width - 2, corridorWidth);
  for (const door of doors) {
    if (door.side === "north")
      reserve(door.offset - half, 0, corridorWidth, centerY + half + 1);
    if (door.side === "south")
      reserve(
        door.offset - half,
        centerY - half,
        corridorWidth,
        height - centerY + half,
      );
    if (door.side === "west")
      reserve(0, door.offset - half, centerX + half + 1, corridorWidth);
    if (door.side === "east")
      reserve(
        centerX - half,
        door.offset - half,
        width - centerX + half,
        corridorWidth,
      );
  }
  const wall = (x, y, rectangleWidth, rectangleHeight) => {
    for (let row = y; row < y + rectangleHeight; row += 1) {
      for (let column = x; column < x + rectangleWidth; column += 1) {
        if (!map.roadMask[row][column]) map.tiles[row][column] = TILE.WALL;
      }
    }
  };
  const north = { x: 1, y: 1, width: vertical - 2, height: horizontal - 2 };
  const south = {
    x: 1,
    y: horizontal + corridorWidth + 1,
    width: vertical - 2,
    height: height - horizontal - corridorWidth - 2,
  };
  const eastX = vertical + corridorWidth + 1;
  const eastWidth = width - eastX - 1;
  wall(1, horizontal - 1, width - 2, 1);
  wall(1, horizontal + corridorWidth, width - 2, 1);
  if (template !== "workshop") {
    wall(vertical - 1, 1, 1, height - 2);
    wall(vertical + corridorWidth, 1, 1, height - 2);
  } else if (symmetry !== "quadrilateral") {
    wall(vertical - 1, south.y - 1, 1, height - south.y);
    wall(vertical + corridorWidth, south.y - 1, 1, height - south.y);
  }
  const addRoom = (id, type, rectangle, entrySide) => {
    const room = {
      id,
      type,
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
      entrySide,
      doors: [],
    };
    map.rooms.push(room);
    const offset =
      entrySide === "north" || entrySide === "south"
        ? room.x + Math.floor(room.width / 2)
        : room.y + Math.floor(room.height / 2);
    const low =
      entrySide === "north" || entrySide === "south" ? room.x : room.y;
    const span =
      entrySide === "north" || entrySide === "south" ? room.width : room.height;
    const start = Math.max(
      low,
      Math.min(low + span - corridorWidth, offset - half),
    );
    if (entrySide === "south") {
      reserve(start, room.y + room.height - 1, corridorWidth, 2);
      room.doors.push({
        x: start + half,
        y: room.y + room.height,
        side: entrySide,
        width: corridorWidth,
      });
    } else if (entrySide === "north") {
      reserve(start, room.y - 1, corridorWidth, 2);
      room.doors.push({
        x: start + half,
        y: room.y - 1,
        side: entrySide,
        width: corridorWidth,
      });
    } else if (entrySide === "east") {
      reserve(room.x + room.width - 1, start, 2, corridorWidth);
      room.doors.push({
        x: room.x + room.width,
        y: start + half,
        side: entrySide,
        width: corridorWidth,
      });
    } else {
      reserve(room.x - 1, start, 2, corridorWidth);
      room.doors.push({
        x: room.x - 1,
        y: start + half,
        side: entrySide,
        width: corridorWidth,
      });
    }
    return room;
  };
  const divideGuestWing = (rectangle, prefix, entrySide, reflected = false) => {
    const partition = rectangle.x + Math.floor(rectangle.width / 2);
    const left = { ...rectangle, width: partition - rectangle.x };
    const right = {
      ...rectangle,
      x: partition + 1,
      width: rectangle.x + rectangle.width - partition - 1,
    };
    wall(partition, rectangle.y, 1, rectangle.height);
    const opening =
      rectangle.y + Math.floor((rectangle.height - corridorWidth) / 2);
    reserve(partition - 1, opening, 3, corridorWidth);
    addRoom(`${prefix}-outer`, "guest", reflected ? right : left, entrySide);
    addRoom(`${prefix}-inner`, "guest", reflected ? left : right, entrySide);
  };
  if (template === "cottage") {
    addRoom(
      "northwest",
      symmetry === "quadrilateral" ? "living" : "bedroom",
      north,
      "east",
    );
    addRoom(
      "northeast",
      symmetry === "none"
        ? "kitchen"
        : symmetry === "quadrilateral"
          ? "living"
          : "bedroom",
      { ...north, x: eastX, width: eastWidth },
      "west",
    );
    addRoom("southwest", "living", south, "east");
    addRoom(
      "southeast",
      symmetry === "none" ? "storage" : "living",
      { ...south, x: eastX, width: eastWidth },
      "west",
    );
  } else if (template === "inn") {
    divideGuestWing(north, "northwest", "south");
    const eastNorth = { ...north, x: eastX, width: eastWidth };
    if (symmetry === "none") divideGuestWing(eastNorth, "northeast", "south");
    else {
      const mirrored = reflectedRectangle(north, width, height, true, false);
      const partition = width - 1 - (north.x + Math.floor(north.width / 2));
      wall(partition, mirrored.y, 1, mirrored.height);
      reserve(
        partition - 1,
        mirrored.y + Math.floor((mirrored.height - corridorWidth) / 2),
        3,
        corridorWidth,
      );
      for (const room of map.rooms.slice(0, 2))
        addRoom(
          room.id.replace("northwest", "northeast"),
          "guest",
          reflectedRectangle(room, width, height, true, false),
          "south",
        );
    }
    if (symmetry === "quadrilateral") {
      const partition = north.x + Math.floor(north.width / 2);
      const southPartition = height - north.y - north.height;
      wall(partition, southPartition, 1, north.height);
      wall(width - 1 - partition, southPartition, 1, north.height);
      const opening =
        height -
        (north.y + Math.floor((north.height - corridorWidth) / 2)) -
        corridorWidth;
      reserve(partition - 1, opening, 3, corridorWidth);
      reserve(width - 2 - partition, opening, 3, corridorWidth);
      for (const room of map.rooms.slice(0, 4))
        addRoom(
          room.id.replace("north", "south"),
          "guest",
          reflectedRectangle(room, width, height, false, true),
          "north",
        );
    } else {
      addRoom("southwest-lobby", "lobby", south, "north");
      addRoom(
        "southeast-common",
        symmetry === "none" ? "kitchen" : "lobby",
        { ...south, x: eastX, width: eastWidth },
        "north",
      );
    }
  } else {
    addRoom(
      "work-floor",
      "workshop",
      { x: 1, y: 1, width: width - 2, height: north.height },
      "south",
    );
    if (symmetry === "quadrilateral") {
      addRoom(
        "assembly-floor",
        "workshop",
        { x: 1, y: south.y, width: width - 2, height: south.height },
        "north",
      );
    } else {
      addRoom(
        "office",
        symmetry === "none" ? "office" : "storage",
        south,
        "east",
      );
      addRoom(
        "storeroom",
        "storage",
        { ...south, x: eastX, width: eastWidth },
        "west",
      );
    }
  }
  if (symmetry !== "none") {
    // Even-sized room wings can bias a centered doorway by one tile; reserve its whole mirror orbit.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!map.roadMask[y][x]) continue;
        reserve(width - x - 1, y, 1, 1);
        if (symmetry === "quadrilateral") {
          reserve(x, height - y - 1, 1, 1);
          reserve(width - x - 1, height - y - 1, 1, 1);
        }
      }
    }
  }
  rebuildNavigation(map);
  for (const room of map.rooms) {
    const candidates = [];
    const middle = {
      x: room.x + (room.width - 1) / 2,
      y: room.y + (room.height - 1) / 2,
    };
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (map.walkable[y][x]) candidates.push({ x, y });
      }
    }
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - middle.x, a.y - middle.y) -
        Math.hypot(b.x - middle.x, b.y - middle.y),
    );
    if (!candidates.length)
      throw new Error(`Template room ${room.id} has no usable floor.`);
    room.anchor = candidates[0];
    map.landmarks.push({
      id: landmarkId(`room-${room.id}`),
      label: room.type,
      kind: "room",
      ...room.anchor,
    });
  }
  if (!allNavigationConnected(map))
    throw new Error(
      "Interior template did not produce connected, character-safe routes.",
    );

  const transforms =
    symmetry === "quadrilateral"
      ? [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ]
      : symmetry === "bilateral"
        ? [
            [false, false],
            [true, false],
          ]
        : [[false, false]];
  const handledRooms = new Set();
  for (const room of map.rooms) {
    if (handledRooms.has(room.id)) continue;
    const orbitRooms = transforms.map(([flipX, flipY]) => {
      const bounds = reflectedRectangle(room, width, height, flipX, flipY);
      return map.rooms.find(
        (item) =>
          item.x === bounds.x &&
          item.y === bounds.y &&
          item.width === bounds.width &&
          item.height === bounds.height,
      );
    });
    if (orbitRooms.some((item) => !item))
      throw new Error(
        "Template room geometry does not satisfy its declared symmetry.",
      );
    orbitRooms.forEach((item) => handledRooms.add(item.id));
    if (furnitureDensity === 0) continue;
    const types = FURNITURE[room.type];
    const amount = 1 + Math.floor(furnitureDensity * 2);
    for (let item = 0; item < amount; item += 1) {
      const type = types[item];
      for (const candidate of furnitureCandidates(room, type, random)) {
        const additions = [];
        const seen = new Set();
        for (let transform = 0; transform < transforms.length; transform += 1) {
          const [flipX, flipY] = transforms[transform];
          const bounds = reflectedRectangle(
            candidate,
            width,
            height,
            flipX,
            flipY,
          );
          const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
          if (seen.has(key)) continue;
          seen.add(key);
          additions.push({
            ...bounds,
            id: `furniture-${room.id}-${item}-${transform}`,
            roomId: orbitRooms[transform].id,
            solid: true,
            sprite: type,
            label: type,
            anchor: { x: 0.5, y: 1 },
            visual: {
              offsetX: 0,
              offsetY: -0.25,
              width: bounds.width,
              height: bounds.height + 0.25,
            },
          });
        }
        const collides = additions.some((entity, index) => {
          for (let y = entity.y; y < entity.y + entity.height; y += 1) {
            for (let x = entity.x; x < entity.x + entity.width; x += 1) {
              if (map.tiles[y]?.[x] !== TILE.FLOOR || map.roadMask[y][x])
                return true;
            }
          }
          const contains = (point) =>
            point.x >= entity.x &&
            point.x < entity.x + entity.width &&
            point.y >= entity.y &&
            point.y < entity.y + entity.height;
          if (map.landmarks.some(contains)) return true;
          return [...map.entities, ...additions.slice(0, index)].some(
            (other) =>
              entity.x < other.x + other.width &&
              entity.x + entity.width > other.x &&
              entity.y < other.y + other.height &&
              entity.y + entity.height > other.y,
          );
        });
        if (collides) continue;
        const oldCount = map.entities.length;
        map.entities.push(...additions);
        rebuildNavigation(map);
        const approaches = additions.map((entity) => {
          const entityRoom = map.rooms.find(
            (entry) => entry.id === entity.roomId,
          );
          return approachCandidates(entity, entityRoom).find(
            (point) => map.walkable[point.y][point.x],
          );
        });
        const accessible =
          approaches.every(Boolean) &&
          map.entities
            .slice(0, oldCount)
            .every(
              (entity) =>
                !entity.approach ||
                map.walkable[entity.approach.y][entity.approach.x],
            ) &&
          allNavigationConnected(map);
        if (accessible) {
          additions.forEach((entity, index) => {
            entity.approach = approaches[index];
          });
          break;
        }
        map.entities.length = oldCount;
        rebuildNavigation(map);
        map.generation.rejectedFurniture += additions.length;
      }
    }
  }
  for (const entity of map.entities) {
    map.landmarks.push({
      id: landmarkId(`use-${entity.id}`),
      label: entity.type,
      kind: "use",
      entityId: entity.id,
      ...entity.approach,
    });
  }
  map.regions = map.rooms.map(
    ({ id, type, x, y, width: roomWidth, height: roomHeight }) => ({
      id,
      type,
      x,
      y,
      width: roomWidth,
      height: roomHeight,
    }),
  );
  map.generation.furnitureCount = map.entities.length;
  map.report = validateMap(map);
  if (!map.report.passed)
    throw new Error(
      `Generated interior failed validation: ${map.report.issues.join(" ")}`,
    );
  return map;
}
