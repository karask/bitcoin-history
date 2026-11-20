import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { landscapeRandom } from "./landscape-layout.ts";

type P = [number, number, number];
/** Small, reusable sculptures: one vertex-coloured draw per instanced model. */
export class ModelBuilder {
  parts: T.BufferGeometry[] = [];
  add(g: T.BufferGeometry, color: number, p: P = [0, 0, 0], scale: P = [1, 1, 1], rotation: P = [0, 0, 0]) {
    const geometry = g.index ? g.toNonIndexed() : g;
    if (geometry !== g) g.dispose();
    geometry.deleteAttribute("uv");
    const c = new T.Color(color), colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
    geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...scale)));
    this.parts.push(geometry); return this;
  }
  box(p: P, s: P, color: number, rotation: P = [0, 0, 0]) { return this.add(new T.BoxGeometry(1, 1, 1), color, p, s, rotation); }
  ball(p: P, s: P, color: number, detail = 1) { return this.add(new T.IcosahedronGeometry(1, detail), color, p, s); }
  cone(p: P, radius: number, height: number, color: number, top = 0, sides = 9) { return this.add(new T.CylinderGeometry(top, radius, height, sides), color, p); }
  rod(a: P, b: P, r: number, color: number, top = r) {
    const from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
    const g = new T.CylinderGeometry(top, r, delta.length(), 7);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    return this.add(g, color, from.add(to).multiplyScalar(.5).toArray() as P);
  }
  finish() {
    const result = mergeGeometries(this.parts)!; this.parts.forEach(g => g.dispose()); this.parts = [];
    result.computeBoundingSphere(); return result;
  }
}

type TreeKind = "oak" | "pine" | "birch" | "autumn" | "willow" | "orchard";
const tau = Math.PI * 2;
const crownBounds = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();

// Closed, opaque leafy sprays: silhouette detail without alpha cards, textures,
// extra materials or draw calls. The same centres are retained in the far model.
function spray(radius: number, depth: number, seed: number, distant = false) {
  const rand = landscapeRandom(seed), n = distant ? 4 : 12;
  const pos: number[] = [0, depth * .68, 0, 0, -depth * .32, 0], index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * tau / n, r = radius * (distant ? .98 : (i % 3 === 0 ? 1.1 : .78 + rand() * .19));
    pos.push(Math.cos(a) * r, depth * ((i % 2 ? -.06 : .09) + (rand() - .5) * .18), Math.sin(a) * r);
  }
  for (let i = 0; i < n; i++) {
    const a = 2 + i, b = 2 + (i + 1) % n;
    index.push(0, b, a, 1, a, b);
  }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setIndex(index); g.computeVertexNormals(); return g;
}

function foliage(b: ModelBuilder, p: P, scale: P, color: number, seed: number, distant = false, rotation: P = [0, 0, 0]) {
  b.add(spray(1, 1, seed, distant), color, p, scale, rotation);
  const g = b.parts[b.parts.length - 1], c = g.getAttribute("color"), positions = g.getAttribute("position");
  for (let i = 0; i < c.count; i++) {
    // A slight baked canopy gradient keeps overlapping sprays legible in shade.
    const shade = .78 + .22 * T.MathUtils.clamp((positions.getY(i) - p[1]) / Math.max(.1, scale[1]) + .5, 0, 1);
    c.setXYZ(i, c.getX(i) * shade, c.getY(i) * shade, c.getZ(i) * shade);
  }
}

function stem(b: ModelBuilder, from: P, to: P, radius: number, tip: number, color: number, sides = 5) {
  const a = new T.Vector3(...from), d = new T.Vector3(...to).sub(a), g = new T.CylinderGeometry(tip, radius, d.length(), sides);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize()));
  b.add(g, color, a.addScaledVector(d, .5).toArray() as P);
}

