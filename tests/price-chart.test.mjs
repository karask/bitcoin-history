import assert from "node:assert/strict";
import test from "node:test";

const { buildPriceChart } = await import("../lib/price-chart.ts");

const series = { "2010-07-18": 0.1, "2014-01-01": 800, "2018-01-01": 13000, "2022-01-01": 47000, "2026-01-01": 90000 };

test("the marker sits on the event date, inside the plot", () => {
  const chart = buildPriceChart(series, "2018-01-01", { width: 320, height: 120, gutter: 38 });
  assert.ok(chart.marker.x > chart.gutter && chart.marker.x < chart.width);
  assert.ok(chart.marker.y !== null, "an observed date gets a dot");
  assert.equal(chart.beforeSeries, false);
  assert.match(chart.pastPath, /^M/, "the chart emphasises the history up to the event");
  assert.ok(chart.pastPath.length < chart.path.length);
});

test("events before the first price clamp to the left edge without a dot", () => {
  const chart = buildPriceChart(series, "2009-01-03");
  assert.equal(chart.beforeSeries, true);
  assert.equal(chart.marker.x, chart.gutter);
  assert.equal(chart.marker.y, null);
  assert.equal(chart.pastPath, "");
});

test("a date with no observation is marked without inventing a price", () => {
  const chart = buildPriceChart(series, "2016-06-15");
  assert.equal(chart.marker.y, null);
  assert.ok(chart.marker.x > chart.gutter);
});

test("gridlines skip alternate decades so labels stay legible", () => {
  const chart = buildPriceChart(series, "2018-01-01");
  const decades = chart.grid.map((line) => Math.log10(line.usd));
  for (let index = 1; index < decades.length; index += 1) assert.equal(decades[index] - decades[index - 1], 2);
  for (const line of chart.grid) assert.ok(line.y >= 0 && line.y <= chart.height);
});
