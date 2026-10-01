import * as T from "three";
import type { Track } from "../../../lib/track";
import { createLandscapeLayout, landscapeRandom, smooth, type LandscapePath, type LandscapeRegion } from "./landscape-layout.ts";
import { ModelBuilder, makeAnimal, makeBoat, makeHeron, makeHouse, makeLighthouse, makeShepherd, makeTree, makeUnderstory } from "./landscape-models.ts";

type Placement = { x: number; y: number; z: number; scale: number; yaw: number; tint: number };
type Chunk = { x: number; group: T.Group; detail: T.Group; placements: Map<string, Placement[]> };
const groundColors = { pasture: 0x718746, forest: 0x526e3c, gorge: 0x6f8056, alpine: 0x617d67, autumn: 0x8c8548, coast: 0x919264, wetland: 0x69814d };

export function createLandscape(path: LandscapePath, track: Track) {
  const layout = createLandscapeLayout(path, track), group = new T.Group(); group.name = "living-landscape";
  const geometry = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  const own = <G extends T.BufferGeometry>(g: G) => { geometry.add(g); return g; };
  const material = (options: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(options); materials.add(m); return m; };
  const sculptureMat = material({ vertexColors: true, roughness: .88 });
  const breeze = { value: 0 }, treeMat = sculptureMat.clone(); materials.add(treeMat);
  treeMat.onBeforeCompile = shader => {
    shader.uniforms.landscapeTime = breeze;
    shader.vertexShader = "uniform float landscapeTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float sway = sin(landscapeTime * .6 + instanceMatrix[3].x * .013) * .16;
      transformed.x += sway * smoothstep(4., 22., position.y);
      #endif`);
  };
  treeMat.customProgramCacheKey = () => "landscape-breeze-v1";
  const groundMat = material({ vertexColors: true, roughness: 1 });
  // Repeating fine grain is generated locally; no downloaded texture dependency.
  const grain = new Uint8Array(128 * 128 * 4), grainRandom = landscapeRandom(4242);
  for (let i = 0; i < grain.length; i += 4) { const v = 188 + Math.floor(grainRandom() * 66); grain[i] = v; grain[i + 1] = v; grain[i + 2] = v; grain[i + 3] = 255; }
  const earthTexture = new T.DataTexture(grain, 128, 128); earthTexture.wrapS = earthTexture.wrapT = T.RepeatWrapping;
  earthTexture.magFilter = T.LinearFilter; earthTexture.minFilter = T.LinearMipmapLinearFilter; earthTexture.generateMipmaps = true; earthTexture.needsUpdate = true;
  groundMat.map = earthTexture; groundMat.bumpMap = earthTexture; groundMat.bumpScale = .14;
  const waterMat = material({ color: 0x4c9c9c, roughness: .24, metalness: .3, transparent: true, opacity: .86, depthWrite: false, side: T.DoubleSide });
  const foamMat = material({ color: 0xe0edda, roughness: .6, transparent: true, opacity: .44, depthWrite: false });
  const shadowPixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4, radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    shadowPixels[i] = 28; shadowPixels[i + 1] = 42; shadowPixels[i + 2] = 24;
    shadowPixels[i + 3] = Math.max(0, 1 - radius) ** 1.8 * 100;
  }
  const shadowTexture = new T.DataTexture(shadowPixels, 32, 32); shadowTexture.needsUpdate = true; shadowTexture.magFilter = T.LinearFilter;
  const contactMat = new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); materials.add(contactMat);
  const contactGeometry = own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const chunks: Chunk[] = [], chunkSize = 400, chunkCount = Math.ceil(path.length / chunkSize);
  for (let i = 0; i < chunkCount; i++) {
    const node = new T.Group(), detail = new T.Group(); node.add(detail); group.add(node);
    chunks.push({ x: (i + .5) * chunkSize, group: node, detail, placements: new Map() });
  }
  const chunkAt = (x: number) => chunks[Math.max(0, Math.min(chunks.length - 1, Math.floor(x / chunkSize)))];
  const models = new Map<string, T.BufferGeometry>();
  const distantModels = new Map<string, T.BufferGeometry>();
  const treeBatches: { x: number; mesh: T.InstancedMesh; near: T.BufferGeometry; far: T.BufferGeometry }[] = [];
  const boatBatches: { x: number; mesh: T.InstancedMesh; placements: Placement[] }[] = [];
  for (const kind of ["oak", "pine", "birch", "autumn", "willow", "orchard"] as const) for (let v = 0; v < 2; v++) {
    models.set(`${kind}${v}`, own(makeTree(kind, 789 + v * 273)));
    distantModels.set(`${kind}${v}`, own(makeTree(kind, 789 + v * 273, true)));
  }
  for (const kind of ["sheep", "deer", "wolf", "fox", "goat", "dog"] as const) { models.set(kind, own(makeAnimal(kind))); models.set(`${kind}-grazing`, own(makeAnimal(kind, true))); }
  models.set("shepherd", own(makeShepherd())); models.set("heron", own(makeHeron())); models.set("lighthouse", own(makeLighthouse()));
  for (const style of ["village", "chalet", "farm"] as const) for (let v = 0; v < 3; v++) models.set(`${style}${v}`, own(makeHouse(style, v)));
  for (const kind of ["grass", "flowers", "reeds", "rock", "hay", "fern"] as const) models.set(kind, own(makeUnderstory(kind)));
  models.set("boat", own(makeBoat())); models.set("sailboat", own(makeBoat(true)));
  const add = (name: string, x: number, z: number, scale = 1, yaw = 0, y = layout.height(x, z), tint = 1) => {
    const list = chunkAt(x).placements.get(name) ?? [];
    list.push({ x, y, z, scale, yaw, tint }); chunkAt(x).placements.set(name, list);
  };
  const build = (b: ModelBuilder, x: number, detail = false) => {
    const mesh = new T.Mesh(own(b.finish()), sculptureMat); mesh.castShadow = true; mesh.receiveShadow = true;
    (detail ? chunkAt(x).detail : chunkAt(x).group).add(mesh); return mesh;
  };

  // Denser mesh beside the railway and terrace edges; sparse distant mountains.
  const offsets: number[] = [];
  for (let z = -2600; z <= -250; z += 50) offsets.push(z);
  offsets.push(-220, -180, -145, -120, -100);
  for (let z = -90; z <= 90; z += 6) offsets.push(z);
  offsets.push(100, 120, 145, 180, 220);
  for (let z = 250; z <= 2600; z += 50) offsets.push(z);
  const colour = new T.Color(), nextColour = new T.Color(), rockColour = new T.Color(0x7f8b7f), snowColour = new T.Color(0xe1e5dc);
  for (let c = 0; c < chunkCount; c++) {
    const start = c === 0 ? -500 : c * chunkSize, end = c === chunkCount - 1 ? path.length + 500 : (c + 1) * chunkSize;
    const columns = Math.ceil((end - start) / 8), rows = offsets.length;
    const positions: number[] = [], colors: number[] = [], indices: number[] = [], uvs: number[] = [];
    for (let i = 0; i <= columns; i++) {
      const x = start + i / columns * (end - start), p = layout.route(x), region = layout.regionAt(x);
      const next = layout.regions[Math.min(layout.regions.length - 1, region.index + 1)];
      const mix = smooth(region.x + layout.span * .18, region.x + layout.span * .5, x);
      for (const offset of offsets) {
        const z = p.z + offset, y = layout.height(x, z); positions.push(x, y, z); uvs.push(x / 17, z / 17);
        colour.set(groundColors[region.kind]).lerp(nextColour.set(groundColors[next.kind]), mix);
        const stone = smooth(50, 300, y - p.y), snow = region.kind === "alpine" ? smooth(340, 510, y - p.y) : 0;
        colour.lerp(rockColour, stone * .82).lerp(snowColour, snow);
        const variance = .92 + Math.sin(x * .046 + z * .021) * .055 + Math.sin(x * .013 - z * .053) * .045;
        colour.multiplyScalar(variance); colors.push(colour.r, colour.g, colour.b);
      }
    }
    for (let i = 0; i < columns; i++) for (let j = 0; j < rows - 1; j++) { const a = i * rows + j, b = a + rows; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = own(new T.BufferGeometry()); g.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); g.setAttribute("color", new T.Float32BufferAttribute(colors, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals();
    const land = new T.Mesh(g, groundMat); land.receiveShadow = true; chunks[c].group.add(land);
  }
  // Shared boundaries get analytical normals so tiling cannot leave lighting seams.
  for (const c of chunks) c.group.traverse(o => {
    if (!(o instanceof T.Mesh) || o.material !== groundMat) return;
    const p = o.geometry.getAttribute("position"), n = o.geometry.getAttribute("normal"), normal = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      normal.set(layout.height(x - 1, z) - layout.height(x + 1, z), 2, layout.height(x, z - 1) - layout.height(x, z + 1)).normalize(); n.setXYZ(i, normal.x, normal.y, normal.z);
    }
  });

  // Trees cluster along contours, leaving both the track and museum sightlines clear.
  for (let c = 0; c < chunkCount; c++) {
    const random = landscapeRandom(211 + c * 1019), region = layout.regionAt(chunks[c].x);
    const dense = region.kind === "forest" ? 1.6 : region.kind === "coast" ? .55 : 1;
    for (let i = 0; i < 125 * dense; i++) {
      const x = (c + random()) * chunkSize; if (x > path.length) continue;
      const side = (random() > .53 ? 1 : -1), offset = side * (23 + Math.pow(random(), 1.6) * 800), z = layout.route(x).z + offset;
      if (!layout.dry(x, z) || layout.nearStation(x, z, 17)) continue;
      const r = layout.regionAt(x), kind = r.kind === "alpine" || r.kind === "gorge" ? "pine" : r.kind === "autumn" ? (random() > .2 ? "autumn" : "orchard") : r.kind === "wetland" ? "willow" : r.kind === "coast" ? "pine" : random() > .65 ? "birch" : "oak";
      const clearing = ["pasture", "autumn", "coast"].includes(r.kind) ? Math.abs(x - r.x) < 190 && offset < -18 && offset > -235 : r.kind === "forest" && Math.abs(x - r.x) < 75 && offset < -30 && offset > -115;
      if (clearing) continue;
      const slope = Math.abs(layout.height(x + 5, z) - layout.height(x - 5, z));
      if (slope > 15 || (r.kind === "alpine" && Math.abs(offset) > 600)) continue;
      add(`${kind}${i % 2}`, x, z, .65 + random() * .8, random() * 6.28, layout.height(x, z) - .35, .86 + random() * .25);
    }
    for (let i = 0; i < 125; i++) {
      const x = (c + random()) * chunkSize, z = layout.route(x).z + (random() > .5 ? 1 : -1) * (12 + random() * 150);
      if (x > path.length || !layout.dry(x, z) || layout.nearStation(x, z, 5)) continue;
      add(i % 12 === 0 ? "rock" : region.kind === "forest" && i % 3 === 0 ? "fern" : i % 4 === 0 ? "flowers" : "grass", x, z, .8 + random() * 1.3, random() * 6.28);
    }
  }

  const animations: { x: number; update: (t: number) => void }[] = [];
  const meshObject = (g: T.BufferGeometry, m: T.Material, parent: T.Object3D) => { const o = new T.Mesh(own(g), m); parent.add(o); return o; };
  const ribbon = (r: LandscapeRegion) => {
    const positions: number[] = [], indices: number[] = [], y = layout.water(r).y;
    for (let i = 0; i <= 120; i++) {
      const z = r.z - 720 + i * 12, x = layout.riverX(r, z), width = 18 + Math.sin(i * .16) * 3;
      positions.push(x - width, y, z, x + width, y, z);
      if (i < 120) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
    meshObject(g, waterMat, chunkAt(r.x).group);
  };
  const pond = (r: LandscapeRegion) => {
    const w = layout.water(r);
    let g: T.BufferGeometry;
    if (r.kind === "coast") {
      const vertices: number[] = [], indices: number[] = [];
      for (let i = 0; i <= 32; i++) {
        const depth = i / 32 * 5500, width = layout.span * .65 + depth * .42;
        vertices.push(-width, 0, w.rz + 45 - depth, width, 0, w.rz + 45 - depth);
        if (i < 32) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
    } else { g = new T.CircleGeometry(1, 96); g.rotateX(-Math.PI / 2); g.scale(w.rx, 1, w.rz); }
    const o = meshObject(g, waterMat, chunkAt(r.x).group); o.position.set(w.x, w.y, w.z);
    // Fine highlights read as ripples without a camera-shaking reflective shader.
    const b = new ModelBuilder(), random = landscapeRandom(r.index + 91);
    for (let i = 0; i < 70; i++) {
      const a = random() * 6.28, radius = Math.sqrt(random()) * .88;
      const x = w.x + Math.cos(a) * w.rx * radius, z = w.z + Math.sin(a) * w.rz * radius;
      b.box([x, w.y + .06, z], [2 + random() * 8, .02, .1], 0x9bc5ba);
    }
    const ripples = build(b, r.x, true); animations.push({ x: r.x, update: t => { ripples.position.x = Math.sin(t * .2) * .7; } });
  };
  const fence = (x: number, z: number, length: number, angle = 0, stone = false) => {
    const b = new ModelBuilder(), steps = Math.ceil(length / 5);
    for (let i = 0; i <= steps; i++) {
      const px = x + Math.cos(angle) * i / steps * length, pz = z + Math.sin(angle) * i / steps * length, y = layout.height(px, pz);
      if (stone) for (let row = 0; row < 3; row++) b.box([px + row % 2 * .5, y + .4 + row * .65, pz], [4.8, .65, 1.15], row % 2 ? 0x979b83 : 0xaaa78c, [0, -angle, 0]);
      else {
        b.box([px, y + 1.25, pz], [.28, 2.7, .28], 0x8b7856);
        if (i < steps) {
          const nx = x + Math.cos(angle) * (i + 1) / steps * length, nz = z + Math.sin(angle) * (i + 1) / steps * length, ny = layout.height(nx, nz);
          for (const h of [.8, 1.8]) b.rod([px, y + h, pz], [nx, ny + h, nz], .09, 0xa48e65);
        }
      }
    }
    build(b, x);
  };
  const house = (name: string, x: number, z: number, scale = 1, yaw = 0) => {
    const ground = layout.height(x, z), y = Math.max(ground, ...[-8, 8].flatMap(dx => [-7, 7].map(dz => layout.height(x + dx * scale, z + dz * scale))));
    add(name, x, z, scale, yaw, y);
    const b = new ModelBuilder(); b.box([x, (y + ground) / 2 - 1.5, z], [15 * scale, y - ground + 3, 14 * scale], 0x969683, [0, yaw, 0]); build(b, x);
  };
  const flock = (r: LandscapeRegion, gull = false) => {
    const root = new T.Group(); chunkAt(r.x).group.add(root);
    const b = new ModelBuilder(); b.ball([0, 0, 0], [1.3, .4, .45], gull ? 0xe5e6d6 : 0x4f5b55); b.ball([1, .12, 0], [.38, .32, .3], gull ? 0xe5e6d6 : 0x4f5b55);
    const bodyGeo = own(b.finish()), wingBuilder = new ModelBuilder();
    wingBuilder.box([-.2, 0, 1.25], [1.5, .09, 2.5], gull ? 0xe5e6d6 : 0x4f5b55, [0, .15, 0]);
    wingBuilder.box([-.5, .02, 2.9], [.9, .07, 1.05], 0x43544f, [0, .4, 0]);
    const wingGeo = own(wingBuilder.finish());
    const birds: { bird: T.Group; left: T.Mesh; right: T.Mesh }[] = [];
    for (let i = 0; i < (gull ? 5 : 3); i++) {
      const bird = new T.Group(), body = new T.Mesh(bodyGeo, sculptureMat), left = new T.Mesh(wingGeo, sculptureMat), right = new T.Mesh(wingGeo, sculptureMat);
      right.scale.z = -1; bird.add(body, left, right); bird.scale.setScalar(gull ? .85 : 1.3); root.add(bird); birds.push({ bird, left, right });
    }
    animations.push({ x: r.x, update: t => {
      // Circling birds stay well away from the rider, and spend time out of view.
      const a = t * .075 + r.index * 2, x = r.x + Math.sin(a) * 145, z = r.z - 170 + Math.cos(a) * 115;
      root.position.set(x, r.y + 65 + Math.sin(a * .7) * 12, z); root.rotation.y = a;
      birds.forEach(({ bird, left, right }, i) => { bird.position.set(-i * 9, Math.sin(t + i) * .3, (i % 2 ? 1 : -1) * i * 5); const flap = Math.sin(t * 2.4 + i) * .16; left.rotation.x = flap; right.rotation.x = -flap; });
    } });
  };

  for (const r of layout.regions) {
    const random = landscapeRandom(r.index * 771 + 339), x = r.x, z = r.z - 65;
    if (r.kind === "pasture") {
      for (let i = 0; i < 16; i++) {
        const px = x - 48 + random() * 100, pz = z - 18 + random() * 48;
        add(i % 4 ? "sheep-grazing" : "sheep", px, pz, 1 + random() * .3, random() * 6.28);
      }
      add("shepherd", x - 27, z + 14, 1.3, -.3); add("dog", x - 23, z + 17, .95, 1.4);
      add("oak0", x - 32, z + 6, 1.2); add("wolf", x + 56, z - 92, 1.6, -2.12); add("rock", x + 64, z - 100, 2);
      fence(x - 70, z - 38, 130, .06, true); house("farm0", x + 135, z - 70, 1.1);
      for (let i = 0; i < 5; i++) add("hay", x + 110 + i * 7, z - 12 - random() * 20, 1, random() * 6.28);
    } else if (r.kind === "forest") {
      for (let i = 0; i < 4; i++) add(i % 2 ? "deer-grazing" : "deer", x - 18 + i * 12, z + i % 2 * 12, 1.15, -.3 + i * .6);
      const b = new ModelBuilder(); b.rod([x - 40, layout.height(x - 40, z) + 1, z], [x - 12, layout.height(x - 12, z + 12) + 1, z + 12], 1.3, 0x756044, .9); build(b, x);
      // Natural and built canopies: tall crowns plus an open timber gallery.
      for (let i = -2; i <= 2; i++) {
        const px = x + i * 15, pz = layout.route(px).z;
        for (const side of [-1, 1]) if (!layout.nearStation(px, pz + side * 18, 10)) add("oak1", px, pz + side * 18, 1.55, i);
      }
      if (!layout.nearStation(x, r.z, 55)) {
        const b = new ModelBuilder();
        for (let i = -2; i <= 2; i++) {
          const p = path.point((x + i * 12) / path.length);
          for (const side of [-1, 1]) { const pz = p.z + side * 6, floor = layout.height(p.x, pz); b.rod([p.x, floor, pz], [p.x, p.y + 13, pz], .45, 0x756044); }
          b.rod([p.x, p.y + 13, p.z - 7], [p.x, p.y + 13, p.z + 7], .45, 0x8a704b);
          for (let dz = -6; dz <= 6; dz += 2) b.box([p.x, p.y + 13.5, p.z + dz], [12.8, .2, .35], 0xa28b5c);
        }
        build(b, x);
      }
      flock(r);
    } else if (r.kind === "gorge") {
      ribbon(r);
      // Upstream cascade: a raised rock lip, falling water and a foam pool.
      const wz = r.z + 250, wx = layout.riverX(r, wz), wy = layout.water(r).y, b = new ModelBuilder();
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) b.ball([wx + side * (14 + i * 4), wy + 4 + i * 3, wz], [8, 8 + i * 3, 12], 0x858e83);
      b.box([wx, wy + 11, wz + 8], [29, 20, 12], 0x7d8a7c); build(b, x);
      const fall = meshObject(new T.PlaneGeometry(23, 20, 8, 1), waterMat, chunkAt(x).group); fall.position.set(wx, wy + 10, wz + 1.8);
      const top = meshObject(new T.PlaneGeometry(23, 18), waterMat, chunkAt(x).group); top.rotation.x = -Math.PI / 2; top.position.set(wx, wy + 21.1, wz + 8);
      const foam = meshObject(new T.CircleGeometry(17, 32), foamMat, chunkAt(x).group); foam.rotation.x = -Math.PI / 2; foam.position.set(wx, wy + .12, wz - 4); foam.scale.set(1, .5, 1);
      animations.push({ x, update: t => { foam.scale.x = 1 + Math.sin(t * .75) * .035; } });
      flock(r);
    } else if (r.kind === "alpine") {
      pond(r); const w = layout.water(r);
      house("chalet1", x - 120, r.z - 115, 1.2, .2);
      for (let i = 0; i < 4; i++) { const px = x + 30 + i * 13, pz = r.z + 145 + i * 9; add("rock", px, pz, 1.8); add("goat", px + 2, pz, 1.2, .8, layout.height(px, pz) + 5.4); }
      add("sailboat", w.x - 40, w.z, 1, .4, w.y); flock(r);
    } else if (r.kind === "autumn") {
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) add(`orchard${col % 2}`, x - 60 + col * 19, z - 25 - row * 20, .9, col);
      house("farm2", x + 100, z - 40, 1.2); add("fox", x - 5, z + 16, 1.3, .8);
      fence(x - 65, z + 5, 150, 0); for (let i = 0; i < 5; i++) add("hay", x + 115 + i * 6, z + 15, 1, .5);
      // Small spring and traditional waterwheel beside the farm.
      pond(r); const millWater = layout.water(r), wx = millWater.x, wz = millWater.z, y = millWater.y;
      const wheel = new T.Group(); wheel.position.set(wx, y + 5, wz); chunkAt(x).group.add(wheel);
      const b = new ModelBuilder();
      for (const offset of [-1, 1]) { b.add(new T.TorusGeometry(5, .28, 5, 32), 0x72563f, [0, 0, offset]); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; b.rod([0, 0, offset], [Math.sin(a) * 5, Math.cos(a) * 5, offset], .13, 0x8f724e); } }
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.box([Math.sin(a) * 5, Math.cos(a) * 5, 0], [1, .16, 2.6], 0x95784e, [0, 0, -a]); }
      wheel.add(new T.Mesh(own(b.finish()), sculptureMat)); animations.push({ x, update: t => { wheel.rotation.z = t * .12; } });
    } else if (r.kind === "coast") {
      pond(r); const w = layout.water(r), shore = r.z - 105;
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) house(`village${i % 3}`, x - 87 + i * 29, shore + row * 28, .85 + random() * .2, Math.PI);
      house("lighthouse", x + 190, r.z - 90, 1.1);
      const b = new ModelBuilder(), dockX = x - 15;
      const dockStart = layout.height(dockX, shore) + .3;
      for (let i = 0; i < 55; i++) {
        const pz = shore - i * 2.1, deck = dockStart + (w.y + 3 - dockStart) * Math.min(1, i / 18);
        b.box([dockX, deck, pz], [8, .3, 1.9], i % 2 ? 0xb29b73 : 0x9a835d);
        if (i % 8 === 0) for (const side of [-1, 1]) b.rod([dockX + side * 3.6, Math.min(layout.height(dockX, pz), deck - 1), pz], [dockX + side * 3.6, deck + 1.5, pz], .3, 0x796348);
      }
      build(b, x);
      for (let i = 0; i < 6; i++) add(i % 3 ? "boat" : "sailboat", x - 65 + i * 27, shore - 70 - random() * 50, 1, random() * .8, w.y);
      flock(r, true);
    } else {
      pond(r); const w = layout.water(r);
      for (let i = 0; i < 50; i++) { const a = i / 50 * 6.28, px = w.x + Math.cos(a) * w.rx * 1.03, pz = w.z + Math.sin(a) * w.rz * 1.03; add("reeds", px, pz, 1.1); }
      for (let i = 0; i < 4; i++) add("heron", w.x + 68 + i * 5, w.z + 45 - i * 4, 1.25, i * .2, w.y - .2);
      const b = new ModelBuilder();
      for (let i = 0; i < 36; i++) { const px = w.x - 40 + i * 2.2, pz = w.z + 45 + Math.sin(i / 36 * Math.PI) * 12; b.box([px, w.y + 2, pz], [2.05, .24, 4], 0xb2a17a); if (i % 5 === 0) for (const side of [-1, 1]) b.rod([px, w.y - 3, pz + side * 1.8], [px, w.y + 3.4, pz + side * 1.8], .13, 0x857854); }
      build(b, x);
    }
  }

  // Actual instance batches, grouped spatially for frustum and distance culling.
  const dummy = new T.Object3D(), tint = new T.Color();
  const contactTransforms = new Map<Chunk, T.Matrix4[]>();
  for (const chunk of chunks) for (const [name, placements] of chunk.placements) {
    const geo = models.get(name)!;
    const instances = new T.InstancedMesh(geo, distantModels.has(name) ? treeMat : sculptureMat, placements.length);
    instances.castShadow = !["grass", "flowers", "reeds", "fern"].includes(name); instances.receiveShadow = true;
    placements.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.setScalar(p.scale); dummy.updateMatrix(); instances.setMatrixAt(i, dummy.matrix); instances.setColorAt(i, tint.setRGB(p.tint, p.tint, p.tint)); });
    instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere();
    (["grass", "flowers", "reeds", "fern"].includes(name) ? chunk.detail : chunk.group).add(instances);
    if (distantModels.has(name)) treeBatches.push({ x: chunk.x, mesh: instances, near: geo, far: distantModels.get(name)! });
    if (name === "boat" || name === "sailboat") boatBatches.push({ x: chunk.x, mesh: instances, placements });
    if (distantModels.has(name) || ["sheep", "sheep-grazing", "deer", "deer-grazing", "wolf", "fox", "dog", "shepherd"].includes(name)) {
      const list = contactTransforms.get(chunk) ?? [];
      for (const p of placements) {
        const normal = new T.Vector3(layout.height(p.x - 1, p.z) - layout.height(p.x + 1, p.z), 2, layout.height(p.x, p.z - 1) - layout.height(p.x, p.z + 1)).normalize();
        dummy.position.set(p.x, layout.height(p.x, p.z) + .06, p.z);
        dummy.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), normal);
        const size = p.scale * (distantModels.has(name) ? 11 : 5); dummy.scale.set(size, 1, size); dummy.updateMatrix(); list.push(dummy.matrix.clone());
      }
      contactTransforms.set(chunk, list);
    }
  }
  for (const [chunk, transforms] of contactTransforms) {
    const shadows = new T.InstancedMesh(contactGeometry, contactMat, transforms.length);
    transforms.forEach((m, i) => shadows.setMatrixAt(i, m)); shadows.instanceMatrix.needsUpdate = true; shadows.computeBoundingSphere(); chunk.detail.add(shadows);
  }
  for (const chunk of chunks) chunk.placements.clear();
  let disposed = false;
  return {
    group, layout,
    update(time: number, u: number, overview: boolean, quality: number) {
      const x = u * path.length, range = overview ? 6200 : quality > .4 ? 2900 : 2100;
      breeze.value = time;
      for (const chunk of chunks) { chunk.group.visible = Math.abs(chunk.x - x) < range; chunk.detail.visible = quality > .4 && Math.abs(chunk.x - x) < 750; }
      for (const trees of treeBatches) {
        const distance = Math.abs(trees.x - x);
        trees.mesh.geometry = distance < (quality > .7 ? 800 : 460) && !overview ? trees.near : trees.far;
        trees.mesh.castShadow = distance < 460 && quality > .7;
      }
      for (const animation of animations) if (Math.abs(animation.x - x) < range) animation.update(time);
      for (const boats of boatBatches) if (Math.abs(boats.x - x) < range) {
        boats.placements.forEach((p, i) => {
          dummy.position.set(p.x, p.y + Math.sin(time * .7 + i) * .13, p.z);
          dummy.rotation.set(Math.sin(time * .6 + i) * .018, p.yaw, Math.sin(time * .8 + i) * .01);
          dummy.scale.setScalar(p.scale); dummy.updateMatrix(); boats.mesh.setMatrixAt(i, dummy.matrix);
        }); boats.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      group.traverse(o => { if (o instanceof T.InstancedMesh) o.dispose(); });
      geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); earthTexture.dispose(); shadowTexture.dispose(); group.clear();
    },
  };
}