// Opaque, sculpted outline. Coarse and fine foliage use the same placement and
// palette; pigment, occlusion and sunlit leaf tips are baked into the vertices.
function leafMass(builder: ModelBuilder, center: P, size: P, angle: number, seed: number, pigment: number, distant: boolean) {
  const random = landscapeRandom(seed);
  const sides = distant ? 5 : 8;
  const positions: number[] = [.08, .86, -.08];
  const indices: number[] = [];
  const rings = distant ? [[.95, -.02]] : [[.57, .63], [.99, .13], [.78, -.36]];
  const phase = random() * tau;
  for (let ring = 0; ring < rings.length; ring++) {
    const [radius, height] = rings[ring];
    for (let side = 0; side < sides; side++) {
      const bearing = side * tau / sides + (ring % 2) * .13 + phase;
      const reach = radius * (1 + .09 * Math.sin(3 * bearing + phase) + .07 * Math.cos(5 * bearing - phase));
      positions.push(
        Math.cos(bearing) * reach + (ring === 0 ? .13 : 0),
        height + .08 * Math.sin(3 * bearing) + (random() - .5) * .1,
        Math.sin(bearing) * reach,
      );
    }
  }
  const bottom = positions.length / 3;
  positions.push(-.11, -.67, .13);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(0, 1 + next, 1 + side);
    for (let ring = 1; ring < rings.length; ring++) {
      const upperLeft = 1 + (ring - 1) * sides + side;
      const upperRight = 1 + (ring - 1) * sides + next;
      indices.push(upperLeft, upperRight, upperLeft + sides, upperRight, upperRight + sides, upperLeft + sides);
    }
    const lastRing = 1 + (rings.length - 1) * sides;
    indices.push(bottom, lastRing + side, lastRing + next);
  }
  const shape = new T.BufferGeometry();
  shape.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  shape.setIndex(indices);
  shape.computeVertexNormals();
  builder.add(shape, pigment, center, size, [0, angle, 0]);

  // Blend from blue-green shade below to warm exposed tips above.
  const painted = builder.parts.at(-1)!;
  const vertices = painted.getAttribute("position"), colors = painted.getAttribute("color");
  for (let i = 0; i < vertices.count; i++) {
    const x = (vertices.getX(i) - center[0]) / size[0];
    const y = (vertices.getY(i) - center[1]) / size[1];
    const z = (vertices.getZ(i) - center[2]) / size[2];
    const light = T.MathUtils.clamp(.50 + .49 * y + .15 * x - .095 * z + .07 * Math.sin(8 * x + 3 * z + phase), 0, 1);
    colors.setXYZ(i, colors.getX(i) * (.47 + .83 * light), colors.getY(i) * (.56 + .65 * light), colors.getZ(i) * (.77 + .34 * light));
  }
}

// Each row spans the cedar fan's central ridge, two jagged edges and underside.
function cedarFan(builder: ModelBuilder, origin: P, bearing: number, reach: number, seed: number, color: number, distant: boolean) {
  const random = landscapeRandom(seed), positions: number[] = [], indices: number[] = [];
  if (distant) {
    positions.push(-.12, .18, 0, .57, -.46, -.38, 1.03, .055, .015, .56, -.39, .36);
    indices.push(0, 2, 1, 0, 3, 2, 0, 1, 3, 1, 2, 3);
  } else {
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const u = i / (rows - 1);
      const arch = Math.sin(u * Math.PI);
      const width = Math.max(.018, arch ** .65) * (.31 + (i % 2) * .16);
      const y = .15 - .43 * Math.sin(u * Math.PI * .88) + .09 * u;
      const curl = .09 * Math.sin(2.7 * u + seed) * u;
      positions.push(
        u, y + .19 * arch, curl,
        u - .085 * arch, y - width * .62, curl - width,
        u - .09 * arch, y - width * (.44 + .14 * random()), curl + width,
        u, y - .19 * arch - .026, curl,
      );
      if (i === 0) continue;

      const ridge = (i - 1) * 4, left = ridge + 1, right = ridge + 2, base = ridge + 3;
      const nextRidge = i * 4, nextLeft = nextRidge + 1, nextRight = nextRidge + 2, nextBase = nextRidge + 3;
      indices.push(
        ridge, nextRidge, nextLeft, ridge, nextLeft, left,
        ridge, nextRight, nextRidge, ridge, right, nextRight,
        base, nextLeft, nextBase, base, left, nextLeft,
        base, nextBase, nextRight, base, nextRight, right,
      );
    }
  }

  const fan = new T.BufferGeometry();
  fan.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  fan.setIndex(indices);
  fan.computeVertexNormals();
  builder.add(fan, color, origin, [reach, distant ? 3.4 : 4, reach], [0, -bearing, 0]);
  const painted = builder.parts.at(-1)!;
  const vertices = painted.getAttribute("position"), colors = painted.getAttribute("color");
  for (let i = 0; i < colors.count; i++) {
    const light = T.MathUtils.clamp((vertices.getY(i) - origin[1]) / 3 + .64, 0, 1);
    colors.setXYZ(i, colors.getX(i) * (.48 + .77 * light), colors.getY(i) * (.60 + .61 * light), colors.getZ(i) * (.77 + .36 * light));
  }
}

