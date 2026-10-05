---
name: rpg-map-workflow
description: Build or refine playable 2D RPG towns and interiors using a validated blockout, separate art contracts, and constrained asset generation. Use for procedural layouts, four-exit symmetric towns, interior templates, natural terrain dressing, sprite integration, and collision or occlusion QA; not for generating an unconstrained single scene image.
---

# RPG Map Workflow

Produce a playable map before commissioning final artwork. Treat physical layout, image appearance, and story state as separate contracts. Use the bundled SDK when available; when installed as a standalone skill, locate the user's SDK checkout or equivalent map implementation rather than inventing a local absolute path or assuming an npm release exists.

## Choose The Scope

- Inspect the existing engine, map schema, renderer, tests, and asset licenses. Preserve a user-selected setting and existing assets; this workflow is not tied to a particular village or mythological setting.
- Select `organic`, `symmetric`, or `grid` for towns; `cottage`, `inn`, or `workshop` for interiors. Read [references/sdk-operations.md](references/sdk-operations.md) for the SDK's real options and limits.
- Record dimensions, seed, character radius, required doors/exits, story interaction points, visual style, and whether AI image tools are actually available. AI providers are optional external adapters, never a dependency of map generation.
- Distinguish implemented SDK behavior from proposed extensions. WFC, generalized semantic decoration generators, an image-generation service, a sprite-atlas builder, and a game engine are not supplied by this SDK.

## Freeze Physics First

1. Generate terrain, protected roads, building footprints, entrances, and interaction approach points with simple geometry. A maximum walkable rectangle is a capacity reference, not a building-packing algorithm or proof that every continuous point inside it is clear.
2. Validate connected components and every required destination. Use BFS for reachability and A* for routes, with the actual circular character radius and collision geometry checked along each entire movement edge. Free endpoints alone do not prove a passage is safe.
3. For symmetry, place/edit whole mirror or rotation groups, including entrance approaches. Keep four boundary exits and their protected road corridors. Interior templates must preserve doors, room approaches, and furniture access, not just open floor tiles.
4. Save the seed, parameters, map, validation report, and blockout preview. Reject failed results rather than returning an attractive but unreachable map. Any later footprint change must rebuild navigation and repeat validation.

## Add Art Without Replanning Physics

Read [references/art-and-animation.md](references/art-and-animation.md) before commissioning or integrating images.

- Call `createArtPlan` for materials, constrained 47-Blob adjacency masks, heuristic fields, protected areas, decals, shadows, and render-only decorations. These are data, not a finished tileset, AI-generated image, or collision replacement.
- Prefer one coherent ground plate or an engine tileset for ground, with independently generated buildings, trees, furniture, characters, and effects. Supply blockout and masks as image references when the tool supports them. Prompt text alone is not a geometry guarantee.
- Ground artwork must not invent visually solid walls, trunks, deep water, doors, stairs, or tall objects that contradict the physical map. Decorative patches can vary inside approved material regions.
- Use semantic groups and variable-distance Poisson sampling for natural dressing: group anchors first, members second, with protected roads/door approaches excluded. Describe this as an external extension for generic maps; the shipped specialized cluster preset is limited to its documented scene contract.
- Keep collision footprints, sprite visual bounds, image pixel anchors, depth-sort feet, and optional occluder parts separate. Trees may overlap visually while their roots cannot block a reserved path.
- Render: ground -> ground decals/contact shadows -> foot-depth-sorted entities -> conditional roof/canopy foreground -> effects. Do not put every tree canopy unconditionally above every actor; test front/back and partial transparency.

## Coordinate Agents And Close The Loop

For a larger task, delegate independent roles: layout/navigation owner, art planner, asset creator, renderer integrator, and QA reviewer. Share one versioned map/asset contract, not competing map edits. Each role returns changed files, contract version, validation evidence, unresolved issues, and source/license records. Only the layout owner changes collision; only the integrator accepts an asset into the renderer.

Set a finite budget before expensive generation. A useful default is at most three asset candidates per slot and two layout regeneration attempts; adjust to the user's resources. Retry the failed slot only, with the rejected contract violation recorded. If the budget is exhausted, keep the last valid blockout or placeholder and report the blocker. Do not spend indefinitely or silently add a new provider/account.

Complete with actual checks: deterministic same-seed output, portals and landmarks reachable, swept-circle edge clearance, footprint/navigation consistency, mirrored layout where requested, protected roads unchanged, material/anchor/frame completeness, front/back occlusion, and desktop/mobile visual inspection in the consuming game. Unit tests alone do not establish render correctness. Report missing tools or tests, and do not fabricate token savings, public links, benchmark numbers, or zero-bug guarantees.

The companion repository provides Chinese explanations in `docs/workflow.md` and `docs/asset-contract.md`. This skill's references retain the essential instructions when installed independently.
