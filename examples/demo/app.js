import { SDK_VERSION, createArtPlan, findPath, validateMap } from '../../packages/map-sdk/src/index.js';
import { PRESETS, generatePreset } from './presets.js';
import { COLORS, tileColor } from './paint.js';

const node = (id) => document.getElementById(id);
const canvas = node('map');
const context = canvas.getContext('2d');
const controls = {
  view: node('view'), colliders: node('colliders'), rectangle: node('rectangle'),
  decorations: node('decorations'), grid: node('grid-lines'),
};
let state = { map: null, art: null, route: [], target: null, destinations: [] };
let geometry = { left: 0, top: 0, unit: 1 };

function addMetric(list, label, value) {
  const term = document.createElement('dt');
  const definition = document.createElement('dd');
  term.textContent = label;
  definition.textContent = value;
  list.append(term, definition);
}

function draw() {
  const width = canvas.parentElement.clientWidth;
  if (!width) return;
  const map = state.map;
  const height = map ? Math.min(640, Math.max(260, (width - 32) * map.height / map.width + 32)) : 350;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f6f8fa';
  context.fillRect(0, 0, width, height);
  if (!map) return;
  const unit = Math.min((width - 32) / map.width, (height - 32) / map.height);
  geometry = { left: (width - map.width * unit) / 2, top: (height - map.height * unit) / 2, unit };
  const { left, top } = geometry;
  context.save();
  context.translate(left, top);
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      context.fillStyle = tileColor(map, state.art, x, y, controls.view.value);
      context.fillRect(x * unit, y * unit, unit + 0.25, unit + 0.25);
    }
  }
  if (controls.grid.checked && unit > 4) {
    context.beginPath();
    for (let x = 0; x <= map.width; x += 1) { context.moveTo(x * unit, 0); context.lineTo(x * unit, map.height * unit); }
    for (let y = 0; y <= map.height; y += 1) { context.moveTo(0, y * unit); context.lineTo(map.width * unit, y * unit); }
    context.strokeStyle = '#00000018'; context.lineWidth = 0.5; context.stroke();
  }
  if (controls.decorations.checked) {
    context.fillStyle = COLORS.decoration;
    for (const decoration of state.art.decorations) {
      const point = decoration.anchor ?? { x: decoration.x + decoration.width / 2, y: decoration.y + decoration.height / 2 };
      context.fillRect(point.x * unit - 1.4, point.y * unit - 1.4, 2.8, 2.8);
    }
  }
  if (controls.colliders.checked) {
    for (const entity of map.entities.filter((item) => item.solid)) {
      context.fillStyle = COLORS.entity;
      context.strokeStyle = COLORS.collider;
      context.lineWidth = 1;
      context.fillRect(entity.x * unit, entity.y * unit, entity.width * unit, entity.height * unit);
      context.strokeRect(entity.x * unit, entity.y * unit, entity.width * unit, entity.height * unit);
    }
  }
  if (controls.rectangle.checked && map.report.maxRectangle.area > 0) {
    const rectangle = map.report.maxRectangle;
    context.strokeStyle = COLORS.rectangle;
    context.lineWidth = 2;
    context.strokeRect(rectangle.x * unit, rectangle.y * unit, rectangle.width * unit, rectangle.height * unit);
  }
  if (state.route.length > 0) {
    context.beginPath();
    state.route.forEach((point, index) => {
      const px = (point.x + 0.5) * unit; const py = (point.y + 0.5) * unit;
      if (!index) context.moveTo(px, py); else context.lineTo(px, py);
    });
    context.strokeStyle = COLORS.route; context.lineWidth = Math.max(2, Math.min(4, unit / 3));
    context.lineJoin = 'round'; context.lineCap = 'round'; context.stroke();
  }
  const dot = (point, color, radius) => {
    context.beginPath();
    context.arc((point.x + 0.5) * unit, (point.y + 0.5) * unit, radius, 0, Math.PI * 2);
    context.fillStyle = color; context.fill();
    context.lineWidth = 1; context.strokeStyle = '#ffffff'; context.stroke();
  };
  for (const portal of map.exits ?? []) dot(portal, COLORS.portal, Math.max(2.5, unit * 0.32));
  dot(map.spawn, COLORS.spawn, Math.max(3, unit * 0.34));
  if (state.target) {
    const point = state.target;
    context.strokeStyle = state.route.length ? COLORS.route : '#ae2828';
    context.lineWidth = 2;
    context.strokeRect(point.x * unit + 1, point.y * unit + 1, unit - 2, unit - 2);
  }
  context.restore();
}