function pine(builder: ModelBuilder, seed: number, distant: boolean) {
  const random = landscapeRandom(seed), bark = 0x746350, phase = random() * tau;
  const colors = [0x305748, 0x396351, 0x44745d, 0x507a60];
  stem(builder, [0, 0, 0], [.34, 23, -.22], .50, .04, bark, distant ? 3 : 6);
  for (let tier = 0; tier < 7; tier++) {
    const count = tier < 5 ? 4 : 3;
    const t = tier / 7, y = 6 + 17 * t, radius = 6.3 * (1 - t) ** .76;
    const x = .26 * t, z = -.18 * t;
    for (let branch = 0; branch < count; branch++) {
      const angle = phase + tier * 1.27 + branch * tau / count + (random() - .5) * .32;
      const reach = radius * (.87 + .23 * random()), height = y + (random() - .5) * 1.35;
      if (!distant) {
        const tip: P = [x + Math.cos(angle) * reach * .8, height - .55, z + Math.sin(angle) * reach * .8];
        stem(builder, [x, height - .35, z], tip, .10, .025, bark, 3);
      }
      cedarFan(builder, [x, height, z], angle, reach, seed + tier * 11 + branch, colors[(tier + branch) % 4], distant);
    }
  }
  builder.cone([.34, 22.6, -.22], 1.1, 4.3, colors[2], 0, distant ? 3 : 5);
}

