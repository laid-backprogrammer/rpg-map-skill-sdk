# Changelog

## 0.4.0

- Art plans can describe opt-in sprite stacks for heighted props. A stack records
  slice count, uniform or per-slice spacing, pivot, world height, and the
  existing ground footprint. Depth sorting stays on the world foot. Stack
  height does not change collision, navigation, door clearance, or walkability.
  Props without a stack remain single sprites. `statistics.collisionChanges`
  stays 0. The art-plan version string remains `1.0`.
- Added an inspectable beginner-village example on the organic town. It stacks
  sample trees, the village well, and the wayfarer lodge, and includes a short
  prologue. The physical layout is unchanged.
- The blockout inspector can preview those stacks as placeholder slices with a
  tilt control. The preview does not change collision or navigation.
- `npm run demo` also serves an HD-2D village scene at `/scene.html`. Painted
  slices of the oak, well, and lodge are stacked on the organic footprints
  under a warm orbit camera. Other houses reuse the lodge slices.

## 0.3.0 - First Public Release

- Extracted the existing renderer-independent map SDK into a standalone repository.
- Included organic, symmetric and grid towns, four boundary exits, three interior
  templates and stable exterior/interior portal links.
- Included radius-aware occupancy and swept movement checks, A* routes, connected
  component validation and structural symmetry validation.
- Included render-only art plans with Blob masks, heuristic fields, protected
  paths, decals, contact shadows and a clearly scoped courtyard cluster preset.
- Added installable map-production and optional original-voice video skills.
- Added CLI generation/validation, a six-preset Canvas inspector, source-only
  layout previews, TypeScript checking and independent package-install testing.
- Tightened public town input validation for non-boolean perimeterWalls values.
- Excluded all private artwork, recorded audio, finished videos, commercial
  fonts, local paths and credentials from the public repository.

No npm registry publication, AI image service, WFC solver, sprite-atlas builder
or full game engine is included in this release.
