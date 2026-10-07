/**
 * A small, static log-price chart for event pages. Built on the server from the bundled
 * daily series, so the page ships an SVG path rather than the series itself.
 */

export type PriceChart = {
  /** Path for the whole series, in a 0–width × 0–height box. */
  path: string;
  /** The part of `path` up to the event, drawn emphasised. */
  pastPath: string;
  width: number;
  height: number;
  /** Event position; `y` is null when there is no observation on the event date. */
  marker: { x: number; y: number | null };
  /** True when the event predates the first observation. */
  beforeSeries: boolean;
  from: string;
  to: string;
  /** Gridlines every other decade inside the plotted range; labels sit in the left gutter. */
  grid: { y: number; usd: number }[];
  gutter: number;
};

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

export function buildPriceChart(
  series: Record<string, number>,
  eventDate: string,
  { width = 320, height = 120, samples = 260, gutter = 38 } = {},
): PriceChart {
  const dates = Object.keys(series).sort();
  const first = dates[0], last = dates.at(-1)!;
  const start = dayOf(first), span = Math.max(1, dayOf(last) - start);
  const logs = dates.map((date) => Math.log10(series[date]));
  const min = Math.min(...logs), max = Math.max(...logs);
  const pad = 6;
  const x = (day: number) => gutter + ((day - start) / span) * (width - gutter);
  const y = (log: number) => pad + (1 - (log - min) / Math.max(max - min, 1e-9)) * (height - pad * 2);

  // Even sampling in time keeps the shape; every observation would be ~6,000 points.
  const step = Math.max(1, Math.floor(dates.length / samples));
  const picked: number[] = [];
  for (let index = 0; index < dates.length; index += step) picked.push(index);
  if (picked.at(-1) !== dates.length - 1) picked.push(dates.length - 1);
  const point = (index: number) => `${x(dayOf(dates[index])).toFixed(1)},${y(logs[index]).toFixed(1)}`;
  const path = picked.map((index, n) => `${n ? "L" : "M"}${point(index)}`).join("");

  const eventDay = dayOf(eventDate);
  const beforeSeries = eventDate < first;
  const markerX = Math.min(width, Math.max(gutter, x(eventDay)));
  const past = picked.filter((index) => dates[index] <= eventDate);
  const pastPath = past.length > 1 ? past.map((index, n) => `${n ? "L" : "M"}${point(index)}`).join("") : "";
  const observed = series[eventDate];

  const grid: { y: number; usd: number }[] = [];
  for (let decade = Math.ceil(min); decade <= Math.floor(max); decade += 1) {
    if ((decade - Math.ceil(min)) % 2 === 0) grid.push({ y: y(decade), usd: 10 ** decade });
  }

  return {
    path, pastPath, width, height, beforeSeries, from: first, to: last, grid, gutter,
    marker: { x: markerX, y: observed ? y(Math.log10(observed)) : null },
  };
}
