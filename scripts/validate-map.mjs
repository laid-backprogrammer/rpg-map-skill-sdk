import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { rebuildNavigation, validateMap } from "@mossbrook/map-sdk";

try {
  const { values } = parseArgs({ options: {
    input: { type: "string" }, rebuild: { type: "boolean" }, out: { type: "string" },
  } });
  if (!values.input) throw new Error("Use --input MAP.json; optionally --rebuild and --out REPORT.json.");
  const map = JSON.parse(await readFile(values.input, "utf8"));
  if (values.rebuild) rebuildNavigation(map);
  const report = validateMap(map);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (values.out) await writeFile(values.out, json, "utf8");
  console.log(json.trim());
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
