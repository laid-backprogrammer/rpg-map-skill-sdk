import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runNpm(args, cwd) {
  // Invoking the JS entry directly avoids Windows .cmd quoting and shell injection.
  const cli = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  if (!existsSync(cli)) throw new Error("Run this helper through npm run so npm_execpath is available.");
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `npm exited ${result.status}`);
  return result.stdout;
}
