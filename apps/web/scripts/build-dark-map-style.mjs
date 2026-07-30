// Generates public/map-styles/pulso-dark.json: a Pulso-branded dark variant
// of OpenFreeMap's Liberty style, produced by recoloring every layer rather
// than hand-authoring a ~110-layer vector style from scratch. Re-run this
// whenever the palette needs adjusting, or if OpenFreeMap's Liberty style
// changes shape upstream (a changed layer id would need a new entry below).
//
// Usage: node scripts/build-dark-map-style.mjs   (from apps/web)

import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OUTPUT_PATH = fileURLToPath(
  new URL('../public/map-styles/pulso-dark.json', import.meta.url)
);

// Pulso-branded dark palette. Land/base tones match the app chrome
// (surface-0/1 in apps/web/app/styles.css); water/roads pick up a faint
// purple tint from the brand gradient rather than generic blue/gray, so the
// map reads as part of the same product instead of a swapped-in dark tile set.
const BG = '#100e19';
const LAND_RESIDENTIAL = '#161320';
const BUILDING = '#1d1a2a';
const WATER = '#161233';
const WATERWAY = '#241f45';
const CASING = '#0a0912';
const ROAD_MOTORWAY = '#4a3e6b';
const ROAD_TRUNK = '#3d3358';
const ROAD_SECONDARY = '#332c47';
const ROAD_MINOR = '#241f36';
const ROAD_PATH = '#2a2438';
const RAIL = '#2e2840';
const TEXT_MAJOR = '#e9e6f2';
const TEXT_MINOR = '#a29cb5';
const TEXT_ROAD = '#c9c4d6';
const TEXT_WATER = '#8b9bc7';
const HALO = '#0a0912';

const colorOverrides = {
  background: { 'background-color': BG },
  natural_earth: { 'raster-opacity': 0.15 },
  park: { 'fill-color': '#182a1f', 'fill-outline-color': '#22392b' },
  park_outline: { 'line-color': '#22392b' },
  landuse_residential: { 'fill-color': LAND_RESIDENTIAL },
  landcover_wood: { 'fill-color': '#16211a' },
  landcover_grass: { 'fill-color': '#182619' },
  landcover_ice: { 'fill-color': '#1c2430' },
  landcover_wetland: { 'fill-color': '#152420' },
  landcover_sand: { 'fill-color': '#241f1a' },
  landuse_pitch: { 'fill-color': '#1a2a1d' },
  landuse_track: { 'fill-color': '#1a2a1d' },
  landuse_cemetery: { 'fill-color': '#171922' },
  landuse_hospital: { 'fill-color': '#1c1a26' },
  landuse_school: { 'fill-color': '#1c1a26' },
  water: { 'fill-color': WATER },
  waterway_tunnel: { 'line-color': WATERWAY },
  waterway_river: { 'line-color': WATERWAY },
  waterway_other: { 'line-color': WATERWAY },
  aeroway_fill: { 'fill-color': '#1c1928' },
  aeroway_runway: { 'line-color': '#332c47' },
  aeroway_taxiway: { 'line-color': '#2a2438' },
  building: { 'fill-color': BUILDING, 'fill-outline-color': '#141220' },
  'building-3d': { 'fill-extrusion-color': BUILDING },
  boundary_3: { 'line-color': '#3a3450' },
  boundary_2: { 'line-color': '#4a4460' },
  boundary_disputed: { 'line-color': '#6b4a56' },
  road_area_pattern: { 'fill-color': '#1c1928' },
  waterway_line_label: { 'text-color': TEXT_WATER, 'text-halo-color': HALO },
  water_name_point_label: { 'text-color': TEXT_WATER, 'text-halo-color': HALO },
  water_name_line_label: { 'text-color': TEXT_WATER, 'text-halo-color': HALO },
  'highway-name-path': { 'text-color': TEXT_ROAD, 'text-halo-color': HALO },
  'highway-name-minor': { 'text-color': TEXT_ROAD, 'text-halo-color': HALO },
  'highway-name-major': { 'text-color': TEXT_ROAD, 'text-halo-color': HALO },
  airport: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  label_other: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  label_village: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  label_town: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  label_state: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  label_city: { 'text-color': TEXT_MAJOR, 'text-halo-color': HALO },
  label_city_capital: { 'text-color': TEXT_MAJOR, 'text-halo-color': HALO },
  label_country_3: { 'text-color': TEXT_MAJOR, 'text-halo-color': HALO },
  label_country_2: { 'text-color': TEXT_MAJOR, 'text-halo-color': HALO },
  label_country_1: { 'text-color': TEXT_MAJOR, 'text-halo-color': HALO },
  poi_r20: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  poi_r7: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  poi_r1: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO },
  poi_transit: { 'text-color': TEXT_MINOR, 'text-halo-color': HALO }
};

// Road/rail line layers follow a repeatable {phase}_{class}[_casing] naming
// scheme across tunnel/road/bridge phases - handled by pattern rather than
// one entry per layer.
function roadColorFor(id) {
  if (id.includes('_casing')) return CASING;
  if (id.includes('major_rail') || id.includes('transit_rail')) return RAIL;
  if (id.includes('motorway')) return ROAD_MOTORWAY;
  if (id.includes('trunk_primary')) return ROAD_TRUNK;
  if (id.includes('secondary_tertiary')) return ROAD_SECONDARY;
  if (id.includes('path_pedestrian')) return ROAD_PATH;
  return ROAD_MINOR; // minor/street/link/service_track
}

const ROAD_PHASE_PREFIXES = ['tunnel_', 'road_', 'bridge_'];
const COLOR_KEYS = [
  'background-color',
  'fill-color',
  'fill-outline-color',
  'fill-extrusion-color',
  'line-color',
  'text-color',
  'text-halo-color',
  'icon-color'
];

async function main() {
  const response = await fetch(LIBERTY_STYLE_URL);
  if (!response.ok)
    throw new Error(`Failed to fetch ${LIBERTY_STYLE_URL}: ${response.status}`);
  const original = await response.json();
  const style = structuredClone(original);

  for (const layer of style.layers) {
    const override = colorOverrides[layer.id];
    if (override) {
      layer.paint = { ...layer.paint, ...override };
      continue;
    }
    if (
      layer.type === 'line' &&
      ROAD_PHASE_PREFIXES.some((p) => layer.id.startsWith(p)) &&
      layer['source-layer'] === 'transportation'
    ) {
      layer.paint = { ...layer.paint, 'line-color': roadColorFor(layer.id) };
    }
  }

  style.name = 'Pulso Dark';
  await writeFile(OUTPUT_PATH, JSON.stringify(style));
  console.log(`Wrote ${OUTPUT_PATH}`);

  const untouched = [];
  for (let i = 0; i < original.layers.length; i++) {
    const before = original.layers[i];
    const after = style.layers[i];
    if (!before.paint) continue;
    for (const key of COLOR_KEYS) {
      if (
        before.paint[key] !== undefined &&
        before.paint[key] === after.paint?.[key]
      ) {
        untouched.push(
          `${before.id}.${key} = ${JSON.stringify(before.paint[key])}`
        );
      }
    }
  }
  if (untouched.length > 0) {
    console.warn(
      'Warning: these color properties still hold their original light-mode value ' +
        '(Liberty style likely changed upstream - add an override above):'
    );
    console.warn(untouched.join('\n'));
  }
}

await main();
