# Beginner village paintings

These files are example art for the HD-2D preview. They are not part of the `@mossbrook/map-sdk` package and they do not change collision.

`source/` keeps the supplied paintings. Magenta backgrounds on the atlases were keyed out by `scripts/process-hd2d-slices.mjs`. `slices/` holds the horizontal slices, ordered from the ground upward, on a shared center pivot. Side-view cells in the oak and well sheets were left out. `stacks.json` is what the scene loads.

Open the scene with `npm run demo`, then go to `/scene.html` or choose **HD-2D scene** in the inspector.
