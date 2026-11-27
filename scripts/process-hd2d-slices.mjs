import { mkdir, copyFile, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "examples/beginner-village/assets");
const uploads = process.argv[2] ? resolve(process.argv[2]) : null;
const OUT = 512;

const sources = {
  "oak-tree-beauty.jpg": "oak-tree-beauty_85ad.jpg",
  "oak-tree-slices.jpg": "oak-tree-slices_8e3e.jpg",
  "well-beauty.jpg": "well-beauty_4eda.jpg",
  "well-slices-rings.jpg": "well-slices-rings_ac63.jpg",
  "well-slices-mixed.jpg": "well-slices-mixed_1b3e.jpg",
  "lodge-beauty.jpg": "lodge-beauty_8fed.jpg",
  "lodge-slices.jpg": "lodge-slices_7963.jpg",
  "ground-concept.jpg": "ground-concept_23ad.jpg",
};

const sourcesCells = {
  oakCrown: ["oak-tree-slices.jpg", 1, 0],
  wellRing: ["well-slices-mixed.jpg", 0, 2],
  wellLid: ["well-slices-mixed.jpg", 3, 3],
  foundation: ["lodge-slices.jpg", 0, 0],
  deckGround: ["lodge-slices.jpg", 1, 0],
  deckUpper: ["lodge-slices.jpg", 1, 2],
  roof: ["lodge-slices.jpg", 3, 3],
};

/** Dense presentation stacks. Height is 0.05 + (count - 1) * spacing. */
const dense = {
  oak: { count: 36, spacing: (2.4 - 0.05) / 35, plane: 3.15, shadow: 1.35 },
  well: { count: 34, spacing: (1.7 - 0.05) / 33, plane: 2.05, shadow: 1.05 },
  lodge: { count: 44, spacing: (3.3 - 0.05) / 43, plane: 1.08, shadow: 0.62, fitFootprint: true },
};

function isMagenta(r, g, b) {
  const pink = Math.min(r, b) - g;
  return pink > 14 && r > 60 && b > 35 && g < 180 && r + b > g * 1.85;
}

function keyedCell(image, box) {
  const [x0, y0, x1, y1] = box;
  const width = x1 - x0;
  const height = y1 - y0;
  const data = new Uint8Array(width * height * 4);
  const src = image.data;
  const stride = image.width * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const si = (y0 + y) * stride + (x0 + x) * 4;
      let r = src[si];
      let g = src[si + 1];
      let b = src[si + 2];
      let alpha = 255;
      if (isMagenta(r, g, b)) {
        const pink = Math.min(r, b) - g;
        const amount = Math.min(1, (pink - 8) / 28);
        alpha = Math.round(255 * (1 - amount));
      }
      const spill = Math.max(0, Math.min(r, b) - g);
      if (spill > 6) {
        const cut = spill * (alpha === 255 ? 0.35 : 0.95);
        r = Math.max(0, Math.round(r - cut));
        b = Math.max(0, Math.round(b - cut * 1.05));
        if (alpha < 230) alpha = Math.round(alpha * (1 - Math.min(0.85, spill / 80)));
      }
      if (alpha < 12) { r = 0; g = 0; b = 0; alpha = 0; }
      const di = (y * width + x) * 4;
      data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = alpha;
    }
  }
  return { width, height, data };
}

function contentBoxes(image) {
  const { width, height, data } = image;
  const row = new Array(height).fill(0);
  const col = new Array(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      if (isMagenta(data[i], data[i + 1], data[i + 2])) row[y] += 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 4) {
      const i = (y * width + x) * 4;
      if (isMagenta(data[i], data[i + 1], data[i + 2])) col[x] += 1;
    }
  }
  const spans = (counts, limit) => {
    const gutters = [];
    let start = -1;
    counts.forEach((count, index) => {
      const open = count / (limit / 4) > 0.82;
      if (open && start < 0) start = index;
      if (!open && start >= 0) { gutters.push([start, index]); start = -1; }
    });
    if (start >= 0) gutters.push([start, counts.length]);
    const boxes = [];
    let prev = 0;
    for (const [a, b] of gutters) {
      if (a - prev > 36) boxes.push([prev, a]);
      prev = b;
    }
    if (counts.length - prev > 36) boxes.push([prev, counts.length]);
    return boxes;
  };
  return { rows: spans(row, width), cols: spans(col, height) };
}

