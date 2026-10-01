import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { priceOnDate, formatDailyPrice } from "../lib/prices.ts";
import { buildTrack, sampleTrack } from "../lib/track.ts";

const bundle = JSON.parse(await readFile(new URL("../content/price-context.json", import.meta.url), "utf8"));
const corpus = (await Promise.all(["prehistory", "early", "late"].map(async name =>
  JSON.parse(await readFile(new URL(`../content/events-${name}.json`, import.meta.url), "utf8"))))).flat();

test("the daily bundle preserves positive, dated observations and source provenance", () => {
  const dates = Object.keys(bundle.values);
  assert.ok(dates.length > 5800);
  assert.deepEqual(dates, [...dates].sort());
  for (const date of dates) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(bundle.values[date]) && bundle.values[date] > 0);
  }
  assert.equal(dates[0], "2010-07-18");
  assert.ok(bundle.source.coverage.includes(dates.at(-1)));
  assert.match(bundle.source.frequency, /daily/i);
  assert.match(bundle.source.observationTime, /00:00 UTC/);
  assert.match(bundle.source.rawResponseSha256, /^[a-f0-9]{64}$/);
  assert.equal(new URL(bundle.source.request).searchParams.get("frequency"), "1d");
});

test("event prices use only exact daily observations, never monthly or interpolated values", () => {
  const series = { "2020-01": 999, "2020-01-01": 10, "2020-01-03": 100 };
  assert.equal(priceOnDate(series, "2020-01-01"), 10);
  assert.equal(priceOnDate(series, "2020-01-02"), null);
  assert.equal(priceOnDate(series, "2019-12-31"), null);
  assert.equal(priceOnDate(series, "2020-01-04"), null);
  assert.equal(priceOnDate(series, "2020-01-01", "month"), null);
  assert.equal(priceOnDate(series, "2020-01-01", "year"), null);
  for (const invalid of [NaN, Infinity, 0, -1]) assert.equal(priceOnDate({ "2020-01-01": invalid }, "2020-01-01"), null);
  const events = ["2020-01-01", "2020-01-02", "2020-01-03"].map((date, i) => ({ slug: `example-${i}`, date, category: "finance", significance: "major" }));
  const track = buildTrack(events, series, { pacingBlend: 0 });
  assert.ok(sampleTrack(track, track.stations[1].u).priceUsd > 10, "geometry may interpolate for smooth travel");
  assert.equal(priceOnDate(series, track.stations[1].date), null, "displayed quote must not come from geometry");
});

test("parity uses its full precision observation and retains cents in the display", () => {
  assert.equal(priceOnDate(bundle.values, "2011-02-09"), 1.01605024547049);
  assert.equal(formatDailyPrice(priceOnDate(bundle.values, "2011-02-09")), "$1.02");
  assert.equal(priceOnDate(bundle.values, "2010-05-22"), null);
  assert.equal(formatDailyPrice(0.00076), "$0.00076");
});

test("price milestone amounts are separately sourced, rather than inferred daily highs", () => {
  const milestones = corpus.filter(event => event.priceMilestone);
  assert.equal(milestones.length, 7);
  for (const event of milestones) {
    assert.ok(event.priceMilestone.usd > 0);
    assert.equal(typeof event.priceMilestone.approximate, "boolean");
    assert.match(event.priceMilestone.source.url, /^https:\/\//);
    assert.ok(event.priceMilestone.source.publisher);
    assert.ok(event.priceMilestone.label);
    assert.notEqual(event.priceMilestone.usd, priceOnDate(bundle.values, event.date));
  }
  assert.equal(corpus.find(event => event.slug === "bitcoin-price-reaches-1000-dollars").date, "2013-11-27");
});
