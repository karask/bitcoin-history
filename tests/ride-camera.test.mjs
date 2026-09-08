import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { cameraEase, createRideCameraMotion, EXHIBIT_TRANSITION_SECONDS } from "../lib/ride-camera.ts";

test("timeline teleport cancels an in-flight camera transfer and snaps to the selected event", () => {
  const camera = new THREE.PerspectiveCamera(), rig = createRideCameraMotion(camera);
  const rotation = new THREE.Quaternion();
  rig.update(new THREE.Vector3(), rotation, 49, "exhibit", 1 / 60);
  rig.update(new THREE.Vector3(20, 3, 0), rotation, 65, "seat", 1 / 60);
  assert.equal(rig.isTransitioning(), true);
  rig.reset();
  const destination = new THREE.Vector3(5000, 400, 200);
  rig.update(destination, rotation, 49, "exhibit", 1 / 60);
  assert.equal(camera.position.distanceTo(destination), 0);
  assert.equal(camera.fov, 49);
  assert.equal(rig.isTransitioning(), false);
  rig.update(destination.clone().addScalar(10), rotation, 65, "seat", 1 / 60);
  assert.equal(rig.isTransitioning(), true, "normal departure easing resumes after a teleport");
});

test("camera transfers ease out of and into stops, without an initial lurch", () => {
  assert.equal(cameraEase(0), 0); assert.equal(cameraEase(1), 1);
  const camera = new THREE.PerspectiveCamera(), rig = createRideCameraMotion(camera);
  const rotation = new THREE.Quaternion(), origin = new THREE.Vector3(0, 30, 0), seat = new THREE.Vector3(60, 3, 20);
  rig.update(origin, rotation, 49, "exhibit", 1 / 60);
  const steps = [], frames = Math.ceil(EXHIBIT_TRANSITION_SECONDS * 60);
  for (let i = 0; i <= frames; i++) {
    const before = camera.position.clone();
    rig.update(seat, rotation, 65, "seat", 1 / 60);
    steps.push(camera.position.distanceTo(before));
  }
  assert.ok(steps[0] < 0.001, "departure used to cover a large fraction of the transfer in one frame");
  assert.ok(Math.max(...steps) < 1, "no fast camera jump to the rail");
  assert.ok(steps.at(-1) < 0.001);
  assert.ok(camera.position.distanceTo(seat) < 1e-9);
  assert.equal(rig.isTransitioning(), false);
});

test("front-seat position stays on the rail across a crest, independent of frame rate", () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.06]) {
    const camera = new THREE.PerspectiveCamera(), rig = createRideCameraMotion(camera), rotation = new THREE.Quaternion();
    for (let x = 0; x < 120; x++) {
      const position = new THREE.Vector3(x, 3 + 40 * Math.sin(x / 30), 10 * Math.sin(x / 40));
      rig.update(position, rotation, 65, "seat", dt);
      assert.ok(camera.position.distanceTo(position) < 1e-9, "camera must not lag behind then cut through a hill");
    }
  }
});

test("sharp pitch changes cannot snap the camera orientation", () => {
  const camera = new THREE.PerspectiveCamera(), rig = createRideCameraMotion(camera), position = new THREE.Vector3();
  rig.update(position, new THREE.Quaternion(), 65, "seat", 1 / 60);
  const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.7);
  for (let i = 0; i < 240; i++) {
    const before = camera.quaternion.clone();
    rig.update(position, target, 65, "seat", 1 / 60);
    assert.ok(before.angleTo(camera.quaternion) <= 0.9 / 60 + 1e-8);
  }
  assert.ok(camera.quaternion.angleTo(target) < 0.001);
});

test("changing view again during a transfer preserves the current camera position", () => {
  const camera = new THREE.PerspectiveCamera(), rig = createRideCameraMotion(camera), rotation = new THREE.Quaternion();
  rig.update(new THREE.Vector3(), rotation, 65, "seat", 1 / 60);
  for (let i = 0; i < 30; i++) rig.update(new THREE.Vector3(60, 30, 20), rotation, 49, "exhibit", 1 / 60);
  const before = camera.position.clone();
  rig.update(new THREE.Vector3(2, 3, 0), rotation, 65, "seat", 1 / 60);
  assert.ok(camera.position.distanceTo(before) < 0.001);
});