function finishTree(b: ModelBuilder, kind: TreeKind, seed: number, distant: boolean) {
  const g = b.finish(), key = `${kind}:${seed}`;
  g.computeBoundingBox();
  if (!distant) {
    const box = g.boundingBox!;
    crownBounds.set(key, { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    return g;
  }
  if (!crownBounds.has(key)) {
    // Normally the shared full prototype has already been built. Keep this
    // constructor independently usable without retaining a second geometry.
    const reference = makeTree(kind, seed, false); reference.dispose();
  }
  const full = crownBounds.get(key)!, box = g.boundingBox!;
  const xNeg = full.minX / box.min.x, xPos = full.maxX / box.max.x;
  const zNeg = full.minZ / box.min.z, zPos = full.maxZ / box.max.z;
  const p = g.getAttribute("position"), n = g.getAttribute("normal"), normal = new T.Vector3();
  // Fit each side of the canopy separately: exact full-detail envelope, while
  // retaining the trunk at the identical world-space planting point.
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i) < 0 ? xNeg : xPos, sz = p.getZ(i) < 0 ? zNeg : zPos;
    p.setXYZ(i, p.getX(i) * sx, p.getY(i), p.getZ(i) * sz);
    normal.set(n.getX(i) / sx, n.getY(i), n.getZ(i) / sz).normalize(); n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

const broadleafPalettes = {
  autumn: [0xab5432, 0xcd703b, 0xcd9446, 0xe3ae59, 0xa66d30],
  willow: [0x6b8954, 0x708f5a, 0x83a367, 0x99ac72, 0x6d904f],
  birch: [0x6c8547, 0x839651, 0x95a65d, 0x738b53, 0x819a54],
  orchard: [0x527044, 0x618348, 0x748a46, 0x79904e, 0x638153],
  oak: [0x436d54, 0x4f7a51, 0x638451, 0x739657, 0x5a7745],
};

export function makeTree(kind: TreeKind, seed: number, distant = false) {
  const builder = new ModelBuilder();
  if (kind === "pine") {
    pine(builder, seed, distant);
    return finishTree(builder, kind, seed, distant);
  }

  const random = landscapeRandom(seed);
  const birch = kind === "birch", orchard = kind === "orchard", willow = kind === "willow";
  const height = birch ? 19.2 : orchard ? 10.6 : 17.4;
  const radius = birch ? 3.45 : orchard ? 4.1 : 6.65;
  const bark = birch ? 0xddcfb6 : orchard ? 0x796351 : 0x715844;
  const colors = broadleafPalettes[kind];
  const phase = random() * tau, windX = Math.cos(phase), windZ = Math.sin(phase);
  const fork: P = [windX * radius * .09, height * .32, windZ * radius * .09];
  stem(builder, [0, 0, 0], fork, birch ? .34 : orchard ? .66 : .86, birch ? .23 : .51, bark, distant ? 3 : 7);
  if (!distant) {
    const top: P = [windX * radius * .23, height * .86, windZ * radius * .23];
    stem(builder, fork, top, birch ? .23 : .52, .055, bark, 6);
    for (let i = 0; i < 4; i++) {
      const angle = i * tau / 4 + phase;
      const root: P = [Math.cos(angle) * 1.36, -.05, Math.sin(angle) * 1.36];
      stem(builder, [windX * .055, .95, windZ * .055], root, birch ? .17 : .28, .06, bark, 4);
    }
    if (birch) {
      for (let i = 0; i < 8; i++) {
        const u = (i + .8) / 9, angle = i * 1.64 + phase;
        const scar: P = [
          fork[0] * u + Math.cos(angle) * (.31 - .09 * u),
          height * .32 * u,
          fork[2] * u + Math.sin(angle) * (.31 - .09 * u),
        ];
        builder.box(scar, [.33, .085, .045], 0x605f51, [0, Math.PI / 2 - angle, -.13]);
      }
    }
  }

  // Lower boughs fan outward; the shorter upper shoots lean with the wind.
  const count = 15;
  const leafHeight = willow ? 3.9 : birch ? 3.2 : orchard ? 1.85 : 2.82;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1), angle = phase + i * 2.39996 + (random() - .5) * .48;
    const spread = Math.sin(Math.PI * (u * .67 + .24));
    const reach = radius * (.17 + .59 * spread) * (.88 + .19 * random()) * (1 - .77 * u * u);
    const y = height * (.48 + .43 * u) + (random() - .5) * height * .075;
    const crown: P = [
      Math.cos(angle) * reach + windX * radius * (.09 + .16 * u),
      y,
      Math.sin(angle) * reach + windZ * radius * (.09 + .16 * u),
    ];
    const thickness = (.83 + .23 * random()) * (1 - .14 * u);
    const size: P = [radius * (birch ? .66 : .50) * thickness, leafHeight * thickness, radius * (birch ? .48 : .44) * thickness];
    const color = colors[(i + Math.floor(2 * u)) % colors.length];
    leafMass(builder, crown, size, angle, seed + i * 97, color, distant);
    if (distant) continue;

    const joint: P = [crown[0] * .50, Math.max(fork[1] - .45, crown[1] - height * .24), crown[2] * .50];
    const branchBase: P = [fork[0] + windX * radius * .06 * u, height * (.26 + .31 * u), fork[2] + windZ * radius * .06 * u];
    stem(builder, branchBase, joint, (birch ? .14 : .31) * thickness, .12 * thickness, bark, 4);
    stem(builder, joint, crown, .13 * thickness, .035, bark, 3);

    const sprayAngle = angle + .48, offset = radius * .31;
    const leaves: P = [crown[0] + Math.cos(sprayAngle) * offset, crown[1] + (willow ? -1.5 : .25), crown[2] + Math.sin(sprayAngle) * offset];
    const spraySize: P = [size[0] * .60, size[1] * (willow ? 1.45 : .72), size[2] * .67];
    leafMass(builder, leaves, spraySize, angle + .73, seed + i * 71 + 39, colors[(i + 2) % colors.length], false);
    if (orchard && i % 2 === 0) {
      const apple: P = [leaves[0] + Math.cos(angle) * .35, leaves[1] - .88, leaves[2] + Math.sin(angle) * .42];
      builder.ball(apple, [.18, .20, .18], 0xa54a32, 0);
    }
  }
  return finishTree(builder, kind, seed, distant);
}

