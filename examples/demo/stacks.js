/** Placeholder oblique preview of ArtPlan sprite stacks. Drawing only; no map fields are read for collision. */

export const STACK_SHEAR = 0.32;
export const DISC_SQUASH = 0.46;

const TREE_TRUNK = '#6b4630';
const TREE_LEAF = '#2f7a45';

const NAMED_COLORS = {
  well_base: '#7a7168',
  well_course: '#c4beb4',
  well_lip: '#e4ddd2',
  well_cap: '#5d6b74',
  lodge_foundation: '#8b5e42',
  lodge_wall: '#ead7b4',
  lodge_eaves: '#3f7358',
  lodge_roof: '#9a4034',
};

function mix(from, to, amount) {
  const start = Number.parseInt(from.slice(1), 16);
  const end = Number.parseInt(to.slice(1), 16);
  const channel = (shift) => Math.round(((start >> shift) & 255) * (1 - amount) + ((end >> shift) & 255) * amount);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

export function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

export function project(x, y, elevation, tilt, shear = STACK_SHEAR) {
  const rise = elevation * tilt;
  return { x: x + rise * shear, y: y - rise };
}

function sliceProgress(stack, slice) {
  return stack.sliceCount <= 1 ? 0 : slice.index / (stack.sliceCount - 1);
}

export function sliceScale(stack, slice) {
  if (slice.visual && stack.footprint.width > 0) return slice.visual.width / stack.footprint.width;
  const sprite = slice.sprite || stack.sprite;
  const progress = sliceProgress(stack, slice);
  if (sprite === 'tree' || sprite.endsWith('_canopy') || sprite.startsWith('pine') || sprite.startsWith('bamboo')) {
    if (slice.index === 0) return 1;
    if (progress < 0.42) return 0.7;
    return 1.2 + (progress - 0.42) * 2.4;
  }
  if (sprite === 'well_lip') return 1.16;
  if (sprite === 'well_cap') return 0.58;
  if (sprite === 'lodge_wall') return 0.98;
  if (sprite === 'lodge_eaves') return 1.12;
  if (sprite === 'lodge_roof') return 0.74;
  return 1;
}

export function sliceColor(stack, slice) {
  const sprite = slice.sprite || stack.sprite;
  if (NAMED_COLORS[sprite]) return NAMED_COLORS[sprite];
  if (sprite === 'tree' || sprite.endsWith('_canopy') || sprite.startsWith('pine') || sprite.startsWith('bamboo')) {
    const progress = sliceProgress(stack, slice);
    return mix(TREE_TRUNK, TREE_LEAF, progress < 0.42 ? progress / 0.42 * 0.35 : 0.35 + (progress - 0.42) / 0.58 * 0.65);
  }
  if (sprite.startsWith('well')) return NAMED_COLORS.well_course;
  if (sprite.startsWith('lodge')) return NAMED_COLORS.lodge_wall;
  return '#8d735c';
}

export function sliceKind(stack, slice) {
  const sprite = slice.sprite || stack.sprite;
  if (sprite.startsWith('lodge') || sprite.startsWith('cottage') || stack.footprint.width * stack.footprint.height >= 4)
    return 'slab';
  return 'disc';
}

function sliceRect(stack, slice) {
  const scale = sliceScale(stack, slice);
  const { footprint, foot } = stack;
  return {
    x: foot.x + (footprint.x - foot.x) * scale,
    y: foot.y + (footprint.y - foot.y) * scale,
    width: footprint.width * scale,
    height: footprint.height * scale,
  };
}

export function sliceOutline(stack, slice, tilt) {
  const rect = sliceRect(stack, slice);
  const elevation = slice.elevation;
  if (sliceKind(stack, slice) === 'slab') {
    return [
      project(rect.x, rect.y, elevation, tilt),
      project(rect.x + rect.width, rect.y, elevation, tilt),
      project(rect.x + rect.width, rect.y + rect.height, elevation, tilt),
      project(rect.x, rect.y + rect.height, elevation, tilt),
    ];
  }
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2 * DISC_SQUASH;
  return Array.from({ length: 18 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 18;
    return project(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry, elevation, tilt);
  });
}

export function previewSlices(stack, tilt) {
  return [...stack.slices]
    .sort((a, b) => a.elevation - b.elevation || a.index - b.index)
    .map((slice) => ({
      index: slice.index,
      elevation: slice.elevation,
      sprite: slice.sprite,
      kind: sliceKind(stack, slice),
      color: sliceColor(stack, slice),
      outline: sliceOutline(stack, slice, tilt),
    }));
}

export function stacksInDrawOrder(stacks) {
  return [...stacks].sort((a, b) => a.sortDepth - b.sortDepth || a.foot.x - b.foot.x);
}

function trace(context, points, unit) {
  context.beginPath();
  points.forEach((point, index) => {
    const x = point.x * unit;
    const y = point.y * unit;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function sideFace(context, lower, upper, unit, color) {
  if (lower.length !== upper.length) return;
  context.fillStyle = color;
  for (let index = 0; index < lower.length; index += 1) {
    const next = (index + 1) % lower.length;
    trace(context, [lower[index], lower[next], upper[next], upper[index]], unit);
    context.fill();
  }
}

/** Paint stacks in foot order. The caller keeps collision boxes as a separate overlay. */
export function drawSpriteStacks(context, stacks, unit, tilt) {
  for (const stack of stacksInDrawOrder(stacks)) {
    const slices = previewSlices(stack, tilt);
    let previous = null;
    for (const slice of slices) {
      if (previous && tilt > 0 && slice.kind === 'slab' && previous.kind === 'slab')
        sideFace(context, previous.outline, slice.outline, unit, shade(slice.color, -28));
      context.fillStyle = slice.color;
      trace(context, slice.outline, unit);
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(28, 32, 28, 0.28)';
      context.stroke();
      previous = slice;
    }
  }
}