function normalize(cell, scale, canvas) {
  const png = new PNG({ width: canvas, height: canvas });
  const dw = Math.max(1, Math.round(cell.width * scale));
  const dh = Math.max(1, Math.round(cell.height * scale));
  const ox = Math.round((canvas - dw) / 2);
  const oy = Math.round((canvas - dh) / 2);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(cell.height - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(cell.width - 1, Math.floor(x / scale));
      const si = (sy * cell.width + sx) * 4;
      const di = ((oy + y) * canvas + (ox + x)) * 4;
      png.data[di] = cell.data[si];
      png.data[di + 1] = cell.data[si + 1];
      png.data[di + 2] = cell.data[si + 2];
      png.data[di + 3] = cell.data[si + 3];
    }
  }
  return PNG.sync.write(png);
}

function decodeJpeg(buffer) {
  const image = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  return { width: image.width, height: image.height, data: image.data };
}

async function loadAtlas(name) {
  const image = decodeJpeg(await readFile(resolve(assets, "source", name)));
  const { rows, cols } = contentBoxes(image);
  if (rows.length !== 4 || cols.length !== 4)
    throw new Error(`${name} resolved ${rows.length}x${cols.length} cells, expected 4x4.`);
  let maxSide = 1;
  const boxes = rows.map(([y0, y1]) => cols.map(([x0, x1]) => {
    maxSide = Math.max(maxSide, x1 - x0, y1 - y0);
    return [x0, y0, x1, y1];
  }));
  return { image, boxes, scale: (OUT - 8) / maxSide };
}

function readNormalized(buffer) {
  return PNG.sync.read(buffer);
}

function blank(width, height) {
  return new PNG({ width, height });
}

function clonePng(png) {
  const copy = blank(png.width, png.height);
  copy.data.set(png.data);
  return copy;
}

function clearPixel(data, index) {
  data[index] = 0; data[index + 1] = 0; data[index + 2] = 0; data[index + 3] = 0;
}

function maskOf(png) {
  const count = png.width * png.height;
  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) mask[i] = png.data[i * 4 + 3] > 40 ? 1 : 0;
  return mask;
}

function edgeDistance(mask, width, height, maxDist) {
  const dist = new Uint16Array(width * height);
  dist.fill(maxDist + 1);
  const queue = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) { dist[i] = 0; queue.push(i); }
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const current = dist[index];
    if (current >= maxDist) continue;
    const x = index % width;
    const y = (index / width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (dist[next] > current + 1) {
        dist[next] = current + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

function wallRing(png, thickness) {
  const mask = maskOf(png);
  const dist = edgeDistance(mask, png.width, png.height, thickness + 1);
  const out = clonePng(png);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || dist[i] > thickness) clearPixel(out.data, i * 4);
  }
  return out;
}

function keepDisk(png, radius) {
  const out = clonePng(png);
  const cx = png.width / 2;
  const cy = png.height / 2;
  const limit = radius * radius;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > limit) clearPixel(out.data, (y * png.width + x) * 4);
    }
  }
  return out;
}

function mixHash(x, y) {
  let value = Math.imul(x * 374761393 ^ y * 668265263, 1274126177);
  value = (value ^ (value >>> 13)) >>> 0;
  return value / 4294967296;
}

