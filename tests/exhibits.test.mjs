import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as T from "three";
import { exhibitDesigns, exhibitDesign } from "../app/present/ride/exhibit-design.ts";
import { buildExhibit } from "../app/present/ride/exhibits.ts";
import { ExhibitKit } from "../app/present/ride/exhibit-kit.ts";
import { assemblyScene, protocolScene } from "../app/present/ride/exhibit-scenes.ts";
import { installCanvasStub } from "./helpers/canvas.mjs";

const all = (await Promise.all(["prehistory", "early", "late"].map(async name => JSON.parse(await readFile(new URL(`../content/events-${name}.json`, import.meta.url), "utf8"))))).flat();
const record = slug => all.find(e => e.slug === slug);
const prices = JSON.parse(await readFile(new URL("../content/price-context.json", import.meta.url), "utf8")).values;
const design = slug => exhibitDesign(record(slug));

test("all 292 records have explicit, non-orphaned editorial assignments", () => {
  assert.equal(all.length, 292);
  assert.deepEqual(Object.keys(exhibitDesigns).sort(), all.map(e => e.slug).sort());
  assert.equal(new Set(Object.values(exhibitDesigns).map(d => d.kind)).size, 24);
});

test("important historical changes are not just swapped labels", () => {
  for (const slugs of [
    ["bitcoin-pizza-offer-posted", "bitcoin-pizza-purchase"],
    ["el-salvador-bitcoin-law-announced", "el-salvador-bitcoin-law-passed", "el-salvador-bitcoin-law-effective", "el-salvador-amends-bitcoin-law"],
    ["central-african-republic-bitcoin-legal-tender", "central-african-republic-removes-bitcoin-legal-tender"],
    ["steam-accepts-bitcoin", "steam-drops-bitcoin"],
    ["mt-gox-halts-bitcoin-withdrawals", "mt-gox-files-for-bankruptcy", "mt-gox-civil-rehabilitation", "mt-gox-bitcoin-repayments-begin"],
    ["blackrock-files-spot-bitcoin-etp", "us-spot-bitcoin-etps-approved", "us-spot-bitcoin-etps-start-trading"],
    ["taproot-bips-published", "taproot-locks-in", "taproot-activates"],
    ["tesla-bitcoin-purchase-disclosed", "tesla-sells-most-bitcoin"],
    ["bitcoin-2017-cycle-high", "bitcoin-2018-cycle-low"],
  ]) assert.equal(new Set(slugs.map(s => JSON.stringify(design(s)))).size, slugs.length, slugs.join(" / "));
});

test("scenes encode the affected asset and do not imply a conviction or enacted bill", () => {
  const restore = installCanvasStub();
  try {
    for (const [slug, artifact] of [
      ["coincheck-hack", "affected-asset:NEM"], ["bybit-exchange-theft", "affected-asset:ETH"],
      ["coinbase-customer-data-theft", "identity-records-not-coin-theft"],
      ["charlie-shrem-charged", "allegations-not-conviction"],
      ["fit21-passes-us-house", "legislative-stage:1"],
      ["clarity-act-senate-banking-advances", "legislative-stage:0"],
      ["mt-gox-bitcoin-repayments-begin", "creditor-repayments"],
      ["bitcoin-value-overflow-incident", "validation-repair-not-exchange-collapse"],
      ["segwit-activates", "transactions-inside-block-cutaway"],
      ["segwit-activates", "witness-on-chain-in-same-block"],
      ["segwit-activates", "witness-commitment-via-coinbase"],
    ]) {
      const e = buildExhibit(record(slug), 0xffaa66);
      assert.ok(e.group.userData.design.artifacts.includes(artifact), slug); e.dispose();
    }
  } finally { restore(); }
});

