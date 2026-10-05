# Art And Animation Acceptance

## Scene Asset Contract

Maintain an engine-side manifest independent of SDK map JSON. For every asset, record ID, semantic role, source/license, canvas size, alpha mode, style scale, untrimmed pixel anchor, map-space visual size, sort-foot position, and optional roof/canopy occluder parts. Keep collision geometry in the physical map, not hidden inside image pixels.

Ground plates must match the map aspect ratio, camera projection, roads, shoreline, and material masks. Do not bake tall interactive entities or their permanent shadows into the ground. Use separate root soil/contact shadows for integration. The image must not suggest an obstacle where physics is walkable, or a door where no doorway exists. If the model drifts, constrain/reference/regenerate the image or keep a procedural fallback; do not move a proven layout to match an attractive picture without explicit approval and revalidation.

World placement follows a single convention, for example:

```text
footWorldPx = footWorldUnits * tileSize
imageOriginPx = footWorldPx - frameAnchorPx * drawScale
sortDepth = footWorldUnits.y
```

Asset pixel anchors are not SDK `Entity.anchor` values. SDK `visual.offsetX/offsetY/width/height` are map units. Convert once in the engine adapter. Roof/canopy occlusion is a rendering rule; it must not change collision or silently reveal hidden story objects.

## Directional Walk Sheets

Choose four or eight directions from the game's camera and input model. Give every direction the same frame count, fixed canvas, anchor, scale, light source, costume, and cycle phase. A baseline eight-frame loop is: left contact, left down, left passing, left up/right precontact, right contact, right down, right passing, right up/left precontact. Angles change the projected silhouette, not the phase definition.

Generate against a contact sheet with numbered slots and a consistent reference character. Validate each frame rather than assuming a large generated sheet is correctly segmented. Store frames untrimmed or carry exact trim offsets. Do not stretch one pose and call it a walk cycle.

- Contacts alternate at half-cycle separation. The support foot remains approximately planted in world space during its contact interval; locomotion displacement and animation speed must agree.
- Arm swing opposes the legs. Body rise/fall is modest. Long robes are non-rigid and lag the pelvis; they must not move as a single pasted rectangle.
- Side views need visible alternating foot silhouette or ankle/hem cues. Mirroring a side sequence is acceptable only if costume, weapon, and handedness allow it; do not flip asymmetrical equipment silently.
- Front/back/side frames share one foot anchor. No frame-specific root jitter, accidental crop, missing/duplicate pose, extra limb, changing face, or inconsistent weapon grip.
- Check loop last-to-first continuity, idle-to-walk transitions, diagonal changes if present, and slow-motion playback with collision/debug feet visible.

Special actions such as growth, extra limbs, or a heavy weapon swing need explicit anticipation/contact/recovery phases, consistent anchors, separate FX as appropriate, and hit/occlusion timings supplied by gameplay. Generated images alone do not define damage or collision.

## Integration QA

Compare artwork over blockout before importing it. Verify asset files exist, alpha edges, canvas/frame counts, exact frame bounds, anchor projection, foreground rules, and semantic sprite-key mapping. Walk a character behind and in front of a tree/building, through every door, and along a narrow corridor. Check desktop/mobile viewports for unreadable pixels, clipped sprites, repeated grid artifacts, and UI overlap.

Do not distribute user media, commercial font files, generated assets, or third-party audio merely because workflow source code is MIT-licensed. Record each asset's permission separately. Keep provider credentials out of prompts, manifests, commits, and logs. Placeholder-only output is a legitimate verified result when an image service is unavailable.