function fillCanopyHole(png, holeRadius, sampleRadius) {
  const out = clonePng(png);
  const cx = png.width / 2;
  const cy = png.height / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let step = 0; step < 64; step += 1) {
    const angle = (step / 64) * Math.PI * 2;
    const sx = Math.round(cx + Math.cos(angle) * sampleRadius);
    const sy = Math.round(cy + Math.sin(angle) * sampleRadius);
    if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) continue;
    const si = (sy * png.width + sx) * 4;
    if (png.data[si + 3] < 40) continue;
    red += png.data[si]; green += png.data[si + 1]; blue += png.data[si + 2]; count += 1;
  }
  const average = count ? [red / count, green / count, blue / count] : [70, 110, 48];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (Math.hypot(x - cx, y - cy) >= holeRadius) continue;
      const angle = mixHash(x, y) * Math.PI * 2;
      const radius = sampleRadius + (mixHash(y + 19, x) - 0.5) * 36;
      const sx = Math.max(0, Math.min(png.width - 1, Math.round(cx + Math.cos(angle) * radius)));
      const sy = Math.max(0, Math.min(png.height - 1, Math.round(cy + Math.sin(angle) * radius)));
      const si = (sy * png.width + sx) * 4;
      const di = (y * png.width + x) * 4;
      const leaf = png.data[si + 3] > 40 ? png.data : null;
      out.data[di] = Math.round(average[0] * 0.12 + (leaf ? leaf[si] : average[0]) * 0.88);
      out.data[di + 1] = Math.round(average[1] * 0.12 + (leaf ? leaf[si + 1] : average[1]) * 0.88);
      out.data[di + 2] = Math.round(average[2] * 0.12 + (leaf ? leaf[si + 2] : average[2]) * 0.88);
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function scaleAboutCenter(png, scale) {
  const out = blank(png.width, png.height);
  const cx = png.width / 2;
  const cy = png.height / 2;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const sx = Math.round((x - cx) / scale + cx);
      const sy = Math.round((y - cy) / scale + cy);
      if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) continue;
      const si = (sy * png.width + sx) * 4;
      const di = (y * png.width + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

function repeat(item, count) {
  return Array.from({ length: count }, () => item);
}

async function writeFrames(name, frames) {
  const dir = resolve(assets, "slices", name);
  await mkdir(dir, { recursive: true });
  for (const entry of await readdir(dir)) {
    if (entry.endsWith(".png")) await rm(resolve(dir, entry));
  }
  const files = [];
  const saved = new Map();
  for (const [index, png] of frames.entries()) {
    const key = png;
    let filename = saved.get(key);
    if (!filename) {
      filename = `${String(saved.size).padStart(2, "0")}.png`;
      await writeFile(resolve(dir, filename), PNG.sync.write(png));
      saved.set(key, filename);
    }
    files.push(`slices/${name}/${filename}`);
    void index;
  }
  return files;
}

function buildFrames(cells) {
  const crown = fillCanopyHole(cells.oakCrown, 158, 196);
  const ring = cells.wellRing;
  const lid = cells.wellLid;
  const wall = wallRing(cells.deckGround, 46);
  const roofs = [1.14, 1.08, 1.02, 0.96, 0.9, 0.84, 0.78, 0.72].map((scale) => scaleAboutCenter(cells.roof, scale));
  return {
    oak: [
      ...repeat(keepDisk(cells.oakCrown, 132), 5),
      ...repeat(keepDisk(cells.oakCrown, 112), 4),
      ...repeat(keepDisk(cells.oakCrown, 94), 3),
      ...repeat(crown, 8),
      ...repeat(scaleAboutCenter(crown, 0.9), 6),
      ...repeat(scaleAboutCenter(crown, 0.75), 5),
      ...repeat(scaleAboutCenter(crown, 0.58), 3),
      ...repeat(scaleAboutCenter(crown, 0.42), 2),
    ],
    well: [...repeat(ring, 32), ...repeat(lid, 2)],
    lodge: [
      ...repeat(cells.foundation, 3),
      cells.deckGround,
      ...repeat(wall, 16),
      cells.deckUpper,
      ...repeat(wall, 8),
      ...roofs.slice(0, 7).flatMap((roof) => repeat(roof, 2)),
      roofs[7],
    ],
  };
}

function grab(atlases, spec) {
  const [file, row, col] = spec;
  const atlas = atlases.get(file);
  return readNormalized(normalize(keyedCell(atlas.image, atlas.boxes[row][col]), atlas.scale, OUT));
}

await mkdir(resolve(assets, "source"), { recursive: true });
if (uploads) {
  for (const [clean, upload] of Object.entries(sources))
    await copyFile(resolve(uploads, upload), resolve(assets, "source", clean));
}

const atlases = new Map();
for (const name of ["oak-tree-slices.jpg", "well-slices-rings.jpg", "well-slices-mixed.jpg", "lodge-slices.jpg"])
  atlases.set(name, await loadAtlas(name));

const cells = Object.fromEntries(Object.entries(sourcesCells).map(([name, spec]) => [name, grab(atlases, spec)]));
const frames = buildFrames(cells);
const manifest = {};
for (const [name, spec] of Object.entries(dense)) {
  if (frames[name].length !== spec.count)
    throw new Error(`${name} produced ${frames[name].length} slices, expected ${spec.count}.`);
  const files = await writeFrames(name, frames[name]);
  const height = Number((0.05 + (spec.count - 1) * spec.spacing).toFixed(3));
  manifest[name] = {
    files,
    count: spec.count,
    spacing: Number(spec.spacing.toFixed(5)),
    height,
    plane: spec.plane,
    shadow: spec.shadow,
    ...(spec.fitFootprint ? { fitFootprint: true } : {}),
  };
}
await writeFile(resolve(assets, "stacks.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest).map(([name, spec]) => [name, {
  count: spec.count, spacing: spec.spacing, height: spec.height, unique: new Set(spec.files).size,
}])), null, 2));
