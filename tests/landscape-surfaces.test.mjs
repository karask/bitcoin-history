import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as T from "three";
import { buildTrack, sampleTrack } from "../lib/track.ts";
import { createRidePath } from "../lib/ride-path.ts";
import { createLandscapeLayout } from "../app/present/ride/landscape-layout.ts";
import { createLandscapeSurfaces } from "../app/present/ride/landscape-surfaces.ts";

const read = async name => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), "utf8"));
const events = [...await read("events-prehistory"), ...await read("events-early"), ...await read("events-late")]
  .filter(e => e.significance === "landmark").sort((a, b) => a.date.localeCompare(b.date));
const track = buildTrack(events, (await read("price-context")).values, { resolution: 3200, pacingBlend: .82, smoothRide: true });
const layout = createLandscapeLayout(createRidePath(track, sampleTrack), track);

function fixture() {
  const group = new T.Group(), ground = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const water = new T.MeshStandardMaterial({ color: 0x4c9c9c, roughness: .24, metalness: .3, transparent: true, opacity: .86, depthWrite: false, side: T.DoubleSide });
  const x = Math.round(layout.regions[0].x), z = Math.round(layout.regions[0].z);
  const tile = (start, end) => {
    const positions = [], normals = [], normal = new T.Vector3();
    for (const px of [start, end]) for (const pz of [z - 40, z + 40]) {
      positions.push(px, layout.height(px, pz), pz);
      normal.set(layout.height(px - 1, pz) - layout.height(px + 1, pz), 2, layout.height(px, pz - 1) - layout.height(px, pz + 1)).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    const mesh = new T.Mesh(geo, ground); group.add(mesh); return mesh;
  };
  const tiles = [tile(x - 20, x), tile(x, x + 20)];
  const coast = layout.regions.find(r => r.kind === "coast"), w = layout.water(coast);
  const seaGeometry = new T.PlaneGeometry(200, 1200, 1, 6); seaGeometry.rotateX(-Math.PI / 2);
  const sea = new T.Mesh(seaGeometry, water); sea.position.set(w.x, w.y, coast.z - 650); group.add(sea);
  // A rotated horizontal plane and vertical waterfall exercise world-space UVs.
  const top = new T.Mesh(new T.PlaneGeometry(20, 18), water); top.rotation.x = -Math.PI / 2;
  top.position.set(layout.regions[2].x, layout.regions[2].y, layout.regions[2].z); group.add(top);
  const fall = new T.Mesh(new T.PlaneGeometry(20, 30), water); fall.position.copy(top.position); group.add(fall);
  const other = new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshStandardMaterial({ color: 0xc08050 })); group.add(other);
  const surfaces = createLandscapeSurfaces(layout, ground, water);
  const textures = [...new Set([ground.map, ground.normalMap, water.normalMap])];
  const dispose = () => {
    surfaces.dispose(); ground.dispose(); water.dispose(); other.material.dispose();
    group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  };
  return { group, ground, water, tiles, sea, top, fall, other, surfaces, textures, dispose };
}

test("surface baking preserves meshes and structural geometry while producing finite, continuous colors", () => {
  const f = fixture(), structure = new Map();
  f.group.traverse(o => {
    if (!o.isMesh) return;
    structure.set(o, { material: o.material, geometry: o.geometry, index: o.geometry.index,
      position: o.geometry.getAttribute("position"), normal: o.geometry.getAttribute("normal"),
      positions: o.geometry.getAttribute("position").array.slice(), normals: o.geometry.getAttribute("normal").array.slice() });
  });
  const beforeChildren = [...f.group.children], untouched = { ...f.other.geometry.attributes };
  f.surfaces.apply(f.group);
  assert.deepEqual(f.group.children, beforeChildren, "surface detail must not add draw objects");
  for (const [mesh, before] of structure) {
    assert.equal(mesh.material, before.material);
    assert.equal(mesh.geometry, before.geometry);
    assert.equal(mesh.geometry.index, before.index);
    assert.equal(mesh.geometry.getAttribute("position"), before.position);
    assert.equal(mesh.geometry.getAttribute("normal"), before.normal);
    assert.deepEqual(before.position.array, before.positions);
    assert.deepEqual(before.normal.array, before.normals);
    if (mesh === f.other) continue;
    const colors = mesh.geometry.getAttribute("color"), uvs = mesh.geometry.getAttribute("uv");
    assert.equal(colors.count, before.position.count); assert.equal(uvs.count, before.position.count);
    for (const n of colors.array) assert.ok(Number.isFinite(n) && n >= 0 && n <= 1);
    for (const n of uvs.array) assert.ok(Number.isFinite(n));
  }
  assert.deepEqual(f.other.geometry.attributes, untouched, "unrelated sculpture materials must not be modified");
  const left = f.tiles[0].geometry.getAttribute("color"), right = f.tiles[1].geometry.getAttribute("color");
  assert.deepEqual([...left.array.slice(6, 12)], [...right.array.slice(0, 6)], "shared terrain edges must have identical baked colors");
  assert.ok(new Set(f.sea.geometry.getAttribute("color").array).size > 6, "the coast must retain a shallow-to-deep color gradient");
  for (const mesh of [f.top, f.fall]) {
    const uv = mesh.geometry.getAttribute("uv");
    assert.ok(new Set(Array.from({ length: uv.count }, (_, i) => uv.getY(i))).size > 1, "horizontal and vertical water both need non-degenerate UVs");
  }
  const baked = f.tiles.map(m => m.geometry.getAttribute("color"));
  f.surfaces.apply(f.group);
  assert.deepEqual(f.tiles.map(m => m.geometry.getAttribute("color")), baked, "repeated apply must reuse baked buffers");
  f.dispose();
});

