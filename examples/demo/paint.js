export const COLORS = Object.freeze({
  tiles: ['#dcebd8', '#e4e8eb', '#b0d6e6', '#baccce', '#4d5860', '#f0efec'],
  walkable: '#d8eddf',
  blocked: '#b9bec4',
  road: '#e8bb3b',
  protected: '#078f87',
  entity: '#a7654a',
  collider: '#783d30',
  rectangle: '#b32370',
  route: '#1462ca',
  spawn: '#092c59',
  portal: '#176554',
  decoration: '#b98f19',
});

export function tileColor(map, art, x, y, view) {
  if (view === 'navigation') return map.walkable[y][x] ? COLORS.walkable : COLORS.blocked;
  if (view === 'road') return map.roadMask[y][x] ? COLORS.road : COLORS.tiles[map.tiles[y][x]];
  if (view === 'protected') return art.protected[y][x] ? COLORS.protected : COLORS.tiles[map.tiles[y][x]];
  const field = art.fields[view];
  if (field) {
    const value = field[y][x];
    const unit = view.endsWith('Distance') ? Math.min(1, value / 12) : Math.max(0, Math.min(1, value));
    return `hsl(${Math.round(205 - 45 * unit)} 55% ${Math.round(94 - 55 * unit)}%)`;
  }
  return COLORS.tiles[map.tiles[y][x]] ?? '#ffffff';
}

const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character]));

export function mapSvg(map, { x = 0, y = 0, width = 350, height = 260 } = {}) {
  const unit = Math.min(width / map.width, height / map.height);
  const left = x + (width - unit * map.width) / 2;
  const top = y + (height - unit * map.height) / 2;
  const parts = [`<g transform="translate(${left.toFixed(3)} ${top.toFixed(3)}) scale(${unit.toFixed(6)})">`];
  map.tiles.forEach((row, ty) => row.forEach((tile, tx) => {
    parts.push(`<rect x="${tx}" y="${ty}" width="1" height="1" fill="${COLORS.tiles[tile] ?? '#ffffff'}"/>`);
  }));
  for (const entity of map.entities.filter((item) => item.solid)) {
    parts.push(`<rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.height}" fill="${COLORS.entity}" stroke="${COLORS.collider}" stroke-width="0.08"><title>${escapeXml(entity.type)}: ${escapeXml(entity.id)}</title></rect>`);
  }
  const rectangle = map.report.maxRectangle;
  if (rectangle.area > 0) {
    parts.push(`<rect x="${rectangle.x}" y="${rectangle.y}" width="${rectangle.width}" height="${rectangle.height}" fill="none" stroke="${COLORS.rectangle}" stroke-width="0.2"/>`);
  }
  for (const portal of map.exits ?? []) {
    parts.push(`<circle cx="${portal.x + 0.5}" cy="${portal.y + 0.5}" r="0.4" fill="${COLORS.portal}"><title>${escapeXml(portal.id)}</title></circle>`);
  }
  parts.push(`<circle cx="${map.spawn.x + 0.5}" cy="${map.spawn.y + 0.5}" r="0.4" fill="${COLORS.spawn}"/></g>`);
  return parts.join('');
}
