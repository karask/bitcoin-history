import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readCorpus = async (name) => JSON.parse(await readFile(new URL(`content/events-${name}.json`, root), "utf8"));
const all = [...await readCorpus("prehistory"), ...await readCorpus("early"), ...await readCorpus("late")];

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, html: await response.text() };
}
const meta = (html, key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

test("every event has a committed 1200×630 PNG share card, and nothing stale", async () => {
  const dir = new URL("public/og/events/", root);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
  assert.deepEqual(files, all.map((e) => `${e.slug}.png`).sort(), "run node tools/generate-event-og.mjs after adding or renaming events");
  for (const file of files) {
    const png = await readFile(new URL(file, dir));
    assert.equal(png.subarray(1, 4).toString(), "PNG", file);
    assert.equal(png.readUInt32BE(16), 1200, file);
    assert.equal(png.readUInt32BE(20), 630, file);
    assert.ok(png.length < 200_000, `${file} should stay small`);
  }
});

test("the card generator's colours and labels match the site", async () => {
  const gen = await readFile(new URL("tools/generate-event-og.mjs", root), "utf8");
  const palette = await readFile(new URL("lib/palette.ts", root), "utf8");
  const schema = await readFile(new URL("lib/event-schema.ts", root), "utf8");
  for (const [, id, colour] of palette.matchAll(/^\s+(\w+): "(#[0-9a-f]{6})",$/gm)) assert.match(gen, new RegExp(`${id}: "${colour}"`));
  const labels = schema.match(/categoryLabels[^{]*{([^}]*)}/)[1];
  for (const [, id, label] of labels.matchAll(/(\w+): "([^"]+)"/g)) assert.ok(gen.includes(`${id}: "${label}"`), id);
});

test("/present carries absolute og:image, twitter:image and og:url", async () => {
  const { status, html } = await render("/present");
  assert.equal(status, 200);
  assert.equal(meta(html, "og:image"), "https://kkarasavvas.com/bitcoin-history/og.png");
  assert.equal(meta(html, "twitter:image"), "https://kkarasavvas.com/bitcoin-history/og.png");
  assert.equal(meta(html, "og:url"), "https://kkarasavvas.com/bitcoin-history/present");
  assert.equal(meta(html, "twitter:card"), "summary_large_image");
  assert.ok(meta(html, "og:image:width") && meta(html, "og:image:height"));
});

test("event records and /present/<slug> share pages carry the event's own card", async () => {
  const event = all.find((e) => e.slug === "bitcoin-value-overflow-incident") ?? all[0];
  const image = `https://kkarasavvas.com/bitcoin-history/og/events/${event.slug}.png`;
  for (const path of [`/events/${event.slug}`, `/present/${event.slug}`]) {
    const { status, html } = await render(path);
    assert.equal(status, 200, path);
    assert.equal(meta(html, "og:image"), image, path);
    assert.equal(meta(html, "twitter:image"), image, path);
    assert.equal(meta(html, "og:image:width"), "1200", path);
    assert.equal(meta(html, "og:image:height"), "630", path);
    assert.equal(meta(html, "twitter:card"), "summary_large_image", path);
    assert.equal(meta(html, "og:url"), `https://kkarasavvas.com/bitcoin-history${path}`, path);
  }
  const { html } = await render(`/present/${event.slug}`);
  assert.match(html, new RegExp(`http-equiv="refresh" content="0;url=[^"]*/present\\?(?:setlist=[\\w-]+&amp;)?event=${event.slug}"`));
});

test("a share page exists for every event", async () => {
  const { status } = await render(`/present/${all.at(-1).slug}`);
  assert.equal(status, 200);
  assert.equal((await render("/present/not-a-real-event")).status, 404);
});
