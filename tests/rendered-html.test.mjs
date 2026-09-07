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
  assert.match(html, /CINEMATIC MODE/i);
  assert.match(html, /VISIBLE CHAIN/i);
  assert.match(html, /ALL EVENTS/i);
  assert.match(html, /FILTERS/i);
  assert.match(html, new RegExp(`${curatedCount}[^<]*</strong>[^<]*CURATED`, "i"));
  assert.match(html, new RegExp(`${eventCount}[^<]*</strong>[^<]*ALL EVENTS`, "i"));
  assert.match(html, new RegExp(`/events/${firstCuratedEvent.slug}`, "i"));
  assert.match(html, /og\.png/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the white-paper record includes a licensed archive artifact", async () => {
  const response = await render("/events/bitcoin-white-paper-announced");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /archive\/whitepaper\.png/i);
  assert.match(html, /CC0 \/ Wikimedia Commons/i);
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
  assert.match(html, /Sound remains off/i);
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
  assert.match(xml, /<lastmod>2026-08-24T00:00:00\.000Z<\/lastmod>/i);
});
