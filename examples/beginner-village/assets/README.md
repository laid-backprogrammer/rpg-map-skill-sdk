# Beginner village paintings

These files are example art for the HD-2D preview. They are not part of the `@mossbrook/map-sdk` package and they do not change collision.

`source/` keeps the supplied paintings. `scripts/process-hd2d-slices.mjs` keys out the magenta and drops side-view cells, then builds a dense stack on a shared center pivot: 36 oak slices (height about 2.4), 34 well slices (about 1.7), and 44 lodge slices (about 3.3). Spacing is about 0.05–0.08 map units.

The oak’s lower third is the trunk disc. Above that, canopy slices have the stump hole filled and taper toward the crown. The well repeats one top-down stone course and finishes with the wooden lid. The lodge is a stone foundation, two furnished decks, repeated wall rings, and a roof that narrows toward the ridge. `stacks.json` is the frame list the scene loads.

Open the scene with `npm run demo`, then go to `/scene.html` or choose **HD-2D scene** in the inspector.