function selectTarget(point, label = 'Tile') {
  if (!state.map) return;
  state.target = { x: point.x, y: point.y };
  state.route = findPath(state.map, state.map.spawn, state.target);
  const reachable = state.route.length > 0;
  const status = node('route-status');
  status.dataset.reachable = String(reachable);
  status.textContent = reachable
    ? `${label} (${point.x}, ${point.y}) - ${state.route.length - 1} steps`
    : `${label} (${point.x}, ${point.y}) - no traversable route`;
  node('coordinates').textContent = `Target ${point.x}, ${point.y}`;
  canvas.setAttribute('aria-label', `${state.map.kind} blockout, ${state.map.width} by ${state.map.height} cells. ${status.textContent}.`);
  draw();
}

function renderReport() {
  const { map, art } = state;
  const report = map.report;
  node('result').textContent = report.passed ? 'PASS' : 'FAIL';
  node('result').dataset.passed = String(report.passed);
  const metrics = node('metrics'); metrics.replaceChildren();
  addMetric(metrics, 'Dimensions', `${map.width} x ${map.height}`);
  addMetric(metrics, 'Connected components', report.components);
  addMetric(metrics, 'Reachable / walkable', `${report.reachableCount} / ${report.walkableCount}`);
  addMetric(metrics, 'Reachability', `${report.reachablePercent.toFixed(1)}%`);
  addMetric(metrics, 'Landmarks', `${report.landmarkResults.filter((item) => item.reachable).length} / ${report.landmarkResults.length}`);
  addMetric(metrics, 'Route clearance', report.clearance.passed ? 'PASS' : 'FAIL');
  addMetric(metrics, 'Character radius', `${report.clearance.characterRadius} cells`);
  addMetric(metrics, 'Symmetry', `${report.symmetry.mode} / ${report.symmetry.passed ? 'PASS' : 'FAIL'}`);
  const rectangle = report.maxRectangle;
  addMetric(metrics, 'Max grid-center rectangle', `${rectangle.width} x ${rectangle.height}`);
  addMetric(metrics, 'Rectangle cells', rectangle.area);
  addMetric(metrics, 'Blocked road cells', report.blockedRoadCells);

  const portals = node('portals'); portals.replaceChildren();
  for (const portal of map.exits ?? []) {
    const result = report.exitResults.find((item) => item.id === portal.id);
    const button = document.createElement('button');
    button.className = 'portal-button'; button.type = 'button';
    button.dataset.reachable = String(Boolean(result?.reachable));
    const name = document.createElement('span'); name.textContent = portal.label ?? portal.id;
    const status = document.createElement('span'); status.textContent = result?.reachable ? 'Reachable' : 'Blocked';
    button.append(name, status);
    button.addEventListener('click', () => { node('target').value = `portal:${portal.id}`; selectTarget(portal, name.textContent); });
    portals.append(button);
  }
  const fourExits = map.kind === 'town'
    ? ['north', 'east', 'south', 'west'].every((side) => map.exits.some((exit) => exit.side === side && report.exitResults.some((result) => result.id === exit.id && result.reachable)))
    : null;
  if (map.kind === 'town') addMetric(metrics, 'Four exit sides', fourExits ? 'PASS' : 'FAIL');
  state.destinations = [
    ...(map.exits ?? []).map((point) => ({ key: `portal:${point.id}`, point, label: point.label ?? point.id })),
    ...(map.landmarks ?? []).map((point) => ({ key: `landmark:${point.id}`, point, label: point.label ?? point.id })),
  ];
  const target = node('target'); target.replaceChildren(new Option('Select target', ''));
  for (const destination of state.destinations) target.add(new Option(destination.label, destination.key));
  node('issues').hidden = report.issues.length === 0;
  node('issues').textContent = report.issues.join(' ');
  const artMetrics = node('art-metrics'); artMetrics.replaceChildren();
  addMetric(artMetrics, 'Protected cells', art.statistics.protectedCellCount);
  addMetric(artMetrics, 'Decoration points', art.statistics.decorationCount);
  addMetric(artMetrics, 'Groups', art.statistics.groupCount);
  addMetric(artMetrics, 'Ground decals', art.statistics.decalCount);
  addMetric(artMetrics, 'Collision changes', art.statistics.collisionChanges);
}

