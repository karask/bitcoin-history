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

export function makeTree(kind: "oak" | "pine" | "birch" | "autumn" | "willow" | "orchard", seed: number, distant = false) {
  const b = new ModelBuilder(), rand = landscapeRandom(seed), bark = kind === "birch" ? 0xc6c5ad : 0x65513c;
  const height = kind === "pine" ? 23 : kind === "birch" ? 19 : kind === "orchard" ? 10 : 17;
  b.rod([0, 0, 0], [.3, height * .8, -.25], kind === "birch" ? .4 : .85, bark, .16);
  if (!distant) for (let i = 0; i < 5; i++) { const a = i * 1.26; b.rod([0, 1.8, 0], [Math.cos(a) * 2, 0, Math.sin(a) * 2], .28, bark, .14); }
  if (kind === "pine") {
    for (let level = 0; level < 7; level++) {
      const y = 5 + level * 2.45, radius = 6.2 - level * .68;
      b.cone([0, y + 2.5, 0], radius, 6.2, [0x294e42, 0x356552, 0x427457][level % 3]);
      if (!distant) for (let branch = 0; branch < 5; branch++) {
        const a = branch * 1.26 + level * .7;
        b.rod([0, y, 0], [Math.cos(a) * radius * .83, y + .7, Math.sin(a) * radius * .83], .12, bark, .045);
        b.cone([Math.cos(a) * radius * .67, y + 1.8, Math.sin(a) * radius * .67], radius * .38, 3.1, [0x356552, 0x427457, 0x517f58][branch % 3], .05, 6);
      }
    }
  } else {
    const palette = kind === "autumn" ? [0xc58a36, 0xb4512d, 0xdda844, 0x967535] : kind === "willow" ? [0x7e9953, 0x648342, 0x9bab65] : [0x436d37, 0x5f873f, 0x7e9b4e, 0x527e42];
    const radius = kind === "birch" ? 3.5 : kind === "orchard" ? 4.2 : 7;
    for (let i = 0; i < (distant ? 8 : 18); i++) {
      const a = i * 2.399, reach = radius * (.35 + rand() * .6), y = height * (.48 + rand() * .48);
      const x = Math.cos(a) * reach, z = Math.sin(a) * reach;
      if (!distant) b.rod([0, height * .35, 0], [x, y, z], .24, bark, .07);
      b.ball([x, y, z], [radius * .42, kind === "willow" ? 5.6 : radius * .38, radius * .4], palette[i % palette.length], distant ? 0 : 1);
      if (!distant) {
        b.ball([x + radius * .2, y + 1.1, z - radius * .22], [radius * .25, radius * .22, radius * .26], palette[(i + 1) % palette.length], 0);
        if (kind === "willow") for (let j = 0; j < 3; j++) b.rod([x + j * .5, y, z], [x + j * .7, y - 5, z + .9], .055, 0x8c9e57, .035);
        if (kind === "orchard") b.ball([x, y - 1.2, z + 1.8], [.23, .25, .23], 0xb85032, 0);
      }
    }
    if (kind === "birch" && !distant) for (let i = 0; i < 11; i++) b.box([.02, 1 + i * 1.2, .38], [.48, .16, .05], 0x49493d);
  }
  return b.finish();
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

export function makeUnderstory(kind: "grass" | "flowers" | "reeds" | "rock" | "hay" | "fern") {
  const b = new ModelBuilder(), rand = landscapeRandom(553);
  if (kind === "rock") {
    b.ball([0, 1.3, 0], [3, 2.4, 2.5], 0x929488); b.ball([-1.4, .6, .7], [2, 1.2, 1.6], 0x788278);
    b.ball([.2, 2.9, .2], [1.7, .22, 1.3], 0x7e8d57, 0);
  } else if (kind === "hay") {
    b.add(new T.CylinderGeometry(2, 2, 3.1, 16), 0xc4ab67, [0, 2, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    for (const z of [-1.1, 1.1]) b.add(new T.TorusGeometry(2.02, .055, 4, 20), 0x8b8450, [0, 2, z]);
  } else if (kind === "fern") {
    for (let frond = 0; frond < 7; frond++) {
      const a = frond / 7 * 6.28;
      b.rod([0, 0, 0], [Math.cos(a) * 1.6, 1.2, Math.sin(a) * 1.6], .025, 0x658347, .01);
      for (let j = 1; j <= 6; j++) for (const side of [-1, 1]) {
        const d = j / 6 * 1.6, reach = (1 - j / 8) * .5;
        b.rod([Math.cos(a) * d, j / 6 * 1.2, Math.sin(a) * d], [Math.cos(a) * d + Math.sin(a) * reach * side, j / 6 * 1.2 - .15, Math.sin(a) * d - Math.cos(a) * reach * side], .095, j % 2 ? 0x537643 : 0x78974c, .008);
      }
    }
  } else for (let i = 0; i < (kind === "reeds" ? 9 : 13); i++) {
    const x = (rand() - .5) * 2.8, z = (rand() - .5) * 2.8, h = kind === "reeds" ? 2 + rand() * 1.5 : .6 + rand() * .8;
    b.rod([x, 0, z], [x + .2, h, z + .14], .035, kind === "reeds" ? 0x85854b : 0x7e944f, .01);
    if (kind === "reeds") b.rod([x + .2, h - .4, z + .14], [x + .2, h + .2, z + .14], .1, 0x7e5b3d);
    else if (kind === "flowers") b.ball([x + .2, h, z + .14], [.19, .11, .19], [0xd8c4de, 0xeace84, 0xe4e0c4][i % 3], 0);
    else b.box([x, h * .45, z], [.09, h * .85, .025], i % 2 ? 0x78914b : 0x9fa861, [0, rand() * 6.28, -.25]);
  }
  return b.finish();
}
