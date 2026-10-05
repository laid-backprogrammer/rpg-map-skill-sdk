import {
  createArtPlan,
  createMapSDK,
  generateTown,
  generateInterior,
  generateBuildingInterior,
  validateMap,
  findPathFromPosition,
  TILE,
  type TownMap,
  type InteriorMap,
} from "@mossbrook/map-sdk";

const sdk = createMapSDK({ seed: "typed" });
const city: TownMap = sdk.generateTown({
  layout: "symmetric",
  width: 49,
  height: 49,
  perimeterWalls: true,
});
const room: InteriorMap = generateInterior({
  template: "inn",
  symmetry: "quadrilateral",
});
const linked: InteriorMap = generateBuildingInterior(
  city,
  city.buildings[0].id,
);
const route = findPathFromPosition(city, { x: 24.5, y: 24.5 }, city.exits[0]);
validateMap(linked).exitResults.map((result) => result.reachable);
sdk.findPath(room, room.spawn, room.doors[0]);
route.map((point) => point.x);
TILE.FLOOR;
const art = createArtPlan(city, { seed: 'paint', preset: 'generic' });
sdk.createArtPlan(room).fields.moisture.map(row => row.map(value => value));
art.decorations.map(prop => prop.visual.offsetX);
art.contactShadows.map(shadow => shadow.parentId);
// @ts-expect-error Art presets are a closed public contract.
createArtPlan(city, { preset: 'unrecognized' });

// @ts-expect-error Layout values are a closed public contract.
generateTown({ layout: "random-unknown" });
// @ts-expect-error Door sides must be cardinal.
generateInterior({ doors: [{ side: "diagonal" }] });
// @ts-expect-error Factory defaults intentionally only include the seed.
createMapSDK({ layout: "symmetric" });
