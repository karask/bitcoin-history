import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  buildTrack, sampleTrack, speedAt, catmullRom, priceGridlines, yearTicks, dwellFor, trackConstants,
} = await import("../lib/track.ts");

const priceContext = JSON.parse(await readFile(new URL("../content/price-context.json", import.meta.url), "utf8"));
const series = priceContext.values;

const readCorpus = async (name) =>
  JSON.parse(await readFile(new URL(`../content/events-${name}.json`, import.meta.url), "utf8"));
const allEvents = [...await readCorpus("prehistory"), ...await readCorpus("early"), ...await readCorpus("late")]
  .sort((a, b) => a.date.localeCompare(b.date));

const toInput = (event) => ({
  slug: event.slug,
  date: event.date,
  category: event.category,
  significance: event.significance,
  kind: event.kind,
});

const landmarks = allEvents.filter((event) => event.significance === "landmark").map(toInput);
const fullTrack = buildTrack(allEvents.map(toInput), series);

test("interpolated rail height has a continuous slope at every priced sample", () => {
  const t = buildTrack(landmarks.slice(0, 32), series, { resolution: 2400, pacingBlend: 0.82 });
  const h = 1e-9;
  for (const p of t.points.slice(2, -2)) {
    if (sampleTrack(t, p.u - h).priceUsd === null) continue;
    const left = (sampleTrack(t, p.u).elevation - sampleTrack(t, p.u - h).elevation) / h;
    const right = (sampleTrack(t, p.u + h).elevation - sampleTrack(t, p.u).elevation) / h;
    assert.ok(Math.abs(left - right) < 0.02, `${p.date}: corner in the rail (${left} vs ${right})`);
  }
});

test("catmull-rom passes through its inner control points", () => {
  assert.equal(catmullRom(0, 1, 2, 3, 0), 1);
  assert.equal(catmullRom(0, 1, 2, 3, 1), 2);
  // Monotone inputs must not overshoot between the inner knots.
  for (let t = 0; t <= 1; t += 0.05) {
    const value = catmullRom(0, 1, 2, 3, t);
    assert.ok(value >= 1 - 1e-9 && value <= 2 + 1e-9, `overshoot at t=${t}: ${value}`);
  }
});

test("the track is monotone in u and spans the full event range", () => {
  assert.equal(fullTrack.points[0].u, 0);
  assert.equal(fullTrack.points[fullTrack.points.length - 1].u, 1);
  for (let i = 1; i < fullTrack.points.length; i += 1) {
    assert.ok(fullTrack.points[i].u > fullTrack.points[i - 1].u, `u not increasing at ${i}`);
    assert.ok(fullTrack.points[i].date >= fullTrack.points[i - 1].date, `date went backwards at ${i}`);
  }
  assert.equal(fullTrack.span.from, allEvents[0].date);
  assert.equal(fullTrack.span.to, allEvents[allEvents.length - 1].date);
});

test("every station lands at its own date, in order", () => {
  assert.equal(fullTrack.stations.length, allEvents.length);
  for (let i = 0; i < fullTrack.stations.length; i += 1) {
    assert.equal(fullTrack.stations[i].slug, allEvents[i].slug);
    assert.equal(fullTrack.stations[i].date, allEvents[i].date);
    if (i > 0) {
      assert.ok(
        fullTrack.stations[i].u > fullTrack.stations[i - 1].u,
        `stations ${allEvents[i - 1].slug} and ${allEvents[i].slug} share a position`,
      );
    }
  }
});

test("elevation is flat through the pre-price era and rises with price", () => {
  const beforePrice = fullTrack.points.filter((point) => point.priceUsd === null);
  assert.ok(beforePrice.length > 0, "the full track should include the years before Bitcoin had a price");
  for (const point of beforePrice) {
    assert.equal(point.elevation, 0, `elevation should be flat at ${point.date}`);
    assert.equal(point.momentum, 0, `momentum should be zero at ${point.date}`);
  }
  assert.ok(fullTrack.firstPricedU > 0 && fullTrack.firstPricedU < 1);

  // Higher price must always mean higher elevation.
  const priced = fullTrack.points.filter((point) => point.priceUsd !== null);
  const sorted = [...priced].sort((a, b) => a.priceUsd - b.priceUsd);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(
      sorted[i].elevation >= sorted[i - 1].elevation - 1e-9,
      `elevation not monotone in price: $${sorted[i - 1].priceUsd} -> $${sorted[i].priceUsd}`,
    );
  }
});

