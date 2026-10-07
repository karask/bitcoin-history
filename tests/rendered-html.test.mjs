import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readCorpus = async (name) =>
  JSON.parse(await readFile(new URL(`../content/events-${name}.json`, import.meta.url), "utf8"));
const all = [...await readCorpus("prehistory"), ...await readCorpus("early"), ...await readCorpus("late")];
const eventCount = all.length;
const curatedCount = all.filter((event) => event.curated).length;
const firstCuratedEvent = all.find((event) => event.curated);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the timeline explorer and site metadata", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /BITCOIN TIMECHAIN/i);
  assert.match(html, /History doesn’t move/i);
  assert.match(html, /One chain\. Hundreds/i);
  assert.match(html, /Start the 3D ride/i);
  assert.match(html, /Ride through Bitcoin history in 3D/i);
  assert.match(html, /class="browse-events" href="#explore"/);
  assert.match(html, /class="hero-scroll" href="#explore"/);
  assert.match(html, /Scroll to explore the events/i);
  assert.match(html, /ride-preview\.webp/);
  assert.doesNotMatch(html, /01 \/ ORIGINS/, "the hero kicker no longer carries a stale chapter label");
  // One header everywhere: the same destinations under the same names.
  assert.match(html, />Timeline<\/a>.*>3D ride<\/a>.*>Method<\/a>/s);
  assert.match(html, /VISIBLE CHAIN/i);
  assert.match(html, /ALL EVENTS/i);
  assert.match(html, /FILTERS/i);
  assert.match(html, new RegExp(`${curatedCount}[^<]*</strong>[^<]*CURATED`, "i"));
  assert.match(html, new RegExp(`${eventCount}[^<]*</strong>[^<]*ALL EVENTS`, "i"));
  assert.match(html, new RegExp(`/events/${firstCuratedEvent.slug}`, "i"));
  assert.match(html, /og\.png/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the archive ships a visible search and a year jump bar", async () => {
  const html = await (await render("/")).text();
  // Search is in the page, not behind the Filters button.
  assert.match(html, /<input[^>]*type="search"/);
  for (const year of new Set(all.filter((event) => event.curated).map((event) => event.date.slice(0, 4)))) {
    assert.match(html, new RegExp(`href="#year-${year}"`), `no jump link for ${year}`);
    assert.match(html, new RegExp(`id="year-${year}"`), `no year group for ${year}`);
  }
  assert.match(html, /aria-pressed="true"[^>]*>List</, "the compact list is the default layout");
});

test("the white-paper record includes a licensed archive artifact", async () => {
  const response = await render("/events/bitcoin-white-paper-announced");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /archive\/whitepaper\.png/i);
  assert.match(html, /CC0 \/ Wikimedia Commons/i);
});

test("event pages distinguish exact-date daily reference prices from sourced milestones", async () => {
  const parity = await render("/events/bitcoin-dollar-parity");
  const html = await parity.text();
  assert.equal(parity.status, 200);
  assert.match(html, /DAILY · 00:00 UTC/);
  assert.match(html, /\$1\.02/);
  assert.match(html, /EVENT PRICE MILESTONE/);
  assert.match(html, /Mt\. Gox parity threshold/);
  assert.match(html, /\$1\.00/);
  assert.doesNotMatch(html, /MONTH CLOSE|\$0\.64/);
  // The pizza purchase predates the first observation, and says so rather than showing a price.
  const pizza = await (await render("/events/bitcoin-pizza-purchase")).text();
  assert.match(pizza, /Before the first recorded exchange price/);
  assert.doesNotMatch(pizza, /<strong>\$[\d.,]+<\/strong>/);
});

test("event pages link into the ride and chart the price at the time", async () => {
  const html = await (await render("/events/first-bitcoin-halving")).text();
  assert.match(html, /Ride to this stop/);
  // The first show that stops here, starting at this event, returning to this record.
  assert.match(html, /href="\/present\?setlist=grand-tour&amp;event=first-bitcoin-halving&amp;from=record"/);
  assert.match(html, /IN THE SHOWS/);
  assert.match(html, /class="price-at-time"/);
  assert.match(html, /role="img" aria-label="Bitcoin price history on a log scale/);
  assert.match(html, />Timeline<\/a>.*>3D ride<\/a>.*>Method<\/a>/s);
  // A month-precision record has no daily price, and the page says why.
  const monthly = all.find((event) => event.precision === "month" && event.date >= "2011-01-01");
  assert.match(await (await render(`/events/${monthly.slug}`)).text(), /Exact date unknown, so no daily price/);
});

test("the site icon resolves from every page, not relative to the current path", async () => {
  for (const path of ["/", "/present", "/events/bitcoin-pizza-purchase"]) {
    const html = await (await render(path)).text();
    assert.match(html, /<link rel="icon" href="\/favicon\.png"/, `${path}: icon must be root-relative`);
  }
});

test("event detail metadata is record-specific and clears the generic card", async () => {
  const event = all.find((item) => item.slug === "bitcoin-white-paper-announced");
  const response = await render(`/events/${event.slug}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const escapedTitle = event.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(escapedTitle, "i"));
  assert.match(html, /SOURCES/i);
  assert.doesNotMatch(html, /og\.png/i);
});

test("presentation route renders a user-triggered launch", async () => {
  const response = await render("/present");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Enter the Timechain/i);
  assert.match(html, /Sound stays off until you turn it on/i);
  assert.match(html, /track follows a smoothed price trend/i);
  assert.match(html, /Comfort mode starts on/i);
  assert.match(html, /ride-launch\.webp/);
  // Every other show is offered on the start screen, with its length.
  assert.match(html, /The Satoshi Question[\s\S]*?\d+ stops/);
  assert.doesNotMatch(html, /Rail follows/, "the start screen no longer uses the old Rail name");
  assert.match(html, /Presentation mode — Bitcoin Timechain/i);
});

test("filtered presentations ship the data needed for client-side static selection", async () => {
  const response = await render("/present?setlist=filtered&scope=all&cat=protocol&sig=landmark");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Enter the Timechain/i);
  assert.match(html, /bitcoin-white-paper-announced/i);
  assert.match(html, /bitcoin-2025-all-time-high/i);
});

test("robots and sitemap use absolute canonical URLs and archive revision dates", async () => {
  const robots = await render("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/kkarasavvas\.com\/bitcoin-history\/sitemap\.xml/i);

  const sitemap = await render("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.match(xml, /<loc>https:\/\/kkarasavvas\.com\/bitcoin-history\/events\//i);
  const { source } = JSON.parse(await readFile(new URL("../content/price-context.json", import.meta.url), "utf8"));
  assert.match(xml, new RegExp(`<lastmod>${source.retrievedOn}T00:00:00\\.000Z</lastmod>`, "i"));
});