export type AnimalKind = "sheep" | "deer" | "wolf" | "fox" | "goat" | "dog";
export function makeAnimal(kind: AnimalKind, grazing = false) {
  const b = new ModelBuilder(), wool = 0xeee5cd;
  const color = { sheep: wool, deer: 0xa87a4f, wolf: 0x7f8277, fox: 0xb66a38, goat: 0xc1b39a, dog: 0x383d39 }[kind];
  const sheep = kind === "sheep", deer = kind === "deer", longLegs = deer ? 1.55 : sheep ? .85 : 1;
  const bodyY = longLegs + .65;
  b.ball([0, bodyY, 0], [1.55, .8, .66], color);
  b.ball([-.9, bodyY + .06, 0], [.78, .8, .66], color);
  if (sheep) for (let i = 0; i < 15; i++) {
    const a = i * 2.4; b.ball([Math.sin(a) * 1.1, bodyY + Math.cos(a) * .5, Math.sin(i * 4.1) * .56], [.58, .49, .45], i % 3 ? wool : 0xd4cfb7, 0);
  }
  for (const x of [-1, .95]) for (const z of [-.43, .43]) {
    b.rod([x, bodyY - .35, z], [x + (x > 0 ? .12 : -.1), .18, z], sheep ? .14 : .105, sheep ? 0x57534b : color, .08);
    b.box([x + (x > 0 ? .12 : -.1), .12, z], [.27, .24, .22], 0x3c3933);
  }
  const headY = grazing ? .65 : bodyY + (deer || kind === "goat" ? 1 : .24), headX = 1.7;
  b.rod([.9, bodyY, 0], [headX, headY, 0], .34, color, .25);
  b.ball([headX, headY, 0], [.6, .43, .35], sheep ? 0x615a4c : color);
  b.ball([2.15, headY - .1, 0], [.35, .23, .27], sheep ? 0x615a4c : color);
  b.ball([2.42, headY - .1, 0], [.12, .14, .2], 0x2d302c, 0);
  for (const z of [-.33, .33]) {
    b.ball([1.67, headY + .03, z], [.055, .065, .035], 0x182323, 0);
    b.ball([1.45, headY + .43, z * 1.2], [.18, .35, .15], color, 0);
    if (deer) {
      b.rod([1.5, headY + .35, z], [1.2, headY + 1.5, z * 2], .07, 0x675742, .035);
      for (let t = 0; t < 3; t++) b.rod([1.35, headY + .7 + t * .25, z * 1.6], [1.85, headY + 1.05 + t * .3, z * (1.6 + t * .4)], .04, 0x675742, .015);
    } else if (kind === "goat") b.rod([1.55, headY + .3, z], [.9, headY + 1, z], .12, 0x635c4e, .025);
  }
  if (!sheep && !deer) {
    b.rod([-1.1, bodyY + .15, 0], [-2.3, bodyY - .3, .2], .28, color, .15);
    b.ball([-2.25, bodyY - .3, .2], [.4, .2, .2], kind === "fox" ? wool : color, 0);
  } else b.ball([-1.5, bodyY, 0], [.26, .25, .22], wool, 0);
  return b.finish();
}

export function makeShepherd() {
  const b = new ModelBuilder();
  b.cone([0, 1.45, 0], .67, 2.5, 0x586451, .4);
  b.ball([0, 3.15, 0], [.38, .48, .37], 0xb99068);
  b.cone([0, 3.65, 0], .62, .12, 0x8a7652, .62, 16); b.cone([0, 3.81, 0], .32, .35, 0x8a7652, .28);
  for (const x of [-.27, .27]) b.rod([x, 1, 0], [x, .15, .16], .14, 0x41473f);
  b.rod([.4, 2.6, 0], [1, 2.1, .25], .16, 0x586451);
  b.rod([1.1, 0, .3], [1.1, 3.6, .3], .055, 0x745338);
  b.rod([1.1, 3.6, .3], [1.45, 3.8, .3], .055, 0x745338);
  b.rod([1.45, 3.8, .3], [1.62, 3.4, .3], .055, 0x745338);
  return b.finish();
}