test("elevation stays inside its normalised range", () => {
  for (const point of fullTrack.points) {
    assert.ok(point.elevation >= 0 && point.elevation <= 1, `elevation out of range at ${point.date}`);
    assert.ok(point.lateral >= -1 && point.lateral <= 1, `lateral out of range at ${point.date}`);
  }
});

test("the elevation profile matches known price history", () => {
  const at = (date) => {
    const point = fullTrack.points.find((item) => item.date >= date);
    return point ? point.elevation : null;
  };
  // 2013 peak above the 2011 peak; 2018 trough below the 2017 peak; 2026 below the 2025 top.
  assert.ok(at("2013-12-01") > at("2011-06-01"), "the 2013 top should sit above the 2011 top");
  assert.ok(at("2018-12-01") < at("2017-12-01"), "2018 should sit below the 2017 top");
  assert.ok(at("2022-11-01") < at("2021-11-01"), "2022 should sit below the 2021 top");
  assert.ok(at("2026-06-01") < at("2025-10-01"), "the 2026 drawdown should sit below the 2025 top");
  assert.ok(at("2024-12-01") > at("2020-12-01"), "$100k should sit above the 2020 close");
});

test("speed stays inside its clamp across the whole ride", () => {
  for (let u = 0; u <= 1; u += 0.002) {
    const speed = speedAt(fullTrack, u);
    assert.ok(Number.isFinite(speed), `speed is not finite at u=${u}`);
    assert.ok(
      speed >= trackConstants.MIN_SPEED - 1e-9 && speed <= trackConstants.MAX_SPEED + 1e-9,
      `speed ${speed} outside clamp at u=${u}`,
    );
  }
});

test("descending runs faster than climbing", () => {
  const climbing = fullTrack.points.filter((point) => point.grade > 0.5);
  const falling = fullTrack.points.filter((point) => point.grade < -0.5);
  assert.ok(climbing.length && falling.length, "the track needs both climbs and drops");
  const mean = (list) => list.reduce((total, point) => total + speedAt(fullTrack, point.u), 0) / list.length;
  assert.ok(mean(falling) > mean(climbing), "drops should be faster than climbs");
});

test("sampling interpolates continuously between points", () => {
  let previous = sampleTrack(fullTrack, 0).elevation;
  for (let u = 0.001; u <= 1; u += 0.001) {
    const current = sampleTrack(fullTrack, u).elevation;
    assert.ok(Math.abs(current - previous) < 0.05, `elevation jumped at u=${u}`);
    previous = current;
  }
  assert.equal(sampleTrack(fullTrack, -5).u, 0, "sampling clamps below the track");
  assert.equal(sampleTrack(fullTrack, 5).u, 1, "sampling clamps above the track");
});

test("pacing blend trades real time against even spacing", () => {
  const byTime = buildTrack(allEvents.map(toInput), series, { pacingBlend: 0 });
  const byIndex = buildTrack(allEvents.map(toInput), series, { pacingBlend: 1 });
  // Even spacing puts every station the same distance apart.
  const gaps = byIndex.stations.slice(1).map((station, i) => station.u - byIndex.stations[i].u);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread < 1e-9, "pacingBlend=1 should space stations evenly");
  // Real time leaves the sparse pre-Bitcoin decades occupying much more of the track.
  assert.ok(byTime.firstPricedU > byIndex.firstPricedU, "linear time should stretch the pre-price era");
});

test("a short setlist still builds a usable track", () => {
  const short = buildTrack(landmarks, series);
  assert.equal(short.stations.length, landmarks.length);
  assert.ok(short.points.length > 100);
  for (const station of short.stations) {
    assert.ok(station.u >= 0 && station.u <= 1);
  }
  const single = buildTrack([landmarks[0]], series);
  assert.equal(single.stations.length, 1);
  assert.ok(Number.isFinite(single.points[0].elevation));
});

test("gridlines and year ticks stay inside the track", () => {
  const lines = priceGridlines(fullTrack);
  assert.ok(lines.length >= 4, "expected several decade gridlines");
  for (const line of lines) {
    assert.ok(line.elevation >= 0 && line.elevation <= 1);
  }
  const ticks = yearTicks(fullTrack);
  assert.ok(ticks.length > 1);
  for (let i = 1; i < ticks.length; i += 1) {
    assert.ok(ticks[i].u > ticks[i - 1].u, "year ticks must advance along the track");
    assert.ok(ticks[i].year > ticks[i - 1].year);
  }
});

test("dwell time scales with significance", () => {
  assert.ok(dwellFor("landmark") > dwellFor("major"));
  assert.ok(dwellFor("major") > dwellFor("context"));
});

test("buildTrack rejects an empty setlist", () => {
  assert.throws(() => buildTrack([], series), /at least one event/);
});
