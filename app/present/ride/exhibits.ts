import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PresentationEvent } from "@/lib/event-schema";

export type ExhibitKind = "pizza" | "computer" | "genesis" | "mine" | "government" | "exchange" | "collapse" | "network" | "market";

/** Artifacts are interpretive, never claimed to reconstruct a real room or building. */
export function exhibitKind(event: Pick<PresentationEvent, "slug" | "category" | "kind">): ExhibitKind {
  if (event.slug.includes("pizza")) return "pizza";
  if (event.slug === "genesis-block-mined") return "genesis";
  if (event.category === "policy" || ["law", "guidance", "ruling", "enforcement"].includes(event.kind)
    || /bitcoin-law|legal-tender|strategic-bitcoin|central-african/.test(event.slug)) return "government";
  if (event.category === "mining") return "mine";
  if (event.category === "crisis" || event.kind === "failure") return "collapse";
  if (event.category === "protocol") return "network";
  if (event.category === "finance") return event.kind === "record" ? "market" : "exchange";
  if (event.category === "origins") return "computer";
  if (event.category === "adoption") return "market";
  return "exchange";
}

export type Exhibit = { group: THREE.Group; update: (time: number) => void; dispose: () => void; kind: ExhibitKind };

export function exhibitDate(event: Pick<PresentationEvent, "date" | "precision">): string {
  if (event.precision === "year") return event.date.slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", ...(event.precision === "day" ? { day: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${event.date}T00:00:00Z`));
}

