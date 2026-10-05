import { generateTown, generateInterior } from '../../packages/map-sdk/src/index.js';

export const PRESETS = [
  { id: 'organic', label: 'Organic town', kind: 'town' },
  { id: 'symmetric', label: 'Symmetric town', kind: 'town' },
  { id: 'grid', label: 'Grid town', kind: 'town' },
  { id: 'cottage', label: 'Cottage interior', kind: 'interior' },
  { id: 'inn', label: 'Inn interior', kind: 'interior' },
  { id: 'workshop', label: 'Workshop interior', kind: 'interior' },
];

export function generatePreset(id, seed, symmetry = 'none') {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) throw new RangeError(`Unknown preset: ${id}.`);
  return preset.kind === 'town'
    ? generateTown({ layout: id, seed })
    : generateInterior({ template: id, seed, symmetry });
}
