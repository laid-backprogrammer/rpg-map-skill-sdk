import { mkdir, writeFile } from "node:fs/promises";
import { createArtPlan, createMapSDK } from "@mossbrook/map-sdk";
import { artOptionsFor, storyFor } from "../examples/beginner-village/village.js";

const sdk = createMapSDK({ seed: 1042 });
const directory = new URL("../output/sdk-examples/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const layout of ["organic", "symmetric", "grid"]) {
  const town = sdk.generateTown({
    layout,
    perimeterWalls: layout !== "organic",
  });
  await writeFile(
    new URL(`town-${layout}.json`, directory),
    JSON.stringify(town, null, 2),
  );
  console.log(
    `${layout}: ${town.buildings.length} houses, ${town.exits.length} exits, ${town.report.reachablePercent}% reachable`,
  );
}
for (const template of ["cottage", "inn", "workshop"]) {
  const interior = sdk.generateInterior({
    template,
    symmetry: "quadrilateral",
  });
  await writeFile(
    new URL(`interior-${template}.json`, directory),
    JSON.stringify(interior, null, 2),
  );
  console.log(
    `${template}: ${interior.rooms.length} rooms, ${interior.doors.length} doors, ${interior.report.reachablePercent}% reachable`,
  );
}
const village = sdk.generateTown({ layout: "organic" });
const villageArt = createArtPlan(village, artOptionsFor(village));
const story = {
  ...storyFor(village),
  mapFile: "beginner-village.json",
  artFile: "beginner-village-art.json",
  collisionChanges: villageArt.statistics.collisionChanges,
  stackedFootprints: villageArt.spriteStacks.map((stack) => ({
    footprintId: stack.footprintId,
    sprite: stack.sprite,
    sliceCount: stack.sliceCount,
    spacingMode: stack.spacingMode,
    height: stack.height,
    collision: stack.collision,
  })),
};
await writeFile(new URL("beginner-village.json", directory), JSON.stringify(village, null, 2));
await writeFile(new URL("beginner-village-art.json", directory), JSON.stringify(villageArt, null, 2));
await writeFile(new URL("beginner-village-story.json", directory), `${JSON.stringify(story, null, 2)}\n`);
console.log(
  `beginner-village: ${villageArt.statistics.spriteStackCount} sprite stacks, collision changes ${villageArt.statistics.collisionChanges}`,
);
