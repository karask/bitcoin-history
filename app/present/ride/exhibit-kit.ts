import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PresentationEvent } from "@/lib/event-schema";
import type { ExhibitDesign } from "./exhibit-design.ts";

type Point = [number, number, number];
type Surface = T.Material;

/** Resource-owning, batched miniature workshop. All coordinates are in local metres. */
export class ExhibitKit {
  readonly group = new T.Group();
  readonly static = new T.Group();
  readonly animations: ((t: number) => void)[] = [];
  readonly resources = { geometry: new Set<T.BufferGeometry>(), material: new Set<T.Material>(), texture: new Set<T.Texture>() };
  readonly semantic = new Set<string>();
  private seed = 210000;
  private disposed = false;
  readonly m: Record<string, T.MeshStandardMaterial>;
  readonly event: PresentationEvent;
  readonly design: Readonly<ExhibitDesign>;

  constructor(event: PresentationEvent, design: Readonly<ExhibitDesign>, accent: number) {
    this.event = event; this.design = design;
    this.group.add(this.static);
    this.group.name = event.slug;
    for (const char of event.slug) this.seed = (this.seed * 31 + char.charCodeAt(0)) >>> 0;
    this.m = {
      ink: this.material(0x152b2d), edge: this.material(0x0f1a1e), panel: this.material(0x29454b),
      stone: this.material(0xd0caba), paper: this.material(0xf1e6cc), cream: this.material(0xddccb0),
      brass: this.material(0xc69a54, .32, .72), steel: this.material(0x81908c, .35, .65),
      red: this.material(0xab4836), blue: this.material(0x4e8299), green: this.material(0x43876a),
      glow: this.material(accent, .5, .15, .5), screen: this.material(0x7aa98f, .6, 0, .25),
      wood: this.material(0xffffff, .7), brick: this.material(0x945f47, .94),
    };
    const wood = this.texture(512, 128, c => {
      c.fillStyle = "#825338"; c.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 150; i++) {
        c.strokeStyle = i % 2 ? "#946345" : "#70432d"; c.lineWidth = .7;
        c.beginPath(); const y = this.random() * 128; c.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) c.lineTo(x, y + Math.sin(x / 70 + i) * 1.4);
        c.stroke();
      }
      c.fillStyle = "#523526"; for (let i = 0; i < 4; i++) c.fillRect(0, i * 32, 512, 1);
    });
    this.m.wood.map = wood; this.m.wood.bumpMap = wood; this.m.wood.bumpScale = .025;
    this.animations.push(time => { this.m.glow.emissiveIntensity = .45 + Math.sin(time * .8) * .08; });
  }
  random() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  mark(name: string) { this.semantic.add(name); }
  material(color: number, roughness = .75, metalness = 0, emissive = 0) {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness, emissive: color, emissiveIntensity: emissive });
    this.resources.material.add(m); return m;
  }
  mesh(g: T.BufferGeometry, m: Surface, x = 0, y = 0, z = 0, parent: T.Object3D = this.static) {
    this.resources.geometry.add(g); this.resources.material.add(m);
    const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, m: Surface = this.m.ink, radius = .06, parent: T.Object3D = this.static) {
    const g = radius && Math.min(w, h, d) > .25 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 4, h / 4, d / 4)) : new T.BoxGeometry(w, h, d);
    return this.mesh(g, m, x, y, z, parent);
  }
  cyl(x: number, y: number, z: number, r: number, h: number, m: Surface = this.m.brass, parent: T.Object3D = this.static, top = r) {
    return this.mesh(new T.CylinderGeometry(top, r, h, r > 1 ? 32 : 16), m, x, y, z, parent);
  }
  sphere(x: number, y: number, z: number, r: number, m: Surface = this.m.brass, parent: T.Object3D = this.static) {
    return this.mesh(new T.SphereGeometry(r, 12, 8), m, x, y, z, parent);
  }
  ring(x: number, y: number, z: number, r: number, tube: number, m: Surface = this.m.brass, parent: T.Object3D = this.static) {
    return this.mesh(new T.TorusGeometry(r, tube, 6, 32), m, x, y, z, parent);
  }
  tube(points: Point[], radius = .06, m: Surface = this.m.brass, parent: T.Object3D = this.static) {
    return this.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v => new T.Vector3(...v))), Math.max(8, points.length * 6), radius, 6, false), m, 0, 0, 0, parent);
  }
  texture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    paint(canvas.getContext("2d")!);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    this.resources.texture.add(texture); return texture;
  }
  label(text: string, x: number, y: number, z: number, w: number, h: number, options: { bg?: string; color?: string; parent?: T.Object3D; size?: number } = {}) {
    const map = this.texture(1024, Math.max(64, Math.min(1024, Math.round(1024 * h / w))), c => {
      const height = c.canvas.height;
      c.fillStyle = options.bg ?? "#14292c"; c.fillRect(0, 0, 1024, height);
      c.fillStyle = options.color ?? "#f0ddb6"; c.textAlign = "center"; c.textBaseline = "middle";
      let size = options.size ?? Math.min(100, height * .5), lines: string[] = [];
      const wrap = () => {
        c.font = `600 ${size}px Arial,sans-serif`; lines = [];
        for (const paragraph of text.split("\n")) {
          let line = "";
          for (const word of paragraph.split(" ")) {
            if (c.measureText(`${line} ${word}`).width > 930 && line) { lines.push(line); line = word; }
            else line = line ? `${line} ${word}` : word;
          }
          lines.push(line);
        }
      };
      wrap(); while (size > 14 && lines.length * size * 1.3 > height - 16) { size *= .9; wrap(); }
      lines.forEach((line, i) => c.fillText(line, 512, height / 2 + (i - (lines.length - 1) / 2) * size * 1.3, 950));
    });
    const material = this.material(0xffffff, 1, 0, .12); material.map = map; material.emissiveMap = map;
    material.envMapIntensity = .04; // Printed ink must not turn silver in the studio reflection.
    return this.mesh(new T.PlaneGeometry(w, h), material, x, y, z, options.parent);
  }
  framed(text: string, x: number, y: number, z: number, w: number, h: number, paper = false) {
    this.box(x, y, z, w + .4, h + .4, .28, this.m.brass);
    return this.label(text, x, y, z + .151, w, h, paper ? { bg: "#eee3cb", color: "#283d3c" } : {});
  }
  floor(style: "office" | "workshop" | "civic" | "gallery" = "office") {
    const { m } = this;
    this.box(0, -1, 0, 35, 2, 27, m.edge, .3);
    this.box(0, .03, 0, 34.7, .18, 26.7, m.brass);
    const tile = style === "civic" || style === "gallery" ? m.stone : m.panel;
    for (let x = -15; x <= 15; x += 3) for (let z = -11.7; z <= 12; z += 3) this.box(x, .22, z, 2.96, .2, 2.94, (Math.round(x + z) % 3 === 0 && style === "gallery") ? m.cream : tile, 0);
    this.box(0, 10, -12, 34, 19.6, .6, style === "workshop" ? m.ink : m.panel);
    if (style === "workshop") {
      for (let row = 0; row < 16; row++) for (let col = 0; col < 15; col++) this.box(-16 + col * 2.2 + (row % 2) * 1.1, .9 + row * 1.12, -11.55, 2.08, 1.02, .22, row % 3 ? m.brick : m.wood);
    } else {
      for (let x = -15; x <= 15; x += 3) {
        this.box(x, 8, -11.58, .18, 15, .15, m.brass, 0);
        this.box(x + 1.5, 7.7, -11.54, 2.65, 13.7, .18, style === "civic" ? m.wood : m.ink);
      }
    }
    this.box(0, 20, -12, 34.5, .5, 1, m.wood);
    this.box(0, 1, -11.48, 34, .5, .3, m.brass);
    this.framed(this.event.title, 0, 17.9, -11.38, 30, 3.15);
    // On the plinth's front face, in two halves either side of the terrace steps, which
    // stand in front of its middle. (A single centred caption sat inside the plinth.)
    this.label(`${this.event.date}   •   ${this.event.evidence.toUpperCase()}`, -11, -.8, 13.52, 11.5, 1.1, { size: 57 });
    this.label("INTERPRETIVE DIORAMA", 11, -.8, 13.52, 11.5, 1.1, { size: 57 });
    // Visible fixtures, not per-exhibit lights: the ride has a fixed light budget.
    for (const x of [-12, 12]) {
      this.tube([[x, 20, -11], [x, 21, -8.5], [x, 19.4, -7.5]], .07, m.brass);
      this.cyl(x, 19.3, -7.5, 1.1, .25, m.ink, this.static, .7);
      this.cyl(x, 19.14, -7.5, .9, .04, m.glow);
    }
  }
  desk(x = 0, z = 2, width = 24, height = 5.8) {
    this.box(x, height, z, width, .65, 8, this.m.wood, .12);
    for (const dx of [-width / 2 + 1.2, width / 2 - 1.2]) {
      this.box(x + dx, height / 2, z, .45, height, 6, this.m.ink);
      this.box(x + dx, .6, z, 1.1, .2, 7, this.m.brass);
    }
    this.box(x, height - 1, z - 2.9, width - 2, 1.1, .3, this.m.panel);
  }
  keyboard(x: number, y: number, z: number, scale = 1) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); this.static.add(g);
    this.box(0, 0, 0, 6.8, .25, 2.3, this.m.cream, .05, g);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 13; col++) this.box(-2.98 + col * .48, .22, -.78 + row * .45, .37, .15, .34, this.m.paper, 0, g);
    this.box(0, .22, 1, 2.7, .15, .23, this.m.paper, 0, g);
    this.tube([[x + 3, y, z - 1], [x + 4, y + .1, z - 2], [x + 3, y, z - 4]], .055, this.m.edge);
  }
  monitor(x: number, y: number, z: number, text: string, modern = false) {
    const { m } = this;
    this.box(x, y, z, 6.6, 5, modern ? .6 : 4, modern ? m.ink : m.cream, .22);
    const face = z + (modern ? .35 : 2.1);
    this.box(x, y, face, 5.9, 4.3, .22, m.edge, .12);
    this.label(text, x, y, face + .12, 5.45, 3.85, { bg: "#102323", color: "#adcfab", size: 78 });
    this.cyl(x, y - 3, z, .35, 1.4, m.steel);
    this.box(x, y - 3.6, z, 3.5, .22, 2.7, m.cream);
    this.sphere(x + 2.6, y - 2.05, face + .17, .08, m.glow);
    if (!modern) for (let i = 0; i < 7; i++) this.box(x + 3.31, y - 1.4 + i * .4, z, .025, .11, 2.6, m.ink, 0);
  }
  folio(x: number, y: number, z: number, title: string, tilt = -.16) {
    // A visible museum document stand, even when no desk sits underneath it.
    const stemHeight = Math.max(.5, y - 4.3);
    this.cyl(x, stemHeight / 2 + .35, z - .3, .11, stemHeight, this.m.brass);
    this.cyl(x, .44, z - .3, 1.35, .18, this.m.ink);
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.x = tilt; this.static.add(g);
    this.box(0, 0, 0, 7.4, 9.5, .4, this.m.wood, .05, g);
    this.box(.08, 0, .23, 6.95, 9.05, .12, this.m.paper, 0, g);
    this.label(title, .1, 1.2, .302, 6.6, 5.5, { bg: "#eee3cb", color: "#101f20", parent: g, size: 100 });
    for (let i = 0; i < 5; i++) this.box(.1, -2 - i * .37, .31, 5.8 - (i % 2) * .8, .065, .01, this.m.cream, 0, g);
    this.cyl(-2.3, -3.5, 0, .08, .7, this.m.brass, g).rotation.x = Math.PI / 2;
  }
  books(x: number, y: number, z: number, count = 7) {
    for (let i = 0; i < count; i++) {
      const h = 2.2 + (i % 3) * .5;
      this.box(x + i * .55, y + h / 2, z, .5, h, 1.8, [this.m.red, this.m.panel, this.m.cream][i % 3]);
      for (const yy of [.35, h - .3]) this.box(x + i * .55, y + yy, z + .91, .4, .09, .015, this.m.brass, 0);
    }
  }
  plant(x: number, z: number) {
    this.cyl(x, 1.4, z, 1.05, 2.2, this.m.cream, this.static, .8);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, dx = Math.sin(a) * 1.1, dz = Math.cos(a) * .9;
      this.tube([[x, 2, z], [x + dx * .5, 3.3, z + dz * .5], [x + dx, 4 + i % 3 * .3, z + dz]], .04, this.m.wood);
      const leaf = this.sphere(x + dx, 4 + i % 3 * .3, z + dz, .7, this.m.green); leaf.scale.set(.5, 1.3, .25); leaf.rotation.z = -dx * .5;
    }
  }
  coin(x: number, y: number, z: number, radius = 1.2, label = "BTC", parent: T.Object3D = this.static) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    this.cyl(0, 0, 0, radius, .25, this.m.brass, g).rotation.x = Math.PI / 2;
    this.ring(0, 0, .14, radius * .88, .045, this.m.cream, g);
    if (label) this.label(label, 0, 0, .145, radius * 1.35, radius * .8, { bg: "#ab7c35", color: "#fff0b8", parent: g, size: 230 });
    return g;
  }
  safe(x: number, y: number, z: number, open = false, scale = 1) {
    this.mark(open ? "open-vault" : "secured-vault");
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); this.static.add(g);
    this.box(0, 0, 0, 10, 11, 6, this.m.steel, .3, g);
    this.box(0, 0, 3.05, 8.5, 9.5, .15, this.m.edge, .15, g);
    for (let i = 0; i < 3; i++) {
      this.box(0, -3 + i * 2.6, 2.8, 8.1, .12, 3, this.m.brass, 0, g);
      for (let j = 0; j < 4; j++) this.box(-3 + j * 1.8, -2.6 + i * 2.6, 2.2, 1.4, .5, 1.5, this.m.brass, .1, g);
    }
    const door = new T.Group(); door.position.set(-4.4, 0, 3.3); door.rotation.y = open ? -1.12 : 0; g.add(door);
    this.box(4.4, 0, 0, 8.8, 10, .65, this.m.ink, .2, door);
    this.ring(4.4, 0, .42, 2.25, .12, this.m.brass, door);
    this.cyl(4.4, 0, .4, .55, .4, this.m.steel, door).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const spoke = this.box(4.4 + Math.cos(a), Math.sin(a), .65, 2, .16, .2, this.m.brass, 0, door); spoke.rotation.z = a;
    }
    for (const yy of [-3.8, 3.8]) this.cyl(.15, yy, 0, .25, 1.2, this.m.brass, door);
  }
  server(x: number, z: number, on = true, rows = 4, gpu = false) {
    this.mark(gpu ? "gpu-rig" : on ? "powered-rack" : "unpowered-rack");
    const { m } = this, h = rows * 2.2 + 1.1;
    this.box(x, h / 2 + .4, z, 6.1, h, 5.5, m.edge);
    for (const dx of [-2.8, 2.8]) this.box(x + dx, h / 2 + .4, z + 2.8, .2, h, .25, m.steel, 0);
    for (let row = 0; row < rows; row++) {
      const y = 1.7 + row * 2.2;
      this.box(x, y, z + .2, 5.3, 1.9, 5, gpu ? m.green : m.steel);
      for (const dx of [-1.5, 1.2]) {
        this.cyl(x + dx, y, z + 2.8, .78, .12, m.edge).rotation.x = Math.PI / 2;
        this.ring(x + dx, y, z + 2.9, .78, .06, m.steel);
        for (let blade = 0; blade < 5; blade++) {
          const angle = blade * Math.PI * 2 / 5;
          const b = this.box(x + dx + Math.sin(angle) * .3, y + Math.cos(angle) * .3, z + 2.92, .27, .68, .07, m.panel, 0); b.rotation.z = -angle;
        }
      }
      this.box(x + 2.27, y + .35, z + 2.8, .13, .12, .1, on ? m.glow : m.red, 0);
      for (let i = 0; i < 5; i++) this.box(x + 2.25, y - .2 - i * .14, z + 2.82, .25, .035, .025, m.ink, 0);
      this.tube([[x + 2.8, y, z + 2.8], [x + 3.4, y - .6, z + 2.6], [x + 3.5, .5, z]], .045, row % 2 ? m.blue : m.brass);
    }
  }
  barrier(x = 0, z = 7, open = false) {
    this.mark(open ? "open-gate" : "closed-gate");
    for (const dx of [-9, 9]) { this.box(x + dx, 2.1, z, .4, 3.5, .4, this.m.steel); this.box(x + dx, .5, z, 2, .25, 2, this.m.ink); }
    const arm = new T.Group(); arm.position.set(x - 9, 3.5, z); arm.rotation.z = open ? 1.14 : 0; this.static.add(arm);
    this.box(9, 0, 0, 18, .65, .4, this.m.cream, 0, arm);
    for (let i = 0; i < 9; i++) this.box(i * 2 + 1, 0, .22, .85, .65, .05, this.m.red, 0, arm);
  }
  finish() {
    this.group.updateMatrixWorld(true);
    const bake = (target: T.Group) => {
      const inverse = target.matrixWorld.clone().invert(), batches = new Map<Surface, T.BufferGeometry[]>();
      target.traverse(o => {
        if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return;
        let geometry = o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
        if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
        for (const key of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(key)) geometry.deleteAttribute(key);
        const list = batches.get(o.material) ?? []; list.push(geometry); batches.set(o.material, list);
      });
      target.clear();
      for (const [material, parts] of batches) {
        const merged = mergeGeometries(parts); parts.forEach(g => g.dispose());
        if (merged) { const m = new T.Mesh(merged, material); m.castShadow = true; m.receiveShadow = true; target.add(m); }
      }
    };
    bake(this.static);
    // Originals are no longer referenced after baking; do not retain two copies.
    this.resources.geometry.forEach(g => g.dispose()); this.resources.geometry.clear();
    this.group.traverse(o => { if (o instanceof T.Mesh) this.resources.geometry.add(o.geometry); });
    this.group.userData.design = { ...this.design, artifacts: [...this.semantic] };
    return {
      group: this.group, kind: this.design.kind,
      update: (time: number) => { if (!this.disposed) this.animations.forEach(animate => animate(time)); },
      dispose: () => {
        if (this.disposed) return; this.disposed = true;
        this.resources.geometry.forEach(g => g.dispose()); this.resources.material.forEach(m => m.dispose()); this.resources.texture.forEach(t => t.dispose());
        this.group.clear(); this.resources.geometry.clear(); this.resources.material.clear(); this.resources.texture.clear(); this.animations.length = 0;
      },
    };
  }
}
