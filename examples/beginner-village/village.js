import { findPath } from "../../packages/map-sdk/src/index.js";

/** Same physics as `generateTown({ layout: "organic", seed: 1042 })`. */
export const BEGINNER_VILLAGE = {
  id: "beginner-village",
  seed: 1042,
  layout: "organic",
  artPreset: "generic",
};

export const STORY = {
  id: "beginner-village",
  title: "A Letter by the Well",
  titleZh: "井边来信",
  summary:
    "You walk into a small prologue village. The roads and doorways are already fixed. A few trees, the well, and the lodge are drawn as stacked slices, and that height does not move the ground you walk on.",
  summaryZh:
    "你走进一座序章小村。道路和门口已经定好。几棵树、水井和旅店只用切片叠出高度，高度不会改你脚下的路。",
  beats: [
    {
      id: "arrival",
      title: "Arrival",
      titleZh: "抵达",
      text: "You come in on the south road and stop where the path opens toward the square. The well is ahead, and the wayfarer lodge is the tall roof to the north-east. Nothing in that height blocks the road.",
      textZh: "你沿南边的土路进来，停在通向广场的路口。前面是水井，东北方向是旅店的屋顶。这些高度没有挡住路。",
      anchor: { kind: "spawn" },
    },
    {
      id: "notice",
      title: "Notice board",
      titleZh: "告示",
      text: "A board by the lane carries one unsigned note: a copper bell was lost under the willows by the bridge. Bring it to the elder if you find it. This is a small errand, not the end of the story.",
      textZh: "路边的告示牌上钉着一张没署名的纸条：桥边柳树下丢了一只铜铃，拾到请交给村长。这是一件小事，不是故事的结局。",
      anchor: { kind: "entity-type", type: "noticeboard" },
    },
    {
      id: "elder",
      title: "The elder",
      titleZh: "村长",
      text: "The elder waits by the cottage door. She asks you to walk the village first: the board, her door, and the well. She does not move the houses to make the picture prettier.",
      textZh: "村长等在老宅门口。她只要你先把村子走通：告示、她家的门，还有水井。她不会为了画面好看去挪房子。",
      anchor: { kind: "landmark", id: "elder" },
    },
    {
      id: "departure",
      title: "The north road",
      titleZh: "北路",
      text: "When you are ready, take the main road to the north exit. That is the first way out of the prologue. The other gates stay open, and the stacked trees still leave the same gaps as before.",
      textZh: "准备好以后，沿主路走到北出口。那是序章的第一段出路。其余出口仍然开着，叠起来的树也留着原来的空隙。",
      anchor: { kind: "exit", id: "north" },
    },
  ],
};

function heightedProps(map) {
  const trees = map.entities
    .filter((entity) => entity.type === "tree" && entity.solid)
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || String(a.id).localeCompare(String(b.id)));
  const west = trees.filter((tree) => tree.x < 8).slice(0, 3);
  const well = map.entities.find((entity) => entity.id === "village-well");
  const inn = map.entities.find((entity) => entity.id === "guest-lodge");
  if (!well || !inn)
    throw new Error("Beginner village art expects the organic well and guest lodge.");
  return { trees: west.length >= 3 ? west : trees.slice(0, 3), well, inn };
}

/** Opt-in stacks for sample trees, the well monument, and the lodge. Other props stay single sprites. */
export function spriteStacksFor(map) {
  const { trees, well, inn } = heightedProps(map);
  return [
    ...trees.map((tree) => ({
      footprintId: tree.id,
      sliceCount: 7,
      spacing: 0.36,
      height: 2.16,
      pivot: { x: 0.5, y: 1 },
      sprite: "tree",
    })),
    {
      footprintId: well.id,
      sliceCount: 5,
      height: 1.35,
      pivot: { x: 0.5, y: 1 },
      sprite: "well",
      slices: [
        { sprite: "well_base" },
        { spacing: 0.42, sprite: "well_course" },
        { spacing: 0.38, sprite: "well_course" },
        { spacing: 0.32, sprite: "well_lip" },
        { spacing: 0.23, sprite: "well_cap" },
      ],
    },
    {
      footprintId: inn.id,
      sliceCount: 4,
      spacing: 0.55,
      height: 1.65,
      pivot: { x: 0.5, y: 1 },
      sprite: "lodge",
      slices: [
        { sprite: "lodge_foundation" },
        { spacing: 0.55, sprite: "lodge_wall" },
        { spacing: 0.55, sprite: "lodge_eaves" },
        { spacing: 0.55, sprite: "lodge_roof" },
      ],
    },
  ];
}

export function artOptionsFor(map, seed = map.seed ?? BEGINNER_VILLAGE.seed) {
  return { seed, preset: BEGINNER_VILLAGE.artPreset, spriteStacks: spriteStacksFor(map) };
}

function anchorPoint(map, anchor) {
  if (anchor.kind === "spawn") return map.spawn;
  if (anchor.kind === "landmark") return map.landmarks?.find((item) => item.id === anchor.id) ?? null;
  if (anchor.kind === "exit") return map.exits?.find((item) => item.id === anchor.id) ?? null;
  if (anchor.kind === "entity-type") {
    const entity = map.entities.find((item) => item.type === anchor.type);
    return entity ? { x: entity.x, y: entity.y, entityId: entity.id } : null;
  }
  return null;
}

function reachableTile(map, origin) {
  if (!origin) return null;
  const startX = Math.floor(origin.x);
  const startY = Math.floor(origin.y);
  for (let radius = 0; radius <= 2; radius += 1) {
    const ring = [];
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if (Math.max(Math.abs(x - startX), Math.abs(y - startY)) !== radius) continue;
        if (map.walkable?.[y]?.[x]) ring.push({ x, y });
      }
    }
    const tile = ring.find((point) => findPath(map, map.spawn, point).length > 0);
    if (tile) return tile;
  }
  return null;
}

/** Story beats with map anchors. Does not edit the map. */
export function storyFor(map) {
  return {
    ...STORY,
    seed: map.seed ?? BEGINNER_VILLAGE.seed,
    layout: BEGINNER_VILLAGE.layout,
    beats: STORY.beats.map((beat) => {
      const origin = anchorPoint(map, beat.anchor);
      const point = reachableTile(map, origin);
      const route = point ? findPath(map, map.spawn, point) : [];
      return {
        ...beat,
        anchorId: origin?.entityId ?? origin?.id ?? beat.anchor.kind,
        point,
        pathLength: Math.max(0, route.length - 1),
        reachable: route.length > 0,
      };
    }),
  };
}
