import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, generatePreset } from '../examples/demo/presets.js';
import { mapSvg } from '../examples/demo/paint.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/render-preview.mjs [--seed 1042]\nWrites deterministic SDK results to docs/images/layouts.svg.');
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--seed')) throw new Error('Expected --seed <text>.');
const seed = args.length ? args[1] : '1042';
if (!seed.length || seed.length > 128) throw new RangeError('Seed must contain 1 to 128 characters.');
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const maps = PRESETS.map((preset) => ({ preset, map: generatePreset(preset.id, seed) }));
const parts = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850" role="img" aria-labelledby="title desc">',
  '<title id="title">Six generated RPG map blockouts</title>',
  `<desc id="desc">Real SDK output using seed ${escapeXml(seed)}. Solid footprints are brown, spawn is blue, portals are green, largest valid grid-center rectangle is outlined in magenta. These are data previews, not game artwork.</desc>`,
  '<rect width="1200" height="850" fill="#ffffff"/>',
  '<g font-family="system-ui, sans-serif" fill="#252c34">',
  '<text x="24" y="31" font-size="20" font-weight="700">RPG Map SDK - Generated blockouts</text>',
  `<text x="24" y="55" font-size="12" fill="#68727d">Seed: ${escapeXml(seed)} | Physical layout data, not AI artwork</text>`,
];
maps.forEach(({ preset, map }, index) => {
  const x = 24 + (index % 3) * 398;
  const y = 86 + Math.floor(index / 3) * 375;
  const report = map.report;
  const reachable = report.exitResults.filter((item) => item.reachable).length;
  parts.push(`<text x="${x}" y="${y}" font-size="16" font-weight="650">${escapeXml(preset.label)}</text>`);
  parts.push(`<text x="${x}" y="${y + 21}" font-size="11" fill="#68727d">${map.width} x ${map.height} | ${report.passed ? 'PASS' : 'FAIL'} | ${report.components} component${report.components === 1 ? '' : 's'}</text>`);
  parts.push(mapSvg(map, { x, y: y + 37, width: 370, height: 270 }));
  parts.push(`<text x="${x}" y="${y + 328}" font-size="11" fill="#68727d">${report.reachableCount}/${report.walkableCount} cells reachable | ${reachable}/${report.exitResults.length} portals</text>`);
  parts.push(`<text x="${x}" y="${y + 347}" font-size="11" fill="#68727d">Max rectangle: ${report.maxRectangle.width} x ${report.maxRectangle.height} = ${report.maxRectangle.area} grid centers</text>`);
});
parts.push('<text x="24" y="826" font-size="11" fill="#68727d">Brown: solid footprint | Blue: spawn | Green: portal | Magenta: largest valid grid-center rectangle</text></g></svg>');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'docs/images/layouts.svg');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${parts.join('\n')}\n`);
console.log('Wrote docs/images/layouts.svg');
for (const { preset, map } of maps) console.log(`${preset.id}: ${map.width}x${map.height}, passed=${map.report.passed}, components=${map.report.components}`);
