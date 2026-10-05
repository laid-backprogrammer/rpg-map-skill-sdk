import { mkdir, writeFile } from "node:fs/promises";
import { createMapSDK } from "@mossbrook/map-sdk";

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