export function makeHouse(style: "village" | "chalet" | "farm", variant = 0) {
  const b = new ModelBuilder(), wood = 0x76583f, pale = [0xe3d5b6, 0xdbc8aa, 0xd8dbc6][variant % 3], roof = style === "chalet" ? 0x555e58 : 0xa55d42;
  const h = style === "farm" ? 9 : 12, w = style === "farm" ? 20 : 13, d = 12;
  b.box([0, .65, 0], [w + 1, 1.3, d + 1], 0x989888);
  b.box([0, h / 2 + 1, 0], [w, h, d], style === "chalet" ? wood : pale);
  // A continuous pitched roof and gable, with actual eaves and tile rows.
  const shape = new T.Shape(); shape.moveTo(-w / 2 - 1, 0); shape.lineTo(0, 4.7); shape.lineTo(w / 2 + 1, 0); shape.closePath();
  const g = new T.ExtrudeGeometry(shape, { depth: d + 2, bevelEnabled: false });
  b.add(g, roof, [0, h + 1, -d / 2 - 1]);
  for (const side of [-1, 1]) for (let row = 0; row < 5; row++) {
    const x = side * (row + .5) * (w / 2 + 1) / 5;
    b.rod([x, h + 5.7 - (row + .5) * .94, -d / 2 - 1.1], [x, h + 5.7 - (row + .5) * .94, d / 2 + 1.1], .08, 0xc38764);
  }
  b.box([w * .27, h + 4.2, -2], [1.7, 4.5, 1.6], 0xb6aa91);
  b.box([w * .27, h + 6.5, -2], [2.1, .3, 2], 0x716b5c);
  b.box([0, 2.7, d / 2 + .04], [2.5, 4.3, .2], 0x465b55);
  for (const x of [-w * .3, w * .3]) for (const y of [4, h - 1]) {
    b.box([x, y, -d / 2 - .12], [2.3, 2.8, .25], 0xe0d9bd);
    b.box([x, y, -d / 2 - .27], [1.85, 2.35, .1], 0x4e7076);
    b.box([x, y, -d / 2 - .34], [.13, 2.35, .05], 0xd8d4b9);
  }
  for (const side of [-1, 1]) for (const y of [4, h - 1]) {
    b.box([side * (w / 2 + .1), y, 0], [.2, 2.8, 2.3], 0xe0d9bd);
    b.box([side * (w / 2 + .23), y, 0], [.1, 2.35, 1.85], 0x4e7076);
  }
  for (const x of [-w * .3, w * .3]) for (const y of [4, h - 1]) {
    b.box([x, y, d / 2 + .1], [2.35, 2.9, .25], 0xeae0c4);
    b.box([x, y, d / 2 + .25], [1.9, 2.45, .12], 0x496b76);
    b.box([x, y, d / 2 + .34], [.12, 2.45, .06], 0xc3c5b2);
    for (const s of [-1, 1]) b.box([x + s * 1.55, y, d / 2 + .2], [.7, 2.8, .25], variant % 2 ? 0x68816c : 0x587b83);
    b.box([x, y - 1.55, d / 2 + .5], [2.8, .4, .85], wood);
    for (let i = -1; i <= 1; i++) b.ball([x + i * .8, y - 1.3, d / 2 + .55], [.45, .4, .45], 0x68864b, 0);
  }
  if (style === "chalet") {
    b.box([0, 5.8, 7.5], [w + 2, .4, 3.2], wood);
    for (let x = -7; x <= 7; x++) b.box([x, 7, 8.8], [.14, 2.5, .14], wood);
    b.box([0, 8.25, 8.8], [14.2, .2, .25], wood);
  }
  return b.finish();
}

export function makeBoat(sail = false) {
  const b = new ModelBuilder();
  b.ball([0, .15, 0], [4.8, 1.1, 1.7], 0x496b74); b.box([0, .82, 0], [6.3, .3, 2.6], 0xc7b896);
  for (let x = -2; x <= 2; x += 2) b.box([x, 1, 0], [.5, .16, 2.5], 0x926b4b);
  if (sail) {
    b.rod([0, 1, 0], [0, 11, 0], .1, 0xb0956a);
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute([.12, 10.7, 0, .12, 2, 0, 4.1, 2, 0, .12, 10.7, .03, 4.1, 2, .03, .12, 2, .03], 3)); g.computeVertexNormals(); b.add(g, 0xf0e3c4);
  } else { b.box([-.5, 1.6, 0], [2.2, 1.4, 1.8], 0xddcfae); b.box([-.5, 2.45, 0], [2.7, .25, 2.3], 0xa4654a); }
  return b.finish();
}

