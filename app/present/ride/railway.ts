import * as T from "three";
import type { LandscapeLayout, LandscapePath } from "./landscape-layout.ts";
import { ModelBuilder } from "./landscape-models.ts";

const v = (p: { x: number; y: number; z: number }) => new T.Vector3(p.x, p.y, p.z);

/** Structural geometry shares the exact ride path and actual terrain footings. */
export function createRailway(path: LandscapePath, land: LandscapeLayout) {
  const group = new T.Group(); group.name = "engineered-railway";
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  const own = <G extends T.BufferGeometry>(g: G) => { geometries.add(g); return g; };
  const mat = (parameters: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(parameters); materials.add(m); return m; };
  const steel = mat({ color: 0xcdd7cf, roughness: .24, metalness: .8 });
  const frameMat = mat({ color: 0x34554c, roughness: .5, metalness: .65 });
  const detailMat = mat({ vertexColors: true, roughness: .68, metalness: .18 });
  const chunks: { u: number; group: T.Group }[] = [];
  const axis = new T.Vector3(0, 1, 0), dummy = new T.Object3D();
  const beamGeometry = own(new T.CylinderGeometry(1, 1, 1, 8));
  const blockGeometry = own(new T.BoxGeometry(1, 1, 1));
  const concrete = mat({ color: 0xb0afa0, roughness: .95 });
  const bronze = mat({ color: 0xb49861, metalness: .55, roughness: .4 });
  const cross = new ModelBuilder();
  cross.box([0, -.4, 0], [4.25, .32, .65], 0x42645a);
  for (const side of [-1, 1]) {
    cross.rod([side * 1.65, -.5, 0], [0, -2.6, 0], .115, 0x496c5e);
    cross.box([side * 1.65, -.2, 0], [.7, .16, .82], 0x9aab9b);
    for (const z of [-.28, .28]) cross.cone([side * 1.65, -.08, z], .075, .09, 0xd5cfb9, .075, 6);
  }
  const crossGeometry = own(cross.finish());
  class RailCurve extends T.Curve<T.Vector3> {
    start: number; end: number; offset: number; lift: number;
    constructor(start: number, end: number, offset: number, lift: number) { super(); this.start = start; this.end = end; this.offset = offset; this.lift = lift; }
    getPoint(t: number, target = new T.Vector3()) {
      const f = path.frame(path.uAtDistance(this.start + t * (this.end - this.start)));
      return target.copy(v(f.point)).addScaledVector(v(f.side), this.offset).addScaledVector(v(f.up), this.lift);
    }
  }
  const batch = (geometry: T.BufferGeometry, material: T.Material, matrices: T.Matrix4[], parent: T.Group) => {
    if (!matrices.length) return;
    const mesh = new T.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  };
  const block = (p: T.Vector3, scale: T.Vector3, rotation?: T.Quaternion) => {
    dummy.position.copy(p); dummy.scale.copy(scale); dummy.quaternion.copy(rotation ?? new T.Quaternion()); dummy.updateMatrix(); return dummy.matrix.clone();
  };
  const beam = (from: T.Vector3, to: T.Vector3, radius: number) => {
    const direction = to.clone().sub(from); return block(from.clone().add(to).multiplyScalar(.5), new T.Vector3(radius, direction.length(), radius), new T.Quaternion().setFromUnitVectors(axis, direction.normalize()));
  };
  for (let start = 0; start < path.totalDistance; start += 400) {
    const end = Math.min(path.totalDistance, start + 400), node = new T.Group(), segments = Math.ceil((end - start) / 2.2);
    group.add(node); chunks.push({ u: path.uAtDistance((start + end) / 2), group: node });
    for (const offset of [-1.65, 1.65]) {
      const mesh = new T.Mesh(own(new T.TubeGeometry(new RailCurve(start, end, offset, 0), segments, .23, 10, false)), steel); mesh.castShadow = true; node.add(mesh);
    }
    node.add(new T.Mesh(own(new T.TubeGeometry(new RailCurve(start, end, 0, -2.6), segments, .34, 8, false)), frameMat));
    const crosses: T.Matrix4[] = [], columns: T.Matrix4[] = [], braces: T.Matrix4[] = [], footings: T.Matrix4[] = [], collars: T.Matrix4[] = [];
    for (let d = Math.ceil(start / 3.6) * 3.6; d < end; d += 3.6) {
      const f = path.frame(path.uAtDistance(d));
      const rotation = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(v(f.side), v(f.up), v(f.tangent).negate()));
      crosses.push(block(v(f.point), new T.Vector3(1, 1, 1), rotation));
    }
    for (let d = Math.ceil(start / 28) * 28; d < end; d += 28) {
      const f = path.frame(path.uAtDistance(d)), p = v(f.point), side = v(f.side), top = p.y - 3.1;
      for (const s of [-1, 1]) {
        const at = p.clone().addScaledVector(side, s * 2.7), ground = land.height(at.x, at.z), height = Math.max(.8, top - ground);
        columns.push(block(new T.Vector3(at.x, ground + height / 2 - .4, at.z), new T.Vector3(1, height + .8, 1)));
        footings.push(block(new T.Vector3(at.x, ground - .65, at.z), new T.Vector3(3.3, 2.4, 3.3)));
        collars.push(block(new T.Vector3(at.x, top - .25, at.z), new T.Vector3(1.5, .4, 1.5)));
        braces.push(beam(new T.Vector3(at.x, ground + height * .4, at.z), p.clone().add(new T.Vector3(0, -2.8, 0)), .12));
      }
      braces.push(beam(p.clone().addScaledVector(side, -3.4).add(new T.Vector3(0, -3.05, 0)), p.clone().addScaledVector(side, 3.4).add(new T.Vector3(0, -3.05, 0)), .28));
    }
    batch(crossGeometry, detailMat, crosses, node); batch(blockGeometry, concrete, columns, node); batch(blockGeometry, concrete, footings, node);
    batch(beamGeometry, frameMat, braces, node); batch(blockGeometry, bronze, collars, node);
  }

  // River crossings have a substantial masonry arch, not a forest of sky pillars.
  for (const r of land.regions.filter(r => r.kind === "gorge")) {
    const f = path.frame(r.u), forward = new T.Vector3(f.tangent.x, 0, f.tangent.z).normalize(), side = v(f.side);
    const shape = new T.Shape(), width = 66;
    const upper = (x: number) => path.point(Math.max(0, Math.min(1, (r.x + forward.x * x) / path.length))).y - r.y - 3.5;
    shape.moveTo(-width, upper(-width));
    for (let x = -width; x <= width; x += 3) shape.lineTo(x, upper(x));
    for (let x = width; x >= -width; x -= 3) shape.lineTo(x, upper(x) - 5 - (x / width) ** 2 * 36);
    shape.closePath();
    const g = own(new T.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false, curveSegments: 32 })); g.translate(0, 0, -4);
    const bridge = new T.Mesh(g, concrete); bridge.position.copy(v(f.point)); bridge.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(forward, new T.Vector3(0, 1, 0), side)); bridge.castShadow = true; bridge.receiveShadow = true;
    group.add(bridge);
    // End abutments extend into the real river banks.
    const b = new ModelBuilder();
    for (const s of [-1, 1]) {
      const p = v(f.point).addScaledVector(forward, s * 65), ground = land.height(p.x, p.z), top = p.y + upper(s * 65);
      b.box([p.x, (ground + top) / 2 - 1, p.z], [9, Math.max(3, top - ground + 2), 10], 0xb0afa0, [0, -Math.atan2(forward.z, forward.x), 0]);
    }
    const abutments = new T.Mesh(own(b.finish()), detailMat); abutments.castShadow = true; group.add(abutments);
  }

  // Paving is partly buried in its terrace; steps reach the miniature's raised floor.
  for (const plot of land.plots) {
    const b = new ModelBuilder();
    b.box([0, -.18, 0], [44, .6, 39], 0xaaa994);
    for (let x = -21; x <= 21; x += 3) {
      for (const z of [-18, 18]) b.box([x, .16, z], [2.94, .2, 2.95], 0xc0bda4);
    }
    for (let step = 0; step < 5; step++) b.box([0, (step + 1) * .22, 19.7 - step * 1.25], [8.5, (step + 1) * .44, 1.4], step % 2 ? 0xb7b59d : 0xccc6aa);
    // Low planters leave the narrative models unobstructed.
    for (const x of [-19.5, 19.5]) {
      b.box([x, .75, 15], [2.3, 1.5, 3.5], 0x8a9180);
      for (let z = -1; z <= 1; z++) { b.ball([x, 1.6, 15 + z], [1, .75, .75], 0x63804c); b.ball([x + .2, 2.15, 15 + z], [.27, .17, .27], 0xd1b99b, 0); }
    }
    const mesh = new T.Mesh(own(b.finish()), detailMat);
    mesh.position.set(plot.x, plot.y, plot.z);
    mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(plot.sideX, 0, plot.sideZ), new T.Vector3(0, 1, 0), new T.Vector3(-plot.forwardX, 0, -plot.forwardZ)));
    mesh.receiveShadow = true; mesh.castShadow = true; group.add(mesh);
  }
  let disposed = false;
  return {
    group,
    update(u: number, overview: boolean) { for (const chunk of chunks) chunk.group.visible = Math.abs(chunk.u - u) * path.length < (overview ? 6500 : 3100); },
    dispose() {
      if (disposed) return; disposed = true;
      group.traverse(o => { if (o instanceof T.InstancedMesh) o.dispose(); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.clear();
    },
  };
}
