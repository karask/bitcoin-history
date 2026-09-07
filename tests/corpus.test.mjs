import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../content/${name}`, import.meta.url), "utf8"));
const events = [
  ...await readJson("events-prehistory.json"),
  ...await readJson("events-early.json"),
  ...await readJson("events-late.json"),
];

const categories = new Set(["origins", "protocol", "mining", "adoption", "infrastructure", "finance", "policy", "crisis"]);
const kinds = new Set([
  "research", "release", "activation", "fork", "launch", "adoption",
  "record", "failure", "law", "guidance", "ruling", "enforcement", "culture",
]);
const evidenceStates = new Set(["documented", "well-supported", "disputed", "estimated"]);

// Kept in step with LANDMARK_LIMIT / MAJOR_LIMIT in lib/event-schema.ts.
const LANDMARK_LIMIT = 32;
const MAJOR_LIMIT = 120;

const bySignificance = (level) => events.filter((event) => event.significance === level);

test("ships a substantial, unique and chronologically bounded archive", () => {
  assert.ok(events.length >= 240 && events.length <= 340, `expected 240–340 events, found ${events.length}`);
  const slugs = new Set(events.map((event) => event.slug));
  assert.equal(slugs.size, events.length, "event slugs must be unique");
  assert.ok(events.every((event) => event.date >= "1980-01-01" && event.date <= "2026-08-28"));
});

test("significance tiers stay meaningful", () => {
  const landmarks = bySignificance("landmark");
  const majors = bySignificance("major");
  assert.ok(
    landmarks.length <= LANDMARK_LIMIT,
    `landmark is a scarce tier: ${landmarks.length} exceeds the cap of ${LANDMARK_LIMIT}`,
  );
  assert.ok(landmarks.length >= 24, "the archive needs a full set of presentation landmarks");
  assert.ok(majors.length <= MAJOR_LIMIT, `major inflated to ${majors.length}, cap is ${MAJOR_LIMIT}`);
  for (const event of landmarks) {
    assert.equal(event.curated, true, `${event.slug} is a landmark but not curated`);
  }
  for (const event of events) {
    assert.equal(
      event.curated,
      event.significance !== "context",
      `${event.slug} curated flag disagrees with its significance`,
    );
  }
});

test("every event has valid taxonomy, copy, and source evidence", () => {
  for (const event of events) {
    assert.match(event.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(categories.has(event.category), `${event.slug} has an unknown category`);
    assert.ok(event.categories.includes(event.category), `${event.slug} omits its primary category`);
    assert.ok(kinds.has(event.kind), `${event.slug} has an unknown kind: ${event.kind}`);
    assert.ok(evidenceStates.has(event.evidence), `${event.slug} has an unknown evidence state`);
    assert.ok(event.summary.length >= 12 && event.details.length >= 24 && event.whyItMatters.length >= 8);
    assert.ok(event.sources.length >= 1, `${event.slug} has no source`);
    if (event.endDate) assert.ok(event.endDate >= event.date, `${event.slug} ends before it starts`);
    for (const source of event.sources) {
      assert.doesNotThrow(() => new URL(source.url), `${event.slug} has a malformed source URL`);
      assert.ok(source.type === "primary" || source.type === "secondary");
    }
  }
});

test("landmarks carry corroborated, primary evidence", () => {
  for (const event of bySignificance("landmark")) {
    assert.ok(event.sources.length >= 2, `landmark ${event.slug} rests on a single source`);
    assert.ok(
      event.sources.some((source) => source.type === "primary"),
      `landmark ${event.slug} has no primary source`,
    );
  }
});

test("no event is sourced only to a Bitcoin Wiki year index", () => {
  // A year page lists events; it does not document any particular one.
  const isYearIndex = (url) => /en\.bitcoin\.it\/wiki\/(19|20)\d{2}$/.test(url);
  for (const event of events) {
    assert.ok(
      !event.sources.every((source) => isYearIndex(source.url)),
      `${event.slug} cites only a Bitcoin Wiki year index`,
    );
  }
});

test("places are structured and resolvable", () => {
  for (const event of events) {
    assert.ok(Array.isArray(event.places) && event.places.length >= 1, `${event.slug} has no place`);
    for (const place of event.places) {
      assert.match(place.country, /^[A-Z]{2}$/, `${event.slug} has a malformed country code`);
      if (place.subdivision) {
        assert.match(place.subdivision, /^[A-Z]{2}-[A-Z0-9]{1,3}$/, `${event.slug} has a malformed subdivision`);
        assert.ok(
          place.subdivision.startsWith(`${place.country}-`),
          `${event.slug} subdivision ${place.subdivision} does not belong to ${place.country}`,
        );
      }
    }
    assert.ok(!("regions" in event), `${event.slug} still carries the legacy regions field`);
  }
});

test("related threads point at events that exist", () => {
  const slugs = new Set(events.map((event) => event.slug));
  for (const event of events) {
    for (const slug of event.related ?? []) {
      assert.ok(slugs.has(slug), `${event.slug} links to unknown related slug ${slug}`);
      assert.notEqual(slug, event.slug, `${event.slug} links to itself`);
    }
  }
});

test("the corpus covers every category and kind", () => {
  for (const category of categories) {
    assert.ok(events.some((event) => event.categories.includes(category)), `no event in category ${category}`);
  }
  for (const kind of kinds) {
    assert.ok(events.some((event) => event.kind === kind), `no event of kind ${kind}`);
  }
});

test("the market record is not left unexplained", () => {
  // The site charts price through 2026; the archive must account for what it shows.
  const priceRecords = events.filter((event) => event.kind === "record" && event.categories.includes("finance"));
  assert.ok(priceRecords.length >= 8, "price history needs both tops and bottoms on the record");
  for (const year of ["2017", "2021", "2025"]) {
    assert.ok(
      events.some((event) => event.date.startsWith(year) && event.kind === "record"),
      `no market record for the ${year} cycle`,
    );
  }
});