function clearResult(error) {
  state = { map: null, art: null, route: [], target: null, destinations: [] };
  node('error').textContent = error.message || String(error); node('error').hidden = false;
  node('result').textContent = 'ERROR'; node('result').dataset.passed = 'false';
  for (const id of ['metrics', 'portals', 'art-metrics']) node(id).replaceChildren();
  node('target').replaceChildren(new Option('Select target', ''));
  node('issues').hidden = true; node('route-status').textContent = 'No generated map';
  node('coordinates').textContent = 'No target';
  node('download-map').disabled = true; node('download-art').disabled = true;
  canvas.setAttribute('aria-label', 'No generated map');
  draw();
}

function generate() {
  const button = node('generate'); button.disabled = true;
  try {
    const seed = node('seed').value.trim();
    if (!seed) throw new TypeError('Seed cannot be empty.');
    const map = generatePreset(node('preset').value, seed, node('symmetry').value);
    map.report = validateMap(map);
    const art = createArtPlan(map, { seed, preset: 'generic' });
    state = { map, art, route: [], target: null, destinations: [] };
    node('error').hidden = true;
    node('route-status').textContent = 'No target'; node('route-status').removeAttribute('data-reachable');
    node('coordinates').textContent = `${map.width} x ${map.height} cells`;
    canvas.setAttribute('aria-label', `${map.kind} blockout, ${map.width} by ${map.height} cells. Validation ${map.report.passed ? 'passed' : 'failed'}.`);
    node('download-map').disabled = false; node('download-art').disabled = false;
    renderReport(); draw();
  } catch (error) { clearResult(error); }
  finally { button.disabled = false; }
}

function download(kind) {
  const data = state[kind];
  if (!data) return;
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${node('preset').value}-${kind}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

node('sdk-version').textContent = `v${SDK_VERSION}`;
node('generator').addEventListener('submit', (event) => { event.preventDefault(); generate(); });
node('preset').addEventListener('change', () => {
  node('symmetry').disabled = PRESETS.find((item) => item.id === node('preset').value)?.kind !== 'interior';
  generate();
});
node('symmetry').addEventListener('change', generate);
for (const control of Object.values(controls)) control.addEventListener('change', draw);
node('target').addEventListener('change', () => {
  const destination = state.destinations.find((item) => item.key === node('target').value);
  if (destination) selectTarget(destination.point, destination.label);
  else { state.target = null; state.route = []; node('route-status').textContent = 'No target'; node('route-status').removeAttribute('data-reachable'); node('coordinates').textContent = 'No target'; draw(); }
});
canvas.addEventListener('click', (event) => {
  if (!state.map) return;
  const box = canvas.getBoundingClientRect();
  const point = { x: Math.floor((event.clientX - box.left - geometry.left) / geometry.unit), y: Math.floor((event.clientY - box.top - geometry.top) / geometry.unit) };
  if (point.x < 0 || point.y < 0 || point.x >= state.map.width || point.y >= state.map.height) return;
  node('target').value = ''; selectTarget(point);
});
canvas.addEventListener('keydown', (event) => {
  if (!state.map) return;
  const offsets = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] };
  if (!offsets[event.key]) return;
  event.preventDefault();
  const point = state.target ?? state.map.spawn;
  const [dx, dy] = offsets[event.key];
  const target = { x: Math.max(0, Math.min(state.map.width - 1, point.x + dx)), y: Math.max(0, Math.min(state.map.height - 1, point.y + dy)) };
  node('target').value = ''; selectTarget(target);
});
node('download-map').addEventListener('click', () => download('map'));
node('download-art').addEventListener('click', () => download('art'));
new ResizeObserver(draw).observe(canvas.parentElement);
generate();
