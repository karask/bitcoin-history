import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Keep the archive's coverage unless a maintainer explicitly requests a later day.
const output = new URL("../content/price-context.json", import.meta.url);
const previous = JSON.parse(await readFile(output, "utf8"));
const end = process.argv[2] ?? previous.source.coverage.match(/through (\d{4}-\d{2}-\d{2})/)[1];
const start = "2010-07-18";
const endTime = Date.parse(`${end}T00:00:00Z`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(endTime)
  || new Date(endTime).toISOString().slice(0, 10) !== end || end < start) {
  throw new Error("Supply a valid final observation date: YYYY-MM-DD");
}
const request = new URL("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics");
request.search = new URLSearchParams({ assets: "btc", metrics: "PriceUSD", frequency: "1d", start_time: start, end_time: end, page_size: "10000" });
const hash = createHash("sha256");
const values = {};
let page = request.href;
const visited = new Set();
while (page) {
  const url = new URL(page);
  if (url.origin !== request.origin || visited.has(page)) throw new Error("Invalid price-data pagination");
  visited.add(page);
  const response = await fetch(page, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Coin Metrics returned HTTP ${response.status}`);
  const raw = await response.text();
  hash.update(raw);
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload.data)) throw new Error("Missing daily observations");
  for (const row of payload.data) {
    const date = row.time?.slice(0, 10);
    if (row.asset !== "btc" || !/^\d{4}-\d{2}-\d{2}T00:00:00/.test(row.time ?? "")) {
      throw new Error("Unexpected asset or observation timestamp");
    }
    if (date < start || date > end) continue;
    if (row.PriceUSD === null || row.PriceUSD === undefined) continue;
    const price = Number(row.PriceUSD);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid price at ${date}`);
    if (Object.hasOwn(values, date)) throw new Error(`Duplicate observation at ${date}`);
    values[date] = price;
  }
  page = payload.next_page_url;
}
const dates = Object.keys(values).sort();
if (dates[0] !== start || dates.at(-1) !== end) throw new Error("Incomplete requested price coverage; archive unchanged");
const result = {
  source: {
    provider: "Coin Metrics",
    metric: "PriceUSD",
    frequency: "Daily reference price",
    observationTime: "00:00 UTC on the source's dated observation; not an intraday high or event-time trade",
    coverage: `${start} through ${end} UTC`,
    retrievedOn: new Date().toISOString().slice(0, 10),
    request: request.href,
    documentation: "https://docs.coinmetrics.io/api/v4/",
    rawResponseSha256: hash.digest("hex"),
  },
  values: Object.fromEntries(dates.map(date => [date, values[date]])),
};
// Only replace the bundle after every response and observation has been validated.
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Saved ${dates.length} daily BTC/USD observations (${start} through ${end}).`);
