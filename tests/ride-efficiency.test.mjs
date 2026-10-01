import assert from "node:assert/strict";
import test from "node:test";
import * as T from "three";
import { createInstanceCuller, freezeStaticTransforms } from "../app/present/ride/instance-culling.ts";
import { createRenderDemand } from "../app/present/ride/render-demand.ts";

const frustum = camera => {
  camera.updateMatrixWorld();
  return new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
};
const view = (x = 0, z = 0, targetX = 0, targetZ = -10) => {
  const camera = new T.PerspectiveCamera(60, 1, .1, 100);
  camera.position.set(x, 0, z); camera.lookAt(targetX, 0, targetZ); return frustum(camera);
};
const fixture = () => {
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial(), 4);
  [[0, -10], [0, 10], [20, -10], [40, -10]].forEach(([x, z], i) => {
    mesh.setMatrixAt(i, new T.Matrix4().makeTranslation(x, 0, z));
    mesh.setColorAt(i, new T.Color().setRGB(i / 4, 1 - i / 4, .5));
  });
  mesh.castShadow = true;
  const parent = new T.Group(); parent.add(mesh);
  const matrices = mesh.instanceMatrix.array.slice(), colors = mesh.instanceColor.array.slice();
  const culler = createInstanceCuller([{ mesh }]);
  const expect = ids => {
    assert.equal(mesh.count, ids.length);
    ids.forEach((id, slot) => {
      assert.deepEqual(mesh.instanceMatrix.array.slice(slot * 16, slot * 16 + 16), matrices.slice(id * 16, id * 16 + 16));
      assert.deepEqual(mesh.instanceColor.array.slice(slot * 3, slot * 3 + 3), colors.slice(id * 3, id * 3 + 3));
    });
  };
  const dispose = () => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); };
  return { mesh, parent, culler, expect, dispose };
};

test("per-instance culling preserves off-camera shadow casters and restores exact transforms/tints after teleport", () => {
  const f = fixture();
  f.culler.update(view(), view(20, 0, 20, -10)); f.expect([0, 2]);
  f.mesh.castShadow = false;
  f.culler.update(view(), view(20, 0, 20, -10)); f.expect([0]);
  f.culler.update(view(40, 0, 40, -10)); f.expect([3]);
  f.culler.update(view(0, 0, 0, 10)); f.expect([1]);
  f.culler.update(view(90, 0, 90, -10)); f.expect([]);
  f.mesh.castShadow = true;
  f.culler.update(view(), view(20, 0, 20, -10)); f.expect([0, 2]);
  const version = f.mesh.instanceMatrix.version, colorVersion = f.mesh.instanceColor.version;
  f.culler.update(view(), view(20, 0, 20, -10)); f.expect([0, 2]);
  assert.equal(f.mesh.instanceMatrix.version, version, "unchanged visibility must not upload matrices again");
  assert.equal(f.mesh.instanceColor.version, colorVersion);
  f.parent.visible = false; f.culler.update(view(40, 0, 40, -10));
  f.parent.visible = true; f.culler.update(view(40, 0, 40, -10)); f.expect([3]);
  f.dispose();
});

test("culling bounds include larger alternate LOD and breeze at a camera edge", () => {
  const mesh = new T.InstancedMesh(new T.BoxGeometry(.1, .1, .1), new T.MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new T.Matrix4().makeTranslation(6.1, 0, -10));
  const bounds = new T.Sphere(new T.Vector3(), 1);
  const culler = createInstanceCuller([{ mesh, bounds }]);
  culler.update(view());
  assert.equal(mesh.count, 1, "the tiny base mesh is outside but its expanded foliage bounds overlap");
  assert.ok(view().intersectsObject(mesh), "Three's batch-level culling must use the expanded bounds too");
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
});

test("all camera/shadow-intersecting instances survive repeated viewpoint changes", () => {
  const mesh = new T.InstancedMesh(new T.SphereGeometry(1, 6, 4), new T.MeshBasicMaterial(), 200);
  mesh.castShadow = true;
  const original = [], colors = [], dummy = new T.Object3D();
  for (let i = 0; i < mesh.count; i++) {
    dummy.position.set(Math.sin(i * 17) * 60, Math.cos(i * 11) * 15, Math.cos(i * 7) * 60);
    dummy.scale.set(.5 + i % 3, 1 + i % 2, .8); dummy.rotation.y = i;
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); original.push(dummy.matrix.clone());
    const color = new T.Color().setRGB(i / 200, .5, 1); mesh.setColorAt(i, color); colors.push(color);
  }
  const bounds = new T.Sphere(new T.Vector3(), 1.2);
  const culler = createInstanceCuller([{ mesh, bounds }]);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, camera = view(Math.sin(a) * 40, Math.cos(a) * 40, 0, 0), shadow = view(30, 50, 0, 0);
    const expected = original.map((matrix, id) => ({ id, sphere: bounds.clone().applyMatrix4(matrix) }))
      .filter(({ sphere }) => camera.intersectsSphere(sphere) || shadow.intersectsSphere(sphere)).map(({ id }) => id);
    culler.update(camera, shadow); assert.equal(mesh.count, expected.length);
    expected.forEach((id, slot) => {
      const actual = new T.Matrix4(); mesh.getMatrixAt(slot, actual);
      for (let j = 0; j < 16; j++) assert.ok(Math.abs(actual.elements[j] - original[id].elements[j]) < 1e-5);
      assert.ok(Math.abs(mesh.instanceColor.getX(slot) - colors[id].r) < 1e-6);
    });
  }
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
});

test("static matrix freezing preserves placement and leaves animated descendants live", () => {
  const root = new T.Group(), fixed = new T.Group(), bird = new T.Group(), wing = new T.Object3D();
  root.position.x = 3; fixed.position.y = 7; bird.add(wing); root.add(fixed, bird);
  root.updateMatrixWorld(true); const before = fixed.matrixWorld.clone();
  freezeStaticTransforms(root, new Set([bird])); root.updateMatrixWorld(true);
  assert.deepEqual(fixed.matrixWorld.elements, before.elements);
  assert.equal(fixed.matrixAutoUpdate, false); assert.equal(root.matrixAutoUpdate, false);
  assert.equal(bird.matrixAutoUpdate, true); assert.equal(wing.matrixAutoUpdate, true);
  wing.position.z = 5; root.updateMatrixWorld(true);
  assert.equal(wing.matrixWorld.elements[14], 5);
});

test("idle frames stop, but animation, controls, resize and accumulated tiny movement still redraw", () => {
  const demand = createRenderDemand(), camera = new T.PerspectiveCamera();
  assert.equal(demand.needsFrame(camera, 0), true);
  for (let i = 0; i < 120; i++) assert.equal(demand.needsFrame(camera, 0), false);
  assert.equal(demand.needsFrame(camera, .016), true);
  camera.position.x = .1; assert.equal(demand.needsFrame(camera, .016), true);
  camera.rotateY(.01); assert.equal(demand.needsFrame(camera, .016), true);
  camera.fov += 1; assert.equal(demand.needsFrame(camera, .016), true);
  demand.invalidate(); assert.equal(demand.needsFrame(camera, .016), true);
  camera.position.x += .000006; assert.equal(demand.needsFrame(camera, .016), false);
  camera.position.x += .000006; assert.equal(demand.needsFrame(camera, .016), true);
});
