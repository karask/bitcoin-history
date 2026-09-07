import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildTrack, sampleTrack } from "../lib/track.ts";
import { createRidePath, advanceRide } from "../lib/ride-path.ts";
import { buildExhibit, exhibitKind } from "../app/present/ride/exhibits.ts";

const read = async name => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), "utf8"));
const all = [...await read("events-prehistory"), ...await read("events-early"), ...await read("events-late")].sort((a,b) => a.date.localeCompare(b.date));
const prices = await read("price-context");
const track = buildTrack(all, prices.values, { resolution: 2400, lastObservationDate: "2026-08-23" });
const path = createRidePath(track, sampleTrack);

test("3D height, rail position and price use the same chronological parameter", () => {
  for (const station of track.stations) {
    const p = path.point(station.u), data = sampleTrack(track, station.u);
    assert.ok(Math.abs(p.y - (data.priceUsd === null ? path.floor : path.base + data.elevation * path.height)) < 1e-9, station.slug);
    assert.ok(Math.abs(p.x / path.length - station.u) < 1e-9, station.slug);
  }
  const pizza = track.stations.find(s => s.slug === "bitcoin-pizza-purchase");
  assert.equal(path.point(pizza.u).y, path.floor, "pizza must be on the pre-price flat track, not at a later price altitude");
});

test("arc distance round-trips back to the correct date, including both ends", () => {
  for (let i = 0; i <= 1000; i++) {
    const u = i / 1000;
    assert.ok(Math.abs(path.uAtDistance(path.distanceAt(u)) - u) < 1e-9);
  }
  assert.equal(path.uAtDistance(-100), 0);
  assert.equal(path.uAtDistance(path.totalDistance + 100), 1);
});

test("tight price reversals get an anticipatory, bidirectional braking envelope", () => {
  const t = buildTrack(all.filter(e => e.significance === "landmark").slice(0, 32), prices.values, { resolution: 2400, pacingBlend: 0.82 });
  const p = createRidePath(t, sampleTrack);
  let tightBends = 0;
  for (let d = 4; d < p.totalDistance - 4; d += 2) {
    const a = p.frame(p.uAtDistance(d - 4)).tangent, b = p.frame(p.uAtDistance(d + 4)).tangent;
    const angle = Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const limit = p.speedLimitAt(d);
    assert.ok(limit > 0 && limit <= 190);
    if (angle > 0.5) { tightBends++; assert.ok(limit < 20, "slow down before sharp vertical reversals"); }
    for (const ahead of [d - 2, d + 2]) {
      assert.ok(Math.abs(limit ** 2 - p.speedLimitAt(ahead) ** 2) / 4 < 32, "limit must be reachable with gentle braking in either direction");
    }
  }
  assert.ok(tightBends > 10, "test the actual compressed price reversals");
});

test("ride frames are finite, orthogonal and normalized on climbs and descents", () => {
  const dot = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z;
  for (let i = 0; i <= 1000; i++) {
    const { tangent, side, up } = path.frame(i / 1000);
    for (const a of [tangent, side, up]) assert.ok(Math.abs(dot(a,a) - 1) < 1e-8);
    assert.ok(Math.abs(dot(tangent, side)) < 1e-8);
    assert.ok(Math.abs(dot(tangent, up)) < 1e-8);
    assert.ok(Math.abs(dot(side, up)) < 1e-8);
  }
});

test("pause freezes an underway journey, and speed affects actual travel", () => {
  assert.deepEqual(advanceRide(100, 1000, 80, 0.016, -0.4, 1, true), { distance: 100, velocity: 80 });
  const simulate = (grade, speed, target = 1500) => {
    let state = { distance: 0, velocity: 0 }, ticks = 0;
    while (state.distance !== target && ticks++ < 20000) state = advanceRide(state.distance, target, state.velocity, 1/60, grade, speed, false);
    assert.equal(state.distance, target); assert.equal(state.velocity, 0);
    return ticks;
  };
  assert.ok(simulate(-0.3, 1) < simulate(0.3, 1), "descents run faster than climbs");
  assert.ok(simulate(0, 1.5) < simulate(0, 0.75), "speed selection affects motion");
  assert.ok(simulate(0, 1, -500) > 0, "backwards travel arrives exactly");
});

test("monthly closes are dated at month-end and interpolation cannot invent extrema", () => {
  const input = ["2020-01-31", "2020-02-29", "2020-03-31", "2020-04-30"].map((date,i) => ({ slug: `price-${i}`, date, category: "finance", significance: "major" }));
  const sample = buildTrack(input, { "2020-01": 10, "2020-02": 100, "2020-03": 20, "2020-04": 50 }, { resolution: 3000, pacingBlend: 0 });
  sample.stations.forEach((s, i) => assert.ok(Math.abs(s.priceUsd - [10,100,20,50][i]) < 1e-8));
  for (const p of sample.points) assert.ok(p.priceUsd >= 10 - 1e-8 && p.priceUsd <= 100 + 1e-8);
});

test("each ride leg visibly accelerates from rest then brakes to a stop", () => {
  for (const speed of [0.75, 1, 1.5]) {
    let state = { distance: 0, velocity: 0 };
    const samples = [];
    for (let i = 0; i < 10000 && state.distance < 300; i++) {
      state = advanceRide(state.distance, 300, state.velocity, 1 / 60, 0, speed, false);
      samples.push(state);
    }
    assert.equal(state.distance, 300); assert.equal(state.velocity, 0);
    const peak = samples.reduce((best, s, i) => s.velocity > samples[best].velocity ? i : best, 0);
    assert.ok(peak > 60 / speed, "departure must accelerate over a visible interval");
    assert.ok(samples.length - peak > 45 / speed, "arrival must have a visible braking interval");
    for (let i = 1; i < peak; i++) assert.ok(samples[i].velocity >= samples[i - 1].velocity - 1e-9);
    for (let i = peak + 1; i < samples.length; i++) assert.ok(samples[i].velocity <= samples[i - 1].velocity + 1e-9);
  }
});

// Canvas text is rasterized by the browser. This stub tests actual Three geometry,
// transforms, finite bounds, batching and all-record coverage without needing WebGL.
const previousDocument = globalThis.document;
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {}, measureText: text => ({ width: text.length * 45 }) }) }) };
test("every historical record has a buildable, detailed 3D exhibit", () => {
  try {
    const kinds = new Set();
    for (const record of all) {
      kinds.add(exhibitKind(record));
      const exhibit = buildExhibit(record, 0xffbb66);
      let meshes = 0, vertices = 0;
      exhibit.group.updateMatrixWorld(true);
      exhibit.group.traverse(object => {
        if (!object.isMesh) return;
        meshes++;
        const positions = object.geometry.getAttribute("position"); vertices += positions.count;
        for (const value of positions.array) assert.ok(Number.isFinite(value), `${record.slug}: invalid geometry`);
      });
      assert.ok(vertices > 1000, `${record.slug}: no detailed exhibit`);
      assert.ok(meshes < 190, `${record.slug}: unbatched render budget (${meshes} meshes)`);
      exhibit.update(2); exhibit.dispose();
    }
    assert.equal(kinds.size, 9);
  } finally { globalThis.document = previousDocument; }
});
