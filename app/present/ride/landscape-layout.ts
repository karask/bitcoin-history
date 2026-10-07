import type { Track } from "../../../lib/track";
import type { createRidePath } from "../../../lib/ride-path";

export type LandscapePath = ReturnType<typeof createRidePath>;
export const landscapes = ["pasture", "forest", "gorge", "alpine", "autumn", "coast", "wetland"] as const;
export type Landscape = typeof landscapes[number];
export type LandscapeRegion = { index: number; kind: Landscape; u: number; x: number; z: number; y: number; span: number };
export type StationPlot = { x: number; y: number; z: number; sideX: number; sideZ: number; forwardX: number; forwardZ: number };
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export function landscapeRandom(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

/** A shared height field: scenery, footings, water and the visible land use it. */
export function createLandscapeLayout(path: LandscapePath, track: Track) {
  const regionCount = Math.max(7, Math.round(path.length / 10500) * 7);
  const span = path.length / regionCount;
  const regions: LandscapeRegion[] = Array.from({ length: regionCount }, (_, index) => {
    const u = (index + .5) / regionCount, p = path.point(u);
    return { index, kind: landscapes[index % landscapes.length], u, x: p.x, z: p.z, y: p.y, span };
  });
  const plots: StationPlot[] = track.stations.map(station => {
    const f = path.frame(station.u), flat = Math.hypot(f.tangent.x, f.tangent.z);
    const forwardX = f.tangent.x / flat, forwardZ = f.tangent.z / flat;
    return { x: f.point.x + f.side.x * 31 + forwardX * 18, y: f.point.y - 5.5,
      z: f.point.z + f.side.z * 31 + forwardZ * 18, sideX: f.side.x, sideZ: f.side.z, forwardX, forwardZ };
  });
  // Height queries happen hundreds of thousands of times at construction. A LUT
  // keeps terrain creation independent of the number of price observations.
  const sampleCount = Math.max(4096, Math.ceil(path.length / 2.5));
  const samples = Array.from({ length: sampleCount + 1 }, (_, i) => path.point(i / sampleCount));
  const route = (x: number) => {
    const n = clamp(x / path.length) * sampleCount, i = Math.min(sampleCount - 1, Math.floor(n)), t = n - i;
    return { y: samples[i].y * (1 - t) + samples[i + 1].y * t, z: samples[i].z * (1 - t) + samples[i + 1].z * t };
  };
  const regionAt = (x: number) => regions[Math.min(regionCount - 1, Math.max(0, Math.floor(x / span)))];
  // The lowest rail height across each region's bay. The sea is set below it: taken from
  // the region's centre instead, a coast on a rising stretch of price sat above its own
  // lower end and hung over the previous region like a ceiling.
  const lowestRail = regions.map(r => {
    let low = Infinity;
    for (let x = r.x - span * .7; x <= r.x + span * .7; x += 10) low = Math.min(low, route(x).y);
    return low;
  });
  const riverX = (r: LandscapeRegion, z: number) => r.x + Math.sin((z - r.z) / 155) * 44;
  const water = (r: LandscapeRegion) => ({
    x: r.x + (r.kind === "autumn" ? 120 : 0), z: r.z - (r.kind === "coast" ? 1160 : r.kind === "wetland" ? 155 : r.kind === "autumn" ? 105 : 240),
    y: r.kind === "autumn" ? route(r.x + 120).y - 15 : r.kind === "coast" ? lowestRail[r.index] - 36 : r.y - (r.kind === "gorge" ? 58 : 25),
    rx: r.kind === "coast" ? span * .44 : r.kind === "alpine" ? 155 : r.kind === "autumn" ? 26 : 115,
    rz: r.kind === "coast" ? 1060 : r.kind === "alpine" ? 110 : r.kind === "autumn" ? 20 : 78,
  });
  const plotBins = new Map<number, StationPlot[]>();
  for (const plot of plots) for (let bin = Math.floor((plot.x - 95) / 100); bin <= Math.floor((plot.x + 95) / 100); bin++) {
    const list = plotBins.get(bin) ?? []; list.push(plot); plotBins.set(bin, list);
  }
  const nearStation = (x: number, z: number, margin = 0) => (plotBins.get(Math.floor(x / 100)) ?? []).some(p =>
    Math.abs((x - p.x) * p.sideX + (z - p.z) * p.sideZ) < 27 + margin &&
    Math.abs((x - p.x) * p.forwardX + (z - p.z) * p.forwardZ) < 25 + margin);
  const height = (x: number, z: number) => {
    const p = route(x), side = z - p.z, away = Math.abs(side), r = regionAt(x);
    const lowHills = Math.sin(x * .008 + z * .011) * 9 + Math.sin(x * .019 - z * .007) * 5;
    const ridges = Math.pow(Math.abs(Math.sin(x * .0028 + z * .0037) + Math.sin(x * .005 - z * .0018) * .36), 1.8);
    const crags = Math.abs(Math.sin(x * .014 + z * .019)) * 37 + Math.sin(x * .038 - z * .022) * 13 + Math.sin(x * .071 + z * .064) * 5;
    let y = p.y - 10 + smooth(12, 110, away) * lowHills;
    y += smooth(210, 1000, away) * (ridges * 280 + crags + 55);
    // Flat bodies of water, carved into the land; no price-following uphill water.
    for (const k of [r.index - 1, r.index, r.index + 1]) {
      const feature = regions[k]; if (!feature) continue;
      if (feature.kind === "gorge") {
        const d = Math.abs(x - riverX(feature, z));
        const influence = (1 - smooth(23, 110, d)) * (1 - smooth(580, 820, Math.abs(z - feature.z)));
        y = y * (1 - influence) + (water(feature).y - 5) * influence;
      } else if (feature.kind === "coast") {
        const w = water(feature), dx = Math.abs(x - feature.x);
        const shore = feature.z - 105 - (x - feature.x) ** 2 / (span * 1.6), depth = shore - z;
        // The bay widens toward the horizon, but never past its own region: a wider cut
        // flattened the neighbouring mountains, and the sea above it hung in their sky.
        const inner = Math.min(span * .55 + Math.max(0, depth) * .3, span * .6), outer = Math.min(span * .65 + Math.max(0, depth) * .4, span * .72);
        const influence = smooth(-35, 22, depth) * (1 - smooth(inner, outer, dx));
        y = y * (1 - influence) + (w.y - 9) * influence;
      } else if (["wetland", "alpine", "autumn"].includes(feature.kind)) {
        const w = water(feature), radius = Math.hypot((x - w.x) / w.rx, (z - w.z) / w.rz);
        const influence = 1 - smooth(.88, 1.22, radius);
        y = y * (1 - influence) + (w.y - 7) * influence;
      }
    }
    // A level shelf under the whole exhibit footprint blends into its hillside.
    let weight = 0, shelf = y;
    for (const plot of plotBins.get(Math.floor(x / 100)) ?? []) {
      const dx = x - plot.x, dz = z - plot.z;
      const a = Math.abs(dx * plot.sideX + dz * plot.sideZ), b = Math.abs(dx * plot.forwardX + dz * plot.forwardZ);
      const w = (1 - smooth(24, 75, a)) * (1 - smooth(22, 70, b));
      if (w > weight) { weight = w; shelf = plot.y; }
    }
    y = y * (1 - weight) + shelf * weight;
    // Structural clearance even beside a steep slope or neighbouring terrace.
    const clearance = 1 - smooth(7, 13, away);
    if (y > p.y - 5.8) y += (p.y - 5.8 - y) * clearance;
    return y;
  };
  const dry = (x: number, z: number) => {
    const r = regionAt(x), w = water(r);
    if (r.kind === "gorge" && Math.abs(x - riverX(r, z)) < 32) return false;
    if (r.kind === "coast") return height(x, z) > w.y + 1;
    return !["wetland", "alpine", "autumn"].includes(r.kind) || Math.hypot((x - w.x) / w.rx, (z - w.z) / w.rz) > 1.07;
  };
  return { regions, plots, span, route, regionAt, riverX, water, height, nearStation, dry };
}
export type LandscapeLayout = ReturnType<typeof createLandscapeLayout>;

export type GroveTree = { x: number; z: number; kind: "oak" | "pine" | "birch" | "autumn" | "willow" | "orchard"; scale: number; yaw: number; tint: number };

/**
 * A stand of trees ahead of each exhibit, where the stop's camera looks. Scattered
 * planting alone thins out along coasts and steep climbs, and stops at the end of the
 * track, so several later exhibits were framed by bare hillside.
 */
export function stationGroves(layout: LandscapeLayout, target = 14): GroveTree[] {
  const trees: GroveTree[] = [];
  layout.plots.forEach((plot, index) => {
    const random = landscapeRandom(5003 + index * 7919);
    let placed = 0;
    for (let attempt = 0; attempt < 48 && placed < target; attempt++) {
      // Ahead of the exhibit (forward) and across the camera's view (side).
      const f = 45 + Math.pow(random(), 1.3) * 290, s = -18 + (random() * 2 - 1) * (f + 50) * .62;
      const x = plot.x + plot.sideX * s + plot.forwardX * f, z = plot.z + plot.sideZ * s + plot.forwardZ * f;
      const r = layout.regionAt(x);
      const kind = r.kind === "alpine" || r.kind === "gorge" || r.kind === "coast" ? "pine"
        : r.kind === "autumn" ? (random() > .2 ? "autumn" : "orchard")
          : r.kind === "wetland" ? (random() > .5 ? "willow" : "birch")
            : random() > .65 ? "birch" : "oak";
      const scale = .7 + random() * .7, yaw = random() * 6.28, tint = .86 + random() * .25;
      if (Math.abs(z - layout.route(x).z) < 26 || layout.nearStation(x, z, 17) || !layout.dry(x, z)) continue;
      if (Math.abs(layout.height(x + 5, z) - layout.height(x - 5, z)) > 15) continue;
      trees.push({ x, z, kind, scale, yaw, tint }); placed++;
    }
  });
  return trees;
}
