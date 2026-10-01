// Geometry submission estimate, not an FPS benchmark. No browser/GPU required.
import { readFile } from "node:fs/promises";
import * as T from "three";
import { buildTrack, sampleTrack } from "../lib/track.ts";
import { createRidePath } from "../lib/ride-path.ts";
import { createLandscape } from "../app/present/ride/landscape.ts";
import { createRailway } from "../app/present/ride/railway.ts";
import { createInstanceCuller } from "../app/present/ride/instance-culling.ts";

const read = async name => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), "utf8"));
const events = [...await read("events-prehistory"), ...await read("events-early"), ...await read("events-late")]
  .filter(e => process.argv.includes("--all") || e.significance === "landmark").sort((a, b) => a.date.localeCompare(b.date));
const track = buildTrack(events, (await read("price-context")).values, { resolution: 3200, pacingBlend: .82, smoothRide: true });
const path = createRidePath(track, sampleTrack);
const start = performance.now(), world = createLandscape(path, track), railway = createRailway(path, world.layout);
const scene = new T.Scene(); scene.add(world.group, railway.group);
const instances = createInstanceCuller([...world.cullable, ...railway.cullable]);
const constructionMs = Math.round(performance.now() - start);
const sun = new T.DirectionalLight(); scene.add(sun, sun.target);
Object.assign(sun.shadow.camera, { left: -105, right: 105, top: 95, bottom: -95, near: 10, far: 310 });
const camera = new T.PerspectiveCamera(65, 16 / 9, .15, 24000), frustum = new T.Frustum(), matrix = new T.Matrix4();
const samples = [];
let cullingMs = 0, cullingFrames = 0;
for (let i = 0; i < 21; i++) {
  const u = .01 + i / 20 * .98, p = path.point(u), ahead = path.point(Math.min(1, u + 100 / path.length));
  camera.position.set(p.x, p.y + 2.9, p.z); camera.lookAt(ahead.x, ahead.y + 2.1, ahead.z); camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  world.update(5, u, false, 1); railway.update(u, false); scene.updateMatrixWorld(true);
  sun.target.position.set(p.x, p.y, p.z); sun.position.copy(sun.target.position).add(new T.Vector3(-90, 140, 100));
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
  instances.update(frustum, sun.shadow.getFrustum());
  // Include the CPU cost of visibility tests, not just the saved GPU work.
  const cullStart = performance.now();
  for (let frame = 0; frame < 60; frame++) instances.update(frustum, sun.shadow.getFrustum());
  cullingMs += performance.now() - cullStart; cullingFrames += 60;
  let draws = 0, triangles = 0;
  scene.traverseVisible(o => {
    if (!o.isMesh || (o.isInstancedMesh && !o.count) || (o.frustumCulled && !frustum.intersectsObject(o))) return;
    draws++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  samples.push({ u: +u.toFixed(3), draws, triangles: Math.round(triangles) });
}
const geometries = new Set(); let geometryBytes = 0, matrixUpdates = 0;
scene.traverse(o => {
  if (o.matrixAutoUpdate) matrixUpdates++;
  if (!o.isMesh || geometries.has(o.geometry)) return;
  geometries.add(o.geometry);
  for (const a of Object.values(o.geometry.attributes)) geometryBytes += a.array.byteLength;
  geometryBytes += o.geometry.index?.array.byteLength ?? 0;
});
console.log(JSON.stringify({ events: events.length, constructionMs, activeGeometryMiB: +(geometryBytes / 1048576).toFixed(2), matrixUpdates,
  averageCullingMs: +(cullingMs / cullingFrames).toFixed(3),
  averageDraws: Math.round(samples.reduce((sum, s) => sum + s.draws, 0) / samples.length),
  averageTriangles: Math.round(samples.reduce((sum, s) => sum + s.triangles, 0) / samples.length), samples }, null, 2));
world.dispose(); railway.dispose();
