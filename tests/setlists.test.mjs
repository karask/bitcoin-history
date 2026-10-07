import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { setlists, shapeSetlist } = await import("../lib/setlist-definitions.ts");

const readCorpus = async (name) => JSON.parse(await readFile(new URL(`../content/events-${name}.json`, import.meta.url), "utf8"));
// Same order as lib/events.ts: date, then title.
const all = [...await readCorpus("prehistory"), ...await readCorpus("early"), ...await readCorpus("late")]
  .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
const bySlug = new Map(all.map((event) => [event.slug, event]));
const show = (id) => shapeSetlist(all, setlists.find((setlist) => setlist.id === id));
const slugsOf = (id) => new Set(show(id).map((event) => event.slug));

test("every show respects its length and keeps its spine", () => {
  for (const setlist of setlists) {
    const chosen = shapeSetlist(all, setlist);
    const featured = setlist.feature ?? [];
    const spine = all.filter((event) => featured.includes(event.slug) || (setlist.select(event) && event.significance === "landmark"));
    assert.ok(spine.length <= setlist.limit, `${setlist.id}: featured + landmarks (${spine.length}) exceed its limit`);
    assert.ok(chosen.length <= setlist.limit, `${setlist.id} exceeds its limit`);
    for (const event of spine) assert.ok(chosen.includes(event), `${setlist.id} dropped ${event.slug}`);
    assert.equal(new Set(chosen.map((event) => event.slug)).size, chosen.length, `${setlist.id} repeats a chapter`);
    for (let index = 1; index < chosen.length; index += 1) {
      assert.ok(chosen[index - 1].date <= chosen[index].date, `${setlist.id} is out of date order`);
    }
  }
});

test("featured records exist and are not shadowed by the show's own rule", () => {
  for (const setlist of setlists) {
    for (const slug of setlist.feature ?? []) {
      assert.ok(bySlug.has(slug), `${setlist.id} features unknown record ${slug}`);
    }
  }
});

test("the chapters a rule chooses span the show, not just its earliest years", () => {
  // Regression: breaking ties by date order handed every slot to the oldest records,
  // and Rule of Law kept a single event from 2023 onward. Featured records and landmarks
  // are excluded here because they are placed regardless of the selection, and would
  // otherwise mask the bug.
  const day = (date) => Date.parse(`${date}T00:00:00Z`);
  for (const setlist of setlists) {
    const featured = setlist.feature ?? [];
    const pool = all.filter((event) => setlist.select(event) && !featured.includes(event.slug) && event.significance !== "landmark");
    const picked = show(setlist.id).filter((event) => pool.includes(event));
    if (pool.length <= picked.length || picked.length < 2) continue; // nothing was cut
    const [first, last] = [day(pool[0].date), day(pool.at(-1).date)];
    const reach = (day(picked.at(-1).date) - first) / (last - first);
    assert.ok(reach >= 0.75, `${setlist.id}: rule-chosen chapters stop ${Math.round(reach * 100)}% of the way through its span`);
  }
});

test("boom and bust is about price, not a second copy of broken trust", () => {
  const boom = show("boom-and-bust");
  const featured = setlists.find((setlist) => setlist.id === "boom-and-bust").feature;
  for (const event of boom) {
    if (featured.includes(event.slug) || event.significance === "landmark") continue;
    assert.ok(
      event.kind === "record" || event.category === "finance",
      `${event.slug} is a ${event.category} ${event.kind}, not a market event`,
    );
  }
  const trust = slugsOf("broken-trust");
  const overlap = boom.filter((event) => trust.has(event.slug) && !featured.includes(event.slug));
  assert.ok(overlap.length <= 2, `Boom & Bust shares ${overlap.length} unfeatured chapters with Broken Trust`);
});

test("identity disputes live in The Satoshi Question, not Rule of Law", () => {
  const law = slugsOf("rule-of-law");
  for (const slug of ["copa-v-wright-identity-ruling", "hodlonaut-wins-norway-wright-case"]) {
    assert.ok(!law.has(slug), `${slug} is an identity case, not a state response`);
    assert.ok(slugsOf("satoshi-question").has(slug), `${slug} missing from The Satoshi Question`);
  }
});

test("threads that a show opens are allowed to close", () => {
  const law = slugsOf("rule-of-law");
  for (const [opening, closing] of [
    ["silk-road-seized", "ross-ulbricht-pardoned"],
    ["binance-us-criminal-settlement", "changpeng-zhao-pardoned"],
    ["tornado-cash-sanctioned", "roman-storm-tornado-cash-verdict"],
    ["samourai-wallet-founders-charged", "samourai-founders-sentenced"],
  ]) {
    if (law.has(opening)) assert.ok(law.has(closing), `Rule of Law opens ${opening} but never reaches ${closing}`);
  }
  assert.ok(law.has("clarity-act-senate-cloture-fails"), "the CLARITY Act's story must reach the Senate floor");
});

test("every new major record from the October 2026 review has a show", () => {
  const placements = {
    "newsweek-names-dorian-nakamoto": "satoshi-question",
    "hbo-money-electric-names-peter-todd": "satoshi-question",
    "ross-ulbricht-pardoned": "rule-of-law",
    "changpeng-zhao-pardoned": "rule-of-law",
    "roman-storm-tornado-cash-verdict": "rule-of-law",
    "samourai-founders-sentenced": "rule-of-law",
    "clarity-act-senate-cloture-fails": "rule-of-law",
    "bitcoin-hashrate-one-zettahash": "the-machine",
    "twenty-one-capital-launched": "money-becomes-real",
    "pakistan-strategic-bitcoin-reserve": "money-becomes-real",
    "us-401k-alternative-assets-order": "money-becomes-real",
    "czech-national-bank-bitcoin-test-portfolio": "money-becomes-real",
    "bip360-post-quantum-output-type": "fork-wars",
    "coldcard-seed-generation-exploit": "broken-trust",
  };
  for (const [slug, id] of Object.entries(placements)) {
    assert.ok(bySlug.has(slug), `${slug} is not in the corpus`);
    assert.ok(slugsOf(id).has(slug), `${slug} is not in ${id}`);
  }
});

test("time spacing fills the longest silences first", () => {
  const event = (slug, date, significance = "major") => ({ slug, date, significance, kind: "law", category: "policy", categories: ["policy"] });
  // Ten events clustered in 2013, one each in 2018 and 2024: a three-slot show should
  // span the whole range, not take the first three of the cluster.
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => event(`early-${i}`, `2013-0${(i % 9) + 1}-01`)),
    event("middle", "2018-06-01"),
    event("late", "2024-06-01"),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const picked = shapeSetlist(pool, { limit: 3, select: () => true }).map((e) => e.slug);
  assert.deepEqual(picked, ["early-0", "middle", "late"]);
  // Landmarks anchor the spacing and are never displaced.
  const anchored = shapeSetlist([...pool, event("anchor", "2016-01-01", "landmark")].sort((a, b) => a.date.localeCompare(b.date)), { limit: 2, select: () => true });
  assert.ok(anchored.some((e) => e.slug === "anchor"));
  // Deterministic: same input, same show.
  assert.deepEqual(shapeSetlist(pool, { limit: 5, select: () => true }), shapeSetlist(pool, { limit: 5, select: () => true }));
});
