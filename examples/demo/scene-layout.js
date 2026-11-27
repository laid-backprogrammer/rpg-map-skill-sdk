/** Placement for the HD-2D preview. Reads footprints only and does not edit the map. */

export function spinFor(id) {
  let hash = 2166136261;
  for (const character of String(id)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 628) / 100;
}

export function sceneProps(map) {
  const props = [];
  for (const entity of map.entities ?? []) {
    let kind = null;
    if (entity.type === "tree" && entity.solid) kind = "oak";
    else if (entity.id === "village-well") kind = "well";
    else if (entity.type === "cottage" || entity.type === "lodge" || entity.type === "workshop") kind = "lodge";
    if (!kind) continue;
    props.push({
      id: entity.id,
      kind,
      x: entity.x + entity.width / 2,
      z: entity.y + entity.height / 2,
      yaw: kind === "lodge" ? 0 : spinFor(entity.id),
      footprint: { x: entity.x, z: entity.y, width: entity.width, depth: entity.height },
    });
  }
  return props;
}