export function makeHeron() {
  const b = new ModelBuilder(); b.ball([0, 1.5, 0], [.6, .75, .36], 0x8b9f9e);
  for (const z of [-.2, .2]) b.rod([0, 1, z], [.1, 0, z], .035, 0x716844);
  b.rod([.2, 1.6, 0], [.48, 2.75, 0], .1, 0xcacbbb); b.ball([.55, 2.8, 0], [.24, .21, .17], 0xd5d8c7);
  b.rod([.65, 2.8, 0], [1.25, 2.65, 0], .08, 0xc59449, .005); return b.finish();
}

function blade(b: ModelBuilder, base: P, tip: P, width: number, color: number, angle: number) {
  const side = new T.Vector3(Math.cos(angle) * width, 0, Math.sin(angle) * width), a = new T.Vector3(...base), t = new T.Vector3(...tip), mid = a.clone().lerp(t, .52);
  const positions = [...a.clone().sub(side).toArray(), ...mid.clone().addScaledVector(side, .62).toArray(), ...t.toArray(), ...a.clone().sub(side).toArray(), ...t.toArray(), ...mid.clone().sub(side).toArray()];
  // Opaque two-sided folded blade; four triangles, no alpha sorting.
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute([...positions, ...positions.slice(6, 9), ...positions.slice(3, 6), ...positions.slice(0, 3), ...positions.slice(15, 18), ...positions.slice(12, 15), ...positions.slice(9, 12)], 3)); g.computeVertexNormals(); b.add(g, color);
}

export function makeUnderstory(kind: "grass" | "flowers" | "reeds" | "rock" | "hay" | "fern") {
  const b = new ModelBuilder(), rand = landscapeRandom(553);
  if (kind === "rock") {
    b.ball([0, 1.3, 0], [3, 2.4, 2.5], 0x929488); b.ball([-1.4, .6, .7], [2, 1.2, 1.6], 0x788278);
    b.ball([.2, 2.9, .2], [1.7, .22, 1.3], 0x7e8d57, 0);
  } else if (kind === "hay") {
    b.add(new T.CylinderGeometry(2, 2, 3.1, 16), 0xc4ab67, [0, 2, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    for (const z of [-1.1, 1.1]) b.add(new T.TorusGeometry(2.02, .055, 4, 20), 0x8b8450, [0, 2, z]);
  } else if (kind === "fern") {
    for (let frond = 0; frond < 9; frond++) {
      const a = frond / 9 * tau, r = 1.6 + rand() * .5;
      for (let j = 0; j < 7; j++) {
        const u = (j + 1) / 8, y = Math.sin(u * Math.PI * .8) * 1.55, x = Math.cos(a) * r * u, z = Math.sin(a) * r * u, len = Math.sin(u * Math.PI) * .5;
        for (const s of [-1, 1]) blade(b, [x, y, z], [x + Math.sin(a) * len * s + Math.cos(a) * .22, y + .04, z - Math.cos(a) * len * s + Math.sin(a) * .22], .09, j % 2 ? 0x49703f : 0x67834a, a);
      }
    }
  } else {
    const count = kind === "reeds" ? 12 : 32;
    for (let i = 0; i < count; i++) {
      const a = rand() * tau, r = Math.sqrt(rand()) * 1.55, x = Math.cos(a) * r, z = Math.sin(a) * r, h = kind === "reeds" ? 2 + rand() * 1.5 : .45 + rand() * 1.05;
      blade(b, [x, 0, z], [x + Math.cos(a) * .42, h, z + Math.sin(a) * .42], kind === "reeds" ? .065 : .055, [0x54773e, 0x6d8747, 0x8e9a57][i % 3], a + Math.PI / 2);
      if (kind === "reeds") { stem(b, [x, 0, z], [x, h, z], .03, .015, 0x8b8b55, 3); stem(b, [x, h - .3, z], [x, h + .17, z], .075, .065, 0x78604a, 4); }
      if (kind === "flowers" && i % 5 === 0) {
        for (let petal = 0; petal < 5; petal++) { const q = petal / 5 * tau; foliage(b, [x + Math.cos(q) * .13, h + .01, z + Math.sin(q) * .13], [.11, .07, .11], [0xd6cadb, 0xe5cb8b, 0xe1daca][i % 3], 222 + petal, true); }
        b.ball([x, h + .06, z], [.075, .055, .075], 0xab8847, 0);
      }
    }
  }
  return b.finish();
}
