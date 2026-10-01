import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as T from "three";
import { buildTrack, sampleTrack } from "../lib/track.ts";
import { createRidePath } from "../lib/ride-path.ts";
import { createLandscapeLayout, landscapes } from "../app/present/ride/landscape-layout.ts";
import { createLandscape } from "../app/present/ride/landscape.ts";
import { createRailway } from "../app/present/ride/railway.ts";

const read = async n => JSON.parse(await readFile(new URL(`../content/${n}.json`, import.meta.url), "utf8"));
const events = [...await read("events-prehistory"), ...await read("events-early"), ...await read("events-late")].sort((a, b) => a.date.localeCompare(b.date));
const prices = (await read("price-context")).values;
const make = list => { const track = buildTrack(list, prices, { resolution: 3200, pacingBlend: .82, smoothRide: true }); return { track, path: createRidePath(track, sampleTrack) }; };

test("station terraces support the exhibit footprints without burying the railway", () => {
  for (const selection of [events, events.filter(e => e.significance === "landmark"), [events[0], events.at(-1)]]) {
    const { track, path } = make(selection), land = createLandscapeLayout(path, track);
    for (const plot of land.plots) for (const x of [-17.5, 0, 17.5]) for (const z of [-13.5, 0, 13.5]) {
      const ground = land.height(plot.x + plot.sideX * x - plot.forwardX * z, plot.z + plot.sideZ * x - plot.forwardZ * z);
      assert.ok(ground <= plot.y + .15, "no earth inside an exhibit");
      assert.ok(plot.y - ground <= .35, "the foundation must reach its hillside");
    }
    for (let i = 0; i <= 1500; i++) {
      const p = path.point(i / 1500); assert.ok(land.height(p.x, p.z) <= p.y - 5.79, "terrain must leave room for the rail's structural spine");
    }
    assert.deepEqual(new Set(land.regions.map(r => r.kind)), new Set(landscapes));
    for (let i = 1; i < land.regions.length; i++) assert.notEqual(land.regions[i].kind, land.regions[i - 1].kind);
  }
});

test("rivers and lakes occupy carved beds and the coast opens towards the horizon", () => {
  const { track, path } = make(events.filter(e => e.significance === "landmark")), land = createLandscapeLayout(path, track);
  for (const r of land.regions) {
    if (["wetland", "alpine", "autumn"].includes(r.kind)) { const w = land.water(r); assert.ok(land.height(w.x, w.z) < w.y - 4); }
    if (r.kind === "coast") {
      const w = land.water(r);
      for (const z of [r.z - 300, r.z - 1500, r.z - 2500]) assert.ok(land.height(r.x, z) < w.y, "no mountain wall enclosing the sea");
    }
    if (r.kind === "gorge") {
      const y = land.water(r).y;
      for (const dz of [-500, -300, 300, 500]) assert.ok(land.height(land.riverX(r, r.z + dz), r.z + dz) < y - 3);
    }
  }
});

test("landscape and railway use finite, bounded geometry and release shared resources once", () => {
  const { track, path } = make(events.filter(e => e.significance === "landmark"));
  const world = createLandscape(path, track), railway = createRailway(path, world.layout);
  const resources = new Map(), watch = resource => {
    if (!resource || resources.has(resource)) return;
    resources.set(resource, 0); resource.addEventListener("dispose", () => resources.set(resource, resources.get(resource) + 1));
  };
  let instances = 0, uniqueVertices = 0;
  for (const root of [world.group, railway.group]) root.traverse(object => {
    if (!object.isMesh) return;
    if (object.isInstancedMesh) { watch(object); instances += object.count; for (const n of object.instanceMatrix.array) assert.ok(Number.isFinite(n)); }
    const g = object.geometry;
    if (!resources.has(g)) uniqueVertices += g.getAttribute("position").count;
    watch(g);
    for (const n of g.getAttribute("position").array) assert.ok(Number.isFinite(n));
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) { watch(m); for (const key of ["map", "bumpMap"]) watch(m[key]); }
  });
  assert.ok(instances > 3000, "the complete landscape, not just the first vegetation batch, is present");
  assert.ok(uniqueVertices < 1300000, `shared geometry exceeds budget: ${uniqueVertices}`);
  for (const u of [0, .25, .5, .8, 1]) { world.update(3, u, false, .55); railway.update(u, false); }
  world.update(4, .5, true, 1); railway.update(.5, true);
  world.group.updateMatrixWorld(true); assert.ok(!new T.Box3().setFromObject(world.group).isEmpty());
  world.dispose(); railway.dispose(); world.dispose(); railway.dispose();
  for (const [resource, count] of resources) assert.equal(count, 1, `${resource.type ?? resource.constructor.name} leaked or disposed twice`);
  assert.equal(world.group.children.length, 0); assert.equal(railway.group.children.length, 0);
});
