import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildTrack, sampleTrack } from "../lib/track.ts";
import { createRidePath } from "../lib/ride-path.ts";
import { smoothDailyLogs, SMOOTH_RIDE_HEIGHT } from "../lib/ride-smoothing.ts";
import { comfortableSeatDirection, createRideCameraMotion, COMFORT_PITCH_LIMIT, COMFORT_TURN_RATE, exhibitTransitionSeconds } from "../lib/ride-camera.ts";
import { priceOnDate, formatDailyPrice } from "../lib/prices.ts";

const read = async name => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), "utf8"));
const events = [...await read("events-prehistory"), ...await read("events-early"), ...await read("events-late")].sort((a,b) => a.date.localeCompare(b.date));
const prices = (await read("price-context")).values;
const options = { resolution: 2400, pacingBlend: 0.82 };
const smoothed = buildTrack(events, prices, { ...options, smoothRide: true });

function turns(path) {
  let maximum = 0, total = 0;
  for (let d = 4; d < path.totalDistance - 4; d += 4) {
    const a = path.frame(path.uAtDistance(d - 4)).tangent, b = path.frame(path.uAtDistance(d + 4)).tangent;
    const angle = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
    maximum = Math.max(maximum, angle); total += angle;
  }
  return { maximum, total };
}

test("two-week log smoothing removes daily oscillations without overshoot or mutation", () => {
  const knots = Array.from({ length: 31 }, (_, day) => ({ day, logPrice: day % 2 ? 1 : 3 }));
  const before = JSON.stringify(knots), rounded = smoothDailyLogs(knots);
  assert.equal(JSON.stringify(knots), before);
  assert.deepEqual(rounded.map(k => k.day), knots.map(k => k.day));
  assert.ok(rounded.every(k => k.logPrice >= 1 && k.logPrice <= 3));
  assert.ok(Math.max(...rounded.slice(7,-7).map(k => k.logPrice)) - Math.min(...rounded.slice(7,-7).map(k => k.logPrice)) < 0.05);
  assert.equal(smoothDailyLogs([{ day: 1, logPrice: 2 }])[0].logPrice, 2);
});

test("rounded rail is much gentler across full, landmark, market and sparse setlists", () => {
  const setlists = [events, events.filter(e => e.significance === "landmark"), events.filter(e => e.category === "finance"), [events[0], events.at(-1)]];
  for (const list of setlists) {
    const raw = buildTrack(list, prices, options);
    const smooth = buildTrack(list, prices, { ...options, smoothRide: true });
    const baseline = turns(createRidePath(raw, sampleTrack));
    const path = createRidePath(smooth, sampleTrack), rounded = turns(path);
    assert.equal(path.height, SMOOTH_RIDE_HEIGHT);
    assert.ok(smooth.smoothing.bendSigmaUnits >= 100);
    assert.ok(rounded.maximum < 0.04, `sharp rounded bend: ${rounded.maximum} radians over 8 units`);
    assert.ok(rounded.maximum < baseline.maximum * 0.1);
    assert.ok(rounded.total < baseline.total * 0.1, "reduce repeated pitch reversals, not just their maximum");
    assert.deepEqual(smooth.stations.map(s => [s.slug,s.date,s.u]), raw.stations.map(s => [s.slug,s.date,s.u]));
    for (const station of smooth.stations) assert.equal(station.elevation, sampleTrack(smooth, station.u).elevation);
    const firstPriced = smooth.points.find(point => point.priceUsd !== null);
    for (const u of [0, Math.max(0, firstPriced.u - 0.001)]) assert.equal(path.point(u).y, path.floor);
  }
});

test("major cycles survive rounding while recorded prices remain untouched", () => {
  const height = slug => smoothed.stations.find(s => s.slug === slug).elevation;
  assert.ok(height("bitcoin-2017-cycle-high") > height("bitcoin-2018-cycle-low") + 0.04);
  assert.ok(height("bitcoin-all-time-high-november-2021") > height("bitcoin-2022-cycle-low") + 0.04);
  assert.ok(height("bitcoin-2025-all-time-high") > height("bitcoin-all-time-high-november-2021"));
  for (const event of events) {
    assert.equal(smoothed.stations.find(s => s.slug === event.slug).priceUsd, priceOnDate(prices, event.date, event.precision));
  }
  assert.equal(formatDailyPrice(priceOnDate(prices, "2011-02-09")), "$1.02");
  assert.equal(priceOnDate(prices, "2010-05-22"), null);
});

test("comfort keeps travelling pitch bounded, with unchanged horizontal heading", () => {
  for (const direction of [new THREE.Vector3(1,5,1), new THREE.Vector3(-2,-9,1), new THREE.Vector3(0,1,0), new THREE.Vector3(1,0,0)]) {
    const constrained = comfortableSeatDirection(direction);
    assert.ok(Math.abs(constrained.length() - 1) < 1e-9);
    assert.ok(Math.abs(Math.asin(constrained.y)) <= COMFORT_PITCH_LIMIT + 1e-9);
    if (direction.x || direction.z) assert.ok(Math.abs(direction.x * constrained.z - direction.z * constrained.x) < 1e-9);
  }
});

test("comfort camera turns are rate-limited and gently ramp up across frame rates", () => {
  for (const dt of [1/120,1/60,1/30,0.06]) {
    const camera = new THREE.PerspectiveCamera(), motion = createRideCameraMotion(camera);
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), COMFORT_PITCH_LIMIT);
    motion.update(new THREE.Vector3(), new THREE.Quaternion(), 65, "seat", dt, true);
    let previousRate = 0;
    for (let t = 0; t < 4; t += dt) {
      const before = camera.quaternion.clone(), position = new THREE.Vector3(t * 20,3,0);
      motion.update(position, target, 65, "seat", dt, true);
      const rate = before.angleTo(camera.quaternion) / dt;
      assert.ok(rate <= COMFORT_TURN_RATE + 1e-6);
      assert.ok(rate <= previousRate + 0.5 * dt + 1e-5, "no sudden spin-up");
      assert.equal(camera.position.distanceTo(position), 0, "do not introduce position lag or cut across hills");
      previousRate = rate;
    }
    assert.ok(camera.quaternion.angleTo(target) < 0.001);
  }
  assert.ok(exhibitTransitionSeconds(true) > exhibitTransitionSeconds(false));
});
