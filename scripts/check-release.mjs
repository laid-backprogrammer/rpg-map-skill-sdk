import { readdir, readFile, lstat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules", "output"]);
const allowed = new Set([".md", ".js", ".mjs", ".ts", ".json", ".html", ".css", ".yaml", ".yml", ".svg"]);
const failures = [];
let files = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) && entry.isDirectory() && directory === root) continue;
    const path = resolve(directory, entry.name);
    const name = relative(root, path).replaceAll("\\", "/");
    if ((await lstat(path)).isSymbolicLink()) { failures.push(`${name}: symlink`); continue; }
    if (entry.isDirectory()) { await scan(path); continue; }
    files += 1;
    if (!allowed.has(extname(path)) && !["LICENSE", ".gitignore"].includes(entry.name))
      failures.push(`${name}: unexpected file type`);
    const content = await readFile(path, "utf8");
    const patterns = [
      ["credential", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/],
      ["private local path", /(?:[A-Za-z]:[\\/](?:Users|xwechat_files|work_project)|wxid_[a-z0-9_]{6,})/i],
      ["auth assignment", /(?:_authToken|api[_-]?key|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{16,}["']/i],
    ];
    for (const [label, pattern] of patterns) if (pattern.test(content)) failures.push(`${name}: ${label}`);
    if (entry.name === "package-lock.json") {
      const lock = JSON.parse(content);
      for (const dependency of Object.values(lock.packages ?? {}))
        if (dependency.resolved && !dependency.link && !dependency.resolved.startsWith("https://registry.npmjs.org/"))
          failures.push(`${name}: unexpected dependency source`);
    }
  }
}
await scan(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Release content check passed: ${files} source/docs files; no private media, local paths or detected credentials.`);