test("March 2013 has a longer canonical branch, not a bridge between fork tips", () => {
  const restore = installCanvasStub();
  try {
    const k = new ExhibitKit(record("march-2013-chain-split"), design("march-2013-chain-split"), 0xffaa66);
    const labels = [], label = k.label.bind(k);
    k.label = (text, ...args) => { labels.push(text); return label(text, ...args); };
    protocolScene(k);
    const blocks = k.static.children.filter(o => o.isMesh && o.geometry.type === "RoundedBoxGeometry" && o.geometry.parameters.width === 3.3);
    assert.ok(blocks.filter(o => o.position.y === 5).length > blocks.filter(o => o.position.y === 11.5).length);
    k.static.traverse(o => {
      const points = o.geometry?.parameters?.path?.points;
      if (!points) return;
      const a = points[0], b = points.at(-1);
      assert.ok(!(a.x > 0 && b.x > 0 && Math.abs(a.y - b.y) > 3), "fork tips must not connect");
    });
    assert.ok(labels.includes("0.7-COMPATIBLE / CANONICAL"));
    assert.ok(labels.includes("0.8 BRANCH / ABANDONED"));
    assert.ok(labels.every(text => !text.includes("REJOINED")));
    const exhibit = k.finish(), bounds = new T.Box3().setFromObject(exhibit.group);
    assert.ok(bounds.min.x >= -23 && bounds.max.x <= 23 && bounds.max.y <= 27);
    exhibit.dispose();
  } finally { restore(); }
});

test("hearing, conference and speech chairs are entirely clear of the stage", () => {
  const restore = installCanvasStub();
  try {
    for (const slug of ["us-senate-virtual-currency-hearings", "first-bitcoin-conference-new-york", "trump-bitcoin-nashville-policy-speech"]) {
      const k = new ExhibitKit(record(slug), design(slug), 0xffaa66);
      assemblyScene(k); k.group.updateMatrixWorld(true);
      const stage = k.static.children.find(o => o.geometry?.parameters.width === 28 && o.geometry?.parameters.depth === 15);
      assert.ok(stage, slug);
      const stageBounds = new T.Box3().setFromObject(stage);
      const chairs = k.static.children.filter(o => o.isGroup);
      assert.equal(chairs.length, 4, slug);
      for (const chair of chairs) {
        const bounds = new T.Box3().setFromObject(chair);
        assert.ok(bounds.min.z > stageBounds.max.z + .25, `${slug}: chair must clear the stage edge`);
        assert.equal(bounds.intersectsBox(stageBounds), false, slug);
      }
      k.finish().dispose();
    }
  } finally { restore(); }
});

test("each family stays finite, inside its island, and owns no per-station lights", () => {
  const restore = installCanvasStub();
  try {
    const selected = new Map(); for (const e of all) selected.set(design(e.slug).kind, e);
    selected.set("purchase", record("bitcoin-pizza-purchase"));
    selected.set("segwit-active", record("segwit-activates"));
    for (const e of selected.values()) {
      const exhibit = buildExhibit(e, 0xffaa66);
      const bounds = new T.Box3().setFromObject(exhibit.group);
      for (const v of [...bounds.min.toArray(), ...bounds.max.toArray()]) assert.ok(Number.isFinite(v), e.slug);
      assert.ok(bounds.min.x >= -23 && bounds.max.x <= 23, `${e.slug}: width ${bounds.min.x} / ${bounds.max.x}`);
      assert.ok(bounds.min.z >= -15 && bounds.max.z <= 16, `${e.slug}: depth`);
      assert.ok(bounds.max.y <= 27 && bounds.min.y >= -3, `${e.slug}: height`);
      let lights = 0; exhibit.group.traverse(o => { if (o.isLight) lights++; }); assert.equal(lights, 0, e.slug);
      exhibit.dispose();
    }
  } finally { restore(); }
});

