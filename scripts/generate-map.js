import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateTown, generateInterior, createArtPlan } from "@mossbrook/map-sdk";

try {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      kind: { type: "string", default: "town" },
      layout: { type: "string" }, template: { type: "string" },
      seed: { type: "string", default: "1042" },
      width: { type: "string" }, height: { type: "string" },
      "road-width": { type: "string" }, "building-count": { type: "string" },
      density: { type: "string" }, "corridor-width": { type: "string" },
      "furniture-density": { type: "string" }, symmetry: { type: "string" },
      "four-doors": { type: "boolean" }, walls: { type: "boolean" },
      out: { type: "string" }, "art-out": { type: "string" },
      preset: { type: "string", default: "generic" },
    },
  });
  if (values.help) {
    console.log(`Generate validated RPG map JSON. No AI or API key required.

Town: --layout organic|symmetric|grid --seed STRING --width N --height N
      --road-width 3|5|7 --building-count N --density 0..1 --walls
Room: --kind interior --template cottage|inn|workshop
      --symmetry none|bilateral|quadrilateral --four-doors
      --corridor-width N --furniture-density 0..1
Files: --out MAP.json --art-out ART.json --preset generic|plain|fangcun
With no --out the complete map JSON is written to stdout.
Organic is fixed at 48x36 with five houses; other layouts are configurable.`);
  } else {
    if (!["town", "interior"].includes(values.kind))
      throw new RangeError("kind must be town or interior.");
    if (values.out && values["art-out"] && resolve(values.out) === resolve(values["art-out"]))
      throw new RangeError("Map and art output paths must be different.");
    const numeric = (name) => values[name] === undefined ? undefined : Number(values[name]);
    const common = { seed: values.seed, width: numeric("width"), height: numeric("height") };
    const map = values.kind === "town"
      ? generateTown({
        ...common, layout: values.layout, roadWidth: numeric("road-width"),
        buildingCount: numeric("building-count"), density: numeric("density"),
        perimeterWalls: values.walls,
      })
      : generateInterior({
        ...common, template: values.template, symmetry: values.symmetry,
        corridorWidth: numeric("corridor-width"), furnitureDensity: numeric("furniture-density"),
        doors: values["four-doors"] ? ["north", "east", "south", "west"].map((side) => ({ side })) : undefined,
      });
    const art = values["art-out"] ? createArtPlan(map, { preset: values.preset }) : null;
    const save = async (path, data) => {
      await mkdir(dirname(resolve(path)), { recursive: true });
      await writeFile(resolve(path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
    };
    if (art) await save(values["art-out"], art);
    if (values.out) {
      await save(values.out, map);
      console.log(JSON.stringify({
        path: resolve(values.out), artPath: art ? resolve(values["art-out"]) : null,
        kind: map.kind, dimensions: [map.width, map.height], passed: map.report.passed,
        exits: map.exits.length, components: map.report.components,
      }));
    } else console.log(JSON.stringify(map, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