test("surface construction is deterministic and shares a compact terrain texture", () => {
  const a = fixture(), b = fixture();
  a.surfaces.apply(a.group); b.surfaces.apply(b.group);
  for (let i = 0; i < a.tiles.length; i++) assert.deepEqual(a.tiles[i].geometry.getAttribute("color").array, b.tiles[i].geometry.getAttribute("color").array);
  assert.equal(new Set(a.textures).size, 2);
  assert.equal(a.ground.map, a.ground.normalMap, "albedo and normals must share the same texture and UV transform");
  let bytes = 0;
  a.textures.forEach((texture, i) => {
    assert.deepEqual(texture.image.data, b.textures[i].image.data);
    assert.equal(texture.wrapS, T.RepeatWrapping); assert.equal(texture.wrapT, T.RepeatWrapping);
    assert.equal(texture.minFilter, T.LinearMipmapLinearFilter); assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.colorSpace, T.NoColorSpace, "packed normal RGB must never be sRGB-decoded");
    assert.ok(texture.image.width <= 256 && texture.image.height <= 256);
    for (let width = texture.image.width, height = texture.image.height; width >= 1 && height >= 1; width /= 2, height /= 2) bytes += width * height * 4;
  });
  assert.equal(bytes, 371368, "one 256px texture and one 64px texture including their mipmaps");
  assert.equal(a.ground.bumpMap, null, "normal mapping replaces rather than supplements the old bump map");
  a.dispose(); b.dispose();
});

test("the approved terrain and water tiles retain their detail and use one ground texture fetch", () => {
  const f = fixture();
  const digest = values => createHash("sha256").update(values).digest("hex");
  // Captured from the approved scenery preview. Terrain RGBA stores both
  // the surface normal and brightness, while the water tile stores ripples.
  assert.equal(digest(f.ground.map.image.data), "5ae05f0d5c46a66d1b9f39492c87d30f2778910b2aa1d508413201050fd378ce");
  assert.equal(digest(f.water.normalMap.image.data), "8dfc5f8ae895e3b12fd6b9290257c1579b3f1b67c078bc218ab2ed04a1eca262");
  const shader = { fragmentShader: T.ShaderLib.standard.fragmentShader };
  f.ground.onBeforeCompile(shader);
  assert.equal((shader.fragmentShader.match(/texture2D\(map, vMapUv\)/g) ?? []).length, 1);
  assert.ok(!shader.fragmentShader.includes("#include <normal_fragment_maps>"), "normal shading must reuse the fetched sample");
  assert.match(shader.fragmentShader, /mapN = landscapeSurface\.rgb/);
  assert.match(shader.fragmentShader, /mapN\.xy \*= normalScale/);
  assert.match(shader.fragmentShader, /normal = normalize\(tbn \* mapN\)/);
  assert.ok(shader.fragmentShader.indexOf("vec4 landscapeSurface") < shader.fragmentShader.indexOf("#include <normal_fragment_begin>"));
  assert.ok(!shader.fragmentShader.includes("diffuseColor.a *=") && !shader.fragmentShader.includes("diffuseColor *= landscapeSurface"), "packed alpha is not opacity");
  assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= landscapeSurface\.a \* vec3/);
  f.dispose();
});

test("water animation reuses resources, pauses cleanly, and releases only its textures once", () => {
  const f = fixture(), textureDisposals = new Map(f.textures.map(t => [t, 0]));
  for (const t of f.textures) t.addEventListener("dispose", () => textureDisposals.set(t, textureDisposals.get(t) + 1));
  let materialDisposals = 0;
  f.ground.addEventListener("dispose", () => materialDisposals++); f.water.addEventListener("dispose", () => materialDisposals++);
  f.surfaces.apply(f.group);
  const waterNormal = f.water.normalMap, offset = waterNormal.offset, versions = f.textures.map(t => t.version);
  const colors = f.sea.geometry.getAttribute("color"), uv = f.sea.geometry.getAttribute("uv");
  f.surfaces.update(4); const paused = offset.clone();
  f.surfaces.update(4); assert.ok(offset.equals(paused));
  for (let i = 0; i < 10000; i++) f.surfaces.update(i / 60);
  assert.equal(f.water.normalMap, waterNormal); assert.equal(waterNormal.offset, offset);
  assert.deepEqual([...new Set([f.ground.map, f.ground.normalMap, f.water.normalMap])], f.textures);
  assert.deepEqual(f.textures.map(t => t.version), versions, "animation must not re-upload texture pixels");
  assert.equal(f.sea.geometry.getAttribute("color"), colors); assert.equal(f.sea.geometry.getAttribute("uv"), uv);
  assert.ok(Number.isFinite(offset.x) && Number.isFinite(offset.y));
  f.surfaces.dispose(); f.surfaces.dispose();
  assert.deepEqual([...textureDisposals.values()], [1, 1]);
  assert.equal(materialDisposals, 0, "materials remain owned by the landscape");
  const stopped = offset.clone(); f.surfaces.update(1000); assert.ok(offset.equals(stopped));
  f.dispose();
});