test("exhibit disposal releases every live geometry, material and texture exactly once", () => {
  const restore = installCanvasStub();
  try {
    for (const slug of ["bitcoin-pizza-purchase", "bitcoin-pizza-offer-posted", "genesis-block-mined", "first-bitcoin-halving", "ftx-chapter-11", "segwit-activates"]) {
      const exhibit = buildExhibit(record(slug), 0xffaa66), resources = new Map();
      const watch = resource => { if (resource && !resources.has(resource)) { resources.set(resource, 0); resource.addEventListener("dispose", () => resources.set(resource, resources.get(resource) + 1)); } };
      exhibit.group.traverse(o => {
        if (!o.isMesh) return;
        watch(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) { watch(m); for (const v of Object.values(m)) if (v?.isTexture) watch(v); }
      });
      exhibit.update(1); exhibit.dispose(); exhibit.dispose(); exhibit.update(2);
      for (const n of resources.values()) assert.equal(n, 1, slug);
      assert.equal(exhibit.group.children.length, 0);
    }
  } finally { restore(); }
});

test("both Pizza Day lids physically clear the oven bricks, including angled edge flaps", () => {
  const restore = installCanvasStub();
  try {
    for (const slug of ["bitcoin-pizza-purchase", "bitcoin-pizza-offer-posted"]) {
      const exhibit = buildExhibit(record(slug), 0xffaa66);
      const bounds = b => new T.Box3(new T.Vector3(...b.min), new T.Vector3(...b.max));
      const { lids, ovenBricks } = exhibit.group.userData.occlusion;
      assert.equal(lids.length, 2); assert.equal(ovenBricks.length, 17);
      for (const lid of lids) for (const brick of ovenBricks) assert.equal(bounds(lid).intersectsBox(bounds(brick)), false, `${slug}: masonry clips through a lid`);
      exhibit.dispose();
    }
  } finally { restore(); }
});

test("market lows are valleys with the price they claim; highs keep the sculpture", () => {
  const restore = installCanvasStub();
  try {
    // As lib/events.ts derives it: the daily reference on the event's exact date, if any.
    const priced = slug => { const event = record(slug); return { ...event, priceUsd: event.precision === "day" ? prices[event.date] ?? null : null }; };
    const artifacts = slug => { const e = buildExhibit(priced(slug), 0xffaa66), list = e.group.userData.design.artifacts, bounds = new T.Box3().setFromObject(e.group); e.dispose(); return { list, bounds }; };
    for (const slug of ["bitcoin-2018-cycle-low", "bitcoin-2022-cycle-low", "bitcoin-black-thursday", "april-2013-bitcoin-market-crash", "october-2025-liquidation-event"]) {
      const { list, bounds } = artifacts(slug);
      for (const part of ["descending-market-valley", "low-point-flag", "valley-lake", "daily-reference-price"]) assert.ok(list.includes(part), `${slug}: ${part}`);
      assert.ok(bounds.min.x >= -23 && bounds.max.x <= 23 && bounds.max.y <= 27, `${slug} stays on its plinth`);
    }
    const low = artifacts("bitcoin-2018-cycle-low").list;
    for (const part of ["descending-trail", "painted-sky:dusk"]) assert.ok(low.includes(part), part);
    const crash = artifacts("bitcoin-black-thursday").list;
    for (const part of ["rockslide-breaks-trail", "painted-sky:storm"]) assert.ok(crash.includes(part), part);
    assert.ok(artifacts("october-2025-liquidation-event").list.includes("liquidation-dominoes"));
    // Highs, first quotes and index listings keep the directional sculpture.
    for (const slug of ["bitcoin-dollar-parity", "bitcoin-2017-cycle-high", "bitcoin-2025-all-time-high", "new-liberty-standard-exchange-rate", "microstrategy-added-nasdaq100"]) {
      const { list } = artifacts(slug);
      assert.ok(list.includes("ascending-market-sculpture"), slug);
      assert.ok(!list.includes("descending-market-valley"), slug);
    }
  } finally { restore(); }
});
