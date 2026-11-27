import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
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

/** Ground-up slice order. Side-view cells are omitted. */
const stacks = {
  oak: {
    file: "oak-tree-slices.jpg",
    cells: [[1, 0], [2, 0], [1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]],
    plane: 3.15,
    spacing: 0.34,
    shadow: 1.35,
  },
  well: {
    cells: [
      ["well-slices-rings.jpg", 3, 0],
      ["well-slices-rings.jpg", 3, 1],
      ["well-slices-rings.jpg", 2, 1],
      ["well-slices-rings.jpg", 1, 0],
      ["well-slices-rings.jpg", 0, 2],
      ["well-slices-mixed.jpg", 0, 2],
      ["well-slices-mixed.jpg", 3, 0],
      ["well-slices-mixed.jpg", 3, 3],
    ],
    plane: 2.05,
    spacing: 0.24,
    shadow: 1.05,
  },
  lodge: {
    file: "lodge-slices.jpg",
    cells: [[0, 0], [1, 0], [0, 1], [1, 2], [2, 0], [2, 1], [3, 1], [3, 3]],
    plane: 1.08,
    spacing: 0.46,
    shadow: 0.62,
    fitFootprint: true,
  },
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

async function writeStack(name, spec, atlases) {
  const dir = resolve(assets, "slices", name);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const [index, cell] of spec.cells.entries()) {
    const file = spec.file ?? cell[0];
    const row = spec.file ? cell[0] : cell[1];
    const col = spec.file ? cell[1] : cell[2];
    const atlas = atlases.get(file);
    const keyed = keyedCell(atlas.image, atlas.boxes[row][col]);
    const png = normalize(keyed, atlas.scale, OUT);
    const filename = `${String(index).padStart(2, "0")}.png`;
    await writeFile(resolve(dir, filename), png);
    files.push(`slices/${name}/${filename}`);
  }
  return {
    files,
    plane: spec.plane,
    spacing: spec.spacing,
    shadow: spec.shadow,
    ...(spec.fitFootprint ? { fitFootprint: true } : {}),
  };
}

await mkdir(resolve(assets, "source"), { recursive: true });
if (uploads) {
  for (const [clean, upload] of Object.entries(sources))
    await copyFile(resolve(uploads, upload), resolve(assets, "source", clean));
}

const atlases = new Map();
for (const name of ["oak-tree-slices.jpg", "well-slices-rings.jpg", "well-slices-mixed.jpg", "lodge-slices.jpg"])
  atlases.set(name, await loadAtlas(name));

const manifest = {};
for (const [name, spec] of Object.entries(stacks))
  manifest[name] = await writeStack(name, spec, atlases);
await writeFile(resolve(assets, "stacks.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  oak: manifest.oak.files.length,
  well: manifest.well.files.length,
  lodge: manifest.lodge.files.length,
}, null, 2));