/** Local scene: x = screen right, y = up, z = towards the rider. */
export function buildExhibit(event: PresentationEvent, accent: number): Exhibit {
  const group = new THREE.Group();
  const artifacts = new THREE.Group();
  group.add(artifacts);
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const animations: ((t: number) => void)[] = [];
  const mat = (color: number, metalness = 0, roughness = 0.7, glow = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: color, emissiveIntensity: glow });
    materials.push(m); return m;
  };
  const stone = mat(0xbfc5c9), dark = mat(0x243640, 0.25, 0.45), steel = mat(0x849da9, 0.45, 0.35);
  const paper = mat(0xfff1cf), wood = mat(0x8a512d), gold = mat(0xffb844, 0.7, 0.3);
  const light = mat(accent, 0.25, 0.3, 1.4), screen = mat(0x63ddc0, 0.15, 0.4, 0.7);
  const red = mat(0xbc3425), cream = mat(0xe8d7b9), black = mat(0x080d11);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent = artifacts) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, p = artifacts) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, p);
  const cylinder = (x: number, y: number, z: number, r: number, h: number, m: THREE.Material, top = r, p = artifacts) => add(new THREE.CylinderGeometry(top, r, h, 24), m, x, y, z, p);
  const ring = (x: number, y: number, z: number, r: number, tube: number, m: THREE.Material, p = artifacts) => add(new THREE.TorusGeometry(r, tube, 8, 40), m, x, y, z, p);

  function plaque(text: string, x: number, y: number, z: number, w: number, h: number, opts: { color?: string; bg?: string; size?: number; align?: CanvasTextAlign; parent?: THREE.Group } = {}) {
    const canvas = document.createElement("canvas"); canvas.width = 1536; canvas.height = Math.round(1536 * h / w);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = opts.bg ?? "#0b171e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = opts.color ?? "#f5eddc";
    let size = opts.size ?? Math.min(95, canvas.height * 0.21);
    const font = () => { ctx.font = `500 ${size}px ${opts.size ? "monospace" : "Arial, sans-serif"}`; };
    font();
    ctx.textAlign = opts.align ?? "center"; ctx.textBaseline = "middle";
    let lines: string[] = [];
    const wrap = () => {
    lines = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        if (ctx.measureText(`${line} ${word}`).width > canvas.width - 120 && line) { lines.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      }
      lines.push(line);
    }
    };
    wrap();
    while (size > 12 && size * 1.35 * lines.length > canvas.height - 30) { size *= 0.9; font(); wrap(); }
    const lineHeight = size * 1.35;
    lines.forEach((line, i) => ctx.fillText(line, opts.align === "left" ? 60 : canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * lineHeight));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; textures.push(texture);
    const m = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.push(m);
    return add(new THREE.PlaneGeometry(w, h), m, x, y, z, opts.parent ?? artifacts);
  }

  // A tangible exhibition island: layered limestone plinth, recessed edge light,
  // brushed metal railings and an architectural title blade, off the track corridor.
  box(0, -1.5, 0, 35, 3, 27, dark);
  box(0, 0.15, 0, 34.6, 0.3, 26.6, light);
  box(0, 0.45, 0, 34, 0.3, 26, stone);
  for (const x of [-16, 16]) {
    for (let z = -11; z <= 10; z += 7) cylinder(x, 2.2, z, 0.12, 3.4, steel);
    box(x, 3.8, -1, 0.12, 0.12, 24, steel);
  }
  box(0, 22, -10, 34, 5.2, 0.8, dark);
  plaque(`${event.date.slice(0, 4)}  /  ${event.title}`, 0, 22, -9.56, 32.5, 4.5);
  for (const x of [-16, 16]) box(x, 11, -10, 0.45, 22, 0.45, steel);
  plaque(event.summary, 0, 3, 13.1, 29, 3.8, { size: 56 });
  plaque(`${exhibitDate(event)}   •   ${event.evidence.toUpperCase()}   •   INTERPRETIVE EXHIBIT`, 0, -0.8, 13.55, 31, 1, { size: 40, color: "#b5c6cb" });

  const monitor = (x: number, y: number, z: number, label: string, p = artifacts) => {
    box(x, y, z, 5.8, 4.7, 4.1, cream, p);
    box(x, y, z + 2.1, 4.9, 3.6, 0.22, dark, p);
    plaque(label, x, y, z + 2.23, 4.4, 3.1, { bg: "#0c2525", color: "#91edb5", size: 120, parent: p });
    box(x, y - 2.7, z, 2.8, 0.7, 2.4, cream, p);
    cylinder(x + 2.25, y - 1.8, z + 2.15, 0.12, 0.12, light, 0.12, p).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) box(x + 2.94, y - 1.5 + i * 0.38, z - 0.2, 0.04, 0.1, 2.8, dark, p);
  };
  const desk = () => {
    box(0, 5.8, 1, 23, 0.8, 10, wood);
    for (const x of [-9, 9]) for (const z of [-2, 4]) box(x, 3, z, 0.6, 5.6, 0.6, steel);
  };
  const coin = (x: number, y: number, z: number, r: number, p = artifacts) => {
    const coinGroup = new THREE.Group(); p.add(coinGroup); coinGroup.position.set(x, y, z);
    cylinder(0, 0, 0, r, 0.38, gold, r, coinGroup).rotation.x = Math.PI / 2;
    ring(0, 0, 0.21, r * 0.85, 0.08, light, coinGroup);
    plaque("₿", 0, 0, 0.24, r * 1.1, r * 1.5, { color: "#ffda80", bg: "#ad641c", size: 1300, parent: coinGroup });
    return coinGroup;
  };
  const kind = exhibitKind(event);

  if (kind === "pizza") {
    desk();
    const sauce = mat(0xaf3520), cheese = mat(0xf7c34e), crust = mat(0xc78037), basil = mat(0x376f31);
    for (const x of [-6.2, 6.2]) {
      box(x, 6.5, 1.5, 10.4, 0.4, 10.4, cream);
      box(x, 6.9, 6.5, 10.4, 0.8, 0.25, cream);
      for (const side of [-5, 5]) box(x + side, 6.9, 1.5, 0.25, 0.8, 10, cream);
      const lid = box(x, 11.4, -4, 10.4, 10.4, 0.25, cream); lid.rotation.x = -0.16;
      plaque(`PIZZA\n${event.date}`, x, 12, -3.05, 8.3, 4, { bg: "#e8d7b9", color: "#b44024", size: 120 });
      cylinder(x, 6.9, 1.5, 4.5, 0.48, crust);
      cylinder(x, 7.17, 1.5, 4.15, 0.09, sauce);
      cylinder(x, 7.24, 1.5, 3.95, 0.1, cheese);
      const rim = ring(x, 7.2, 1.5, 4.18, 0.32, crust); rim.rotation.x = Math.PI / 2;
      for (let i = 0; i < 21; i++) {
        const a = i * 2.39996, r = Math.sqrt((i + 1) / 22) * 3.4;
        cylinder(x + Math.cos(a) * r, 7.34, 1.5 + Math.sin(a) * r, 0.46, 0.08, red);
        box(x + Math.sin(a * 2) * r, 7.4, 1.5 + Math.cos(a * 2) * r, 0.18, 0.05, 0.5, basil).rotation.y = a;
      }
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const cut = box(x + Math.sin(a) * 2, 7.33, 1.5 + Math.cos(a) * 2, 0.035, 0.03, 4, sauce); cut.rotation.y = a;
      }
    }
    plaque("10,000 BTC  →  TWO PIZZAS", 0, 18, -7, 25, 2, { color: "#ffd693", size: 92 });
  } else if (kind === "computer" || kind === "genesis") {
    desk(); monitor(-4, 9, 0, kind === "genesis" ? "BITCOIN v0.1\nblock: 0\n50 BTC" : `${event.actors[0] ?? "P2P RESEARCH"}\n${event.date.slice(0, 4)}\n${event.kind.toUpperCase()}`);
    box(-4, 6.5, 4.4, 7, 0.35, 2.4, cream);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 13; col++) box(-6.8 + col * 0.47, 6.76, 3.7 + row * 0.46, 0.36, 0.14, 0.34, paper);
    box(5, 9, 0, 3.5, 5.6, 5, cream);
    for (let i = 0; i < 4; i++) box(5, 10.5 - i * 0.6, 2.55, 2.8, 0.18, 0.04, dark);
    const page = plaque(kind === "genesis" ? "The Times 03/Jan/2009\nChancellor on brink of\nsecond bailout for banks" : event.slug === "bitcoin-white-paper-announced" ? "Bitcoin: A Peer-to-Peer\nElectronic Cash System\n\nSatoshi Nakamoto" : `${event.title}\n\n${event.actors.join(" / ")}`, 8.5, 13, -4, 10, 10.5, { bg: "#eee4ce", color: "#252923", size: 90 }); page.rotation.z = -0.05;
    if (kind === "genesis") {
      const block = box(0, 15, -2, 5, 5, 5, gold, group);
      animations.push(t => { block.rotation.y = t * 0.22; });
      plaque("000000000019d6689c…\nGENESIS / BLOCK 0", 0, 18.5, -3, 18, 1.7, { size: 90 });
    } else {
      for (let i = 0; i < 4; i++) box(8, 6.35 + i * 0.1, 4, 5, 0.08, 3, paper);
    }
  } else if (kind === "mine") {
    for (let rack = 0; rack < 4; rack++) {
      const x = -10.5 + rack * 7;
      box(x, 7, -1, 5.7, 13, 7, dark);
      for (const side of [-2.9, 2.9]) box(x + side, 7, 2.6, 0.2, 13, 0.2, steel);
      for (let row = 0; row < 5; row++) {
        const y = 2 + row * 2.4;
        box(x, y, -0.5, 5.2, 1.9, 6, steel);
        for (const dx of [-1.4, 1.4]) {
          const fan = new THREE.Group(); group.add(fan); fan.position.set(x + dx, y, 2.6);
          cylinder(x + dx, y, 2.6, 0.75, 0.15, black).rotation.x = Math.PI / 2;
          ring(x + dx, y, 2.7, 0.77, 0.06, dark);
          for (let j = 0; j < 5; j++) { const blade = box(0, 0, 0.18, 1.2, 0.12, 0.04, steel, fan); blade.rotation.z = j * Math.PI / 5; }
          animations.push(t => { fan.rotation.z = t * 2; });
        }
        box(x + 2.3, y, 2.6, 0.13, 0.15, 0.1, light);
      }
    }
    const subsidy = event.slug.includes("first-") ? "50 → 25" : event.slug.includes("second-") ? "25 → 12.5" : event.slug.includes("third-") ? "12.5 → 6.25" : "6.25 → 3.125";
    plaque(event.slug.includes("halving") ? `BLOCK SUBSIDY\n${subsidy} BTC` : `PROOF OF WORK${event.blockHeight !== undefined ? `\nBLOCK ${event.blockHeight.toLocaleString("en-US")}` : ""}`, 0, 17, -5, 26, 4, { size: 125 });
  } else if (kind === "government") {
    for (let i = 0; i < 4; i++) box(0, 0.8 + i * 0.45, 1, 29 - i * 1.6, 0.45, 18 - i, stone);
    box(0, 8, -4, 26, 12, 5, cream);
    for (let i = 0; i < 7; i++) {
      const x = -11.4 + i * 3.8;
      cylinder(x, 8, 3, 0.63, 11, paper, 0.5);
      cylinder(x, 2.8, 3, 0.95, 0.65, stone); cylinder(x, 13.5, 3, 0.95, 0.65, stone);
      for (let flute = 0; flute < 8; flute++) {
        const a = flute * Math.PI / 4;
        cylinder(x + Math.cos(a) * 0.59, 8, 3 + Math.sin(a) * 0.59, 0.045, 10, stone);
      }
    }
    box(0, 14.5, 0, 29, 1.2, 13, stone);
    const roofShape = new THREE.Shape(); roofShape.moveTo(-14.5, 0); roofShape.lineTo(14.5, 0); roofShape.lineTo(0, 5); roofShape.closePath();
    add(new THREE.ExtrudeGeometry(roofShape, { depth: 11, bevelEnabled: false }), cream, 0, 15, -5.5);
    const country = event.places.map(p => p.country).filter(p => p !== "XX").join(" / ") || "GLOBAL POLICY";
    plaque(country, 0, 16.1, 5.55, 11, 1.8, { bg: "#e8d7b9", color: "#333c45", size: 180 });
    // Country-labelled pennants, not invented seals or claims of architectural accuracy.
    for (const x of [-14, 14]) {
      cylinder(x, 13, -6.5, 0.11, 24, steel);
      const flag = plaque(country, x + 2.2, 23.1, -6.5, 4.1, 2.5, { bg: "#244983", size: 350 });
      flag.rotation.y = x > 0 ? 0.12 : -0.12;
    }
    box(0, 4, 9, 6, 4, 3, wood);
    const law = plaque(event.kind.toUpperCase(), 0, 5, 10.6, 5, 2.5, { bg: "#754626", color: "#ffd18b", size: 180 }); law.rotation.x = -0.1;
    if (/\bban|prohibit|restrict|illegal/i.test(event.title)) {
      for (const x of [-9, 9]) box(x, 4, 10, 0.4, 6, 0.4, dark);
      box(0, 6, 10, 18, 0.6, 0.5, red);
    }
  } else if (kind === "exchange" || kind === "collapse") {
    const failed = kind === "collapse";
    for (let i = 0; i < 3; i++) {
      const x = -9 + i * 9, h = [12, 18, 14][i];
      const tower = new THREE.Group(); artifacts.add(tower); tower.position.set(x, 0, -3);
      if (failed && i !== 1) tower.rotation.z = i === 0 ? 0.17 : -0.2;
      box(0, h / 2, 0, 7, h, 7, dark, tower);
      for (let y = 2; y < h; y += 2) for (let col = 0; col < 4; col++) {
        box(-2.5 + col * 1.65, y, 3.52, 1, 1.15, 0.05, failed && (col + y) % 3 ? black : screen, tower);
      }
      for (const dx of [-3.6, 3.6]) box(dx, h / 2, 3.6, 0.2, h, 0.2, steel, tower);
    }
    plaque(failed ? `CRISIS & CONSEQUENCES\n${event.kind.toUpperCase()}` : "BTC / USD\nMARKET ACCESS", 0, 10.7, 1, 22, 4, { bg: failed ? "#3e100c" : "#0b2628", color: failed ? "#ff8e76" : "#a6eee4", size: 125 });
    if (failed) {
      for (let i = 0; i < 26; i++) { const debris = box(Math.sin(i * 3) * 12, 1.2 + (i % 3) * 0.3, 5 + Math.cos(i * 4) * 4, 1 + i % 3, 0.8, 1.7, stone); debris.rotation.set(i * 0.12, i, i * 0.3); }
      for (const x of [-13, 13]) { cylinder(x, 3, 9, 0.15, 5, steel); }
      box(0, 4, 9, 26, 0.6, 0.1, gold);
    } else {
      desk(); monitor(-5, 9, 3, "SPOT BTC\nOPEN"); monitor(5, 9, 3, "ORDER BOOK\nBTC / USD");
    }
  } else if (kind === "network") {
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const pos = new THREE.Vector3(Math.cos(a) * 11, 8 + Math.sin(a * 2) * 4, Math.sin(a) * 7);
      nodes.push(pos); add(new THREE.IcosahedronGeometry(1.5, 1), i % 2 ? light : steel, pos.x, pos.y, pos.z);
      cylinder(pos.x, pos.y / 2, pos.z, 0.14, pos.y, steel);
    }
    for (let i = 0; i < nodes.length; i++) {
      for (const offset of [1, 3]) {
        const a = nodes[i], b = nodes[(i + offset) % nodes.length];
        const tube = new THREE.LineCurve3(a, b);
        add(new THREE.TubeGeometry(tube, 1, 0.065, 4, false), light, 0, 0, 0);
      }
    }
    plaque(event.bip ? `BIP ${event.bip}\n${event.kind.toUpperCase()}` : `PEER TO PEER\n${event.kind.toUpperCase()}`, 0, 17, -5, 22, 3.2, { size: 135 });
    const c = coin(0, 9, 4, 3.1, group); animations.push(t => { c.rotation.y = Math.sin(t * 0.45) * 0.3; });
  } else {
    if (event.kind === "record") {
      for (let i = 0; i < 7; i++) {
        const h = 2 + i * 2;
        box(-10 + i * 3.2, h / 2 + 1, -3, 2, h, 3, i === 6 ? gold : steel);
      }
      const c = coin(0, 13, 5, 4.6, group); animations.push(t => { c.rotation.y = Math.sin(t * 0.4) * 0.3; });
      plaque("MARKET MILESTONE", 0, 18, -6, 25, 2, { size: 90 });
    } else {
      box(0, 6, -2, 24, 11, 11, cream);
      box(0, 11.8, 3.8, 26, 1, 6, red);
      for (let i = 0; i < 12; i++) box(-11 + i * 2, 11.8, 3.8, 0.9, 1.05, 6.1, paper);
      for (const x of [-7, 7]) box(x, 6.5, 3.6, 6, 6, 0.1, screen);
      box(0, 5, 3.65, 4, 8, 0.15, dark);
      plaque("PAYMENTS & ADOPTION", 0, 15, -1, 24, 3, { size: 120 });
      coin(0, 6, 3.85, 1.2);
      cylinder(-11, 3, 8, 2, 0.4, wood); cylinder(-11, 1.7, 8, 0.25, 3, steel);
    }
  }

  // Bake static architectural parts by material: hundreds of details, few draw calls.
  const bake = (target: THREE.Group) => {
  target.updateMatrixWorld(true);
  const inverse = target.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  target.traverse(child => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    const transformed = child.geometry.clone().applyMatrix4(inverse.clone().multiply(child.matrixWorld));
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    const list = batches.get(child.material) ?? []; list.push(geometry); batches.set(child.material, list);
  });
  target.clear();
  for (const [material, parts] of batches) {
    // All generated geometries expose position, normal and uv.
    const merged = mergeGeometries(parts); parts.forEach(p => p.dispose());
    if (!merged) continue;
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh);
  }
  };
  // Fan rotors and coins remain independently animated, but are batched internally.
  for (const child of group.children) if (child instanceof THREE.Group) bake(child);
  return {
    group, kind,
    update: time => animations.forEach(animate => animate(time)),
    dispose: () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear(); },
  };
}
