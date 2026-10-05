# SDK Operations And Boundaries

This repository contains `@mossbrook/map-sdk` version `0.3.0` at `packages/map-sdk`. GitHub availability does not imply npm registry publication. In the checkout, use its documented package setup or `npm run sdk:pack` to obtain a local package archive.

```js
import {
  createMapSDK,
  createArtPlan,
  findPath,
  canTraverse,
  rebuildNavigation,
  assertValidMap,
} from "@mossbrook/map-sdk";

const sdk = createMapSDK({ seed: 1042 });
const town = sdk.generateTown({
  layout: "symmetric",
  width: 49,
  height: 49,
  roadWidth: 3,
  buildingCount: 16,
  perimeterWalls: true,
});
const interior = sdk.generateBuildingInterior(town, town.buildings[0].id);
const art = createArtPlan(town, { preset: "generic", tileSize: 32 });
console.log(town.report.passed, art.statistics.collisionChanges);
console.log(findPath(town, town.spawn, town.exits[0]));

// Test arbitrary continuous movement against the actual geometry.
console.log(canTraverse(town, { x: 24.5, y: 24.5 }, { x: 24.5, y: 25.5 }));

// After external geometry edits, not after purely visual changes:
rebuildNavigation(town);
assertValidMap(town);
```

## Towns

| Layout | Current contract |
| --- | --- |
| `organic` | Default, fixed `48x36`, five houses, road width 3; `density` in `0..1` |
| `symmetric` | Odd dimensions `25..129`; square maps preserve D4 rotation/reflection, rectangles preserve X/Y reflection |
| `grid` | Dimensions `25..129`, even sizes allowed; regular blocks and four-direction main roads |

All have north/east/south/west boundary exits and validate inter-exit routes. Structured road widths are `3`, `5`, or `7`. Symmetric explicit building counts must be multiples of four; an explicit count that does not fit is rejected. `perimeterWalls` applies to structured towns, with four main road openings. Read all `building.doors[]`; the compatibility `door` property may not enumerate every entrance. Art roof perspective is not part of physical symmetry.

## Interiors

| Template | Default size | Minimum size |
| --- | --- | --- |
| `cottage` | `17x15` | `15x15` |
| `inn` | `23x19` | `21x19` |
| `workshop` | `21x17` | `17x15` |

Maximum dimensions are `101x101`. `corridorWidth` is odd and at least 3; wider corridors can require larger rooms. `furnitureDensity` is in `0..1`. `symmetry` is `none`, `bilateral` (X), or `quadrilateral` (X/Y); symmetric dimensions must be odd and explicit door sets must obey the symmetry. A door `{ side, offset?, id? }` uses an integer edge coordinate, not a percentage. Without explicit doors, quadrilateral interiors use all four sides; other modes use a south door.

`generateBuildingInterior` returns `parent` and `connections` and derives a stable seed. Scene transitions, dialogue, saves, and NPC schedules are the engine's responsibility. Custom inside doors must include every external entrance orientation.

## Coordinates And Validation

- All grids use `[y][x]`. Tiles, portals, landmarks, and path results use integer tile indices.
- A tile `(x,y)` has continuous center `(x+0.5,y+0.5)`. `canOccupy`, `canTraverse`, and `findPathFromPosition` use continuous map coordinates.
- The default circular radius is `0.28` map units. The consuming game must use a compatible radius, or validate with its configured map radius.
- `entity.solid` and root/footprint geometry determine collision. `entity.visual` is a separate sprite rectangle in map units, not a hitbox.
- `maximalRectangle(walkable)` returns the largest rectangle of valid grid centers. A thin entity between centers can still interrupt traversal across that rectangle.
- Navigation uses four-direction movement with geometry checks. The reports include connected components, required landmarks/exits, mismatch cells, protected road cells, route clearance, and requested symmetry.
- Generation rejects invalid arguments/results. `assertValidMap` throws `MapValidationError` with `report` if an externally edited map fails.

## Art Plan

`createArtPlan` does not mutate terrain, entities, navigation, or collision and performs no image generation/network/DOM calls. Choose `preset: "generic"` for portable maps; do not depend on the default specialized preset.

- `materials` copies terrain IDs. `transitions` stores N/NE/E/SE/S/SW/W/NW bits `1/2/4/8/16/32/64/128`; a diagonal requires both adjacent cardinal bits. This yields 47-Blob masks, not 47 image tiles.
- Distance fields use multi-source Manhattan BFS; shade/traffic/moisture are heuristics, not physical lighting or hydrology.
- `protected` marks art exclusion zones, not authoritative new walkability. Respect it alongside the original physical map.
- `groundDecals` and `contactShadows` are drawing instructions without bitmap files.
- `decorations` are `solid: false`, with separate root/visual ranges and group IDs. `collisionChanges` is 0.
- `generic` and `plain` provide base planning and applicable details, not a finished forest composition. Both can contain decals and shadows.
- The specialized `fangcun` cluster extension is active only for `sceneId === "courtyard"` and is authored for the original `60x36` courtyard geometry; merely adding that ID to an arbitrary map does not generalize it. Its scene-specific sprite keys/assets are not included in the public package. It samples group anchors and then members using `poisson-disk-sampling`. Do not label this a generic automatic landscape generator.

## WFC Is Optional

The SDK implements templates and constrained placement, not Wave Function Collapse. A third-party WFC adapter can fill local floor/wall/furniture patterns after portals/main corridors are frozen. Local adjacency alone does not prove global connectivity. Apply mirrored edits when required, reconstruct collisions/navigation, and run the same validators. Reject or retry finitely on contradiction/unreachable results. Do not import a WFC dependency merely to rename the current algorithm.

## Repository Commands

```sh
npm run generate -- --layout symmetric --width 49 --height 49 --walls --out output/city.json --art-out output/city-art.json
npm run generate -- --kind interior --template inn --symmetry quadrilateral --out output/inn.json
npm run validate -- --input output/city.json
npm run examples
npm test
npm run check:types
npm run demo
npm run sdk:pack
```

Command availability belongs to the repository checkout, not to an independently installed skill folder. Inspect the package scripts if the project differs.
