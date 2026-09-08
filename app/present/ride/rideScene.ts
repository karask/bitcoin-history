import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import type { PresentationEvent } from "@/lib/event-schema";
import { sampleTrack, type Track } from "@/lib/track";
import { advanceRide, createRidePath, type RideTelemetry, type RideView, type V3 } from "@/lib/ride-path";
import { createRideCameraMotion, EXHIBIT_TRANSITION_SECONDS } from "@/lib/ride-camera";
import { categoryColors } from "@/lib/palette";
import { buildExhibit, type Exhibit } from "./exhibits";

export type RideScene = {
  draw: (time: number) => void;
  setStation: (index: number, teleport?: boolean) => void;
  setComfort: (value: boolean) => void;
  setPlayback: (playing: boolean, speed: number) => void;
  setView: (view: RideView) => void;
  orbit: (dx: number, dy: number) => void;
  zoom: (delta: number) => void;
  resize: () => void;
  dispose: () => void;
  frameTime: () => number;
  lowerQuality: () => boolean;
  telemetry: () => RideTelemetry;
  hasArrived: () => boolean;
  debug: () => { distance: number; targetDistance: number; camera: number[]; rotation: number[]; seat: number[]; transitioning: boolean };
};

export function createRideScene(canvas: HTMLCanvasElement, track: Track, events: PresentationEvent[], options: {
  onArrive: () => void; comfort: boolean; reducedMotion: boolean; quality: number;
}): RideScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = options.quality > 0.7;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x172c3e);
  scene.fog = new THREE.FogExp2(0x284250, 0.00026);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.15, 24000);
  scene.add(new THREE.HemisphereLight(0xd0edff, 0x4b4751, 1.7));
  const sun = new THREE.DirectionalLight(0xffdab1, 2.7);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 10, far: 240 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const headlight = new THREE.PointLight(0xffd89e, 40, 110, 1.3); scene.add(headlight);
  const path = createRidePath(track, sampleTrack);
  const sky = new Sky(); sky.scale.setScalar(22000); sky.position.x = path.length / 2;
  sky.material.uniforms.turbidity.value = 5;
  sky.material.uniforms.rayleigh.value = 2.5;
  sky.material.uniforms.sunPosition.value.set(-180000, 42000, 140000);
  scene.add(sky);
  const v = (p: V3) => new THREE.Vector3(p.x, p.y, p.z);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const material = (color: number, metalness = 0, roughness = 0.7, emissive = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: color, emissiveIntensity: emissive }); materials.add(m); return m;
  };
  const steel = material(0xe6e7dc, 0.7, 0.24), beam = material(0x344953, 0.6), ties = material(0x70848a, 0.6);
  const amber = material(0xffa536, 0.5, 0.3, 0.8), concrete = material(0x7f898b);
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = scene) => {
    geometries.add(geometry); const object = new THREE.Mesh(geometry, mat); parent.add(object); return object;
  };

  // Chronological u is the ONLY world position parameter. Arc distance is converted
  // explicitly for movement, never accidentally passed as a date to Three's *At API.
  class RailCurve extends THREE.Curve<THREE.Vector3> {
    offset: number; lift: number;
    constructor(offset = 0, lift = 0) { super(); this.offset = offset; this.lift = lift; this.arcLengthDivisions = 6000; }
    getPoint(u: number, target = new THREE.Vector3()) {
      const f = path.frame(u);
      return target.copy(v(f.point)).addScaledVector(v(f.side), this.offset).addScaledVector(v(f.up), this.lift);
    }
  }
  const segments = Math.min(6200, Math.ceil(path.totalDistance / 2.8));
  for (const side of [-1.65, 1.65]) {
    mesh(new THREE.TubeGeometry(new RailCurve(side), segments, 0.24, 6, false), steel);
    mesh(new THREE.TubeGeometry(new RailCurve(side, -0.55), segments, 0.085, 4, false), amber);
  }
  mesh(new THREE.TubeGeometry(new RailCurve(0, -1.8), segments, 0.5, 5, false), beam);
  function instances(geometry: THREE.BufferGeometry, mat: THREE.Material, count: number, place: (dummy: THREE.Object3D, i: number) => void) {
    geometries.add(geometry); const object = new THREE.InstancedMesh(geometry, mat, count); const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); place(dummy, i); dummy.updateMatrix(); object.setMatrixAt(i, dummy.matrix); }
    object.instanceMatrix.needsUpdate = true; object.computeBoundingSphere(); scene.add(object); return object;
  }
  const sleeperCount = Math.ceil(path.totalDistance / 3.6);
  instances(new THREE.BoxGeometry(4.6, 0.24, 0.48), ties, sleeperCount, (dummy, i) => {
    const f = path.frame(path.uAtDistance(i / (sleeperCount - 1) * path.totalDistance));
    dummy.position.copy(v(f.point)).addScaledVector(v(f.up), -0.4);
    dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(f.side), v(f.up), v(f.tangent).negate()));
  });
  const supports = Math.ceil(path.totalDistance / 45);
  instances(new THREE.CylinderGeometry(0.65, 0.9, 1, 6), beam, supports * 2, (dummy, i) => {
    const f = path.frame(path.uAtDistance(Math.floor(i / 2) / (supports - 1) * path.totalDistance));
    const top = v(f.point).addScaledVector(v(f.side), i % 2 ? 2.8 : -2.8);
    dummy.position.set(top.x, (top.y - 24) / 2, top.z); dummy.scale.y = top.y + 20;
  });
  instances(new THREE.BoxGeometry(7, 1, 6), concrete, supports, (dummy, i) => {
    const p = path.point(path.uAtDistance(i / (supports - 1) * path.totalDistance)); dummy.position.set(p.x, -22, p.z);
  });

  // Terrain and pillars make altitude tangible, even when prices are many decades apart.
  const ground = mesh(new THREE.PlaneGeometry(path.length * 3, 14000), material(0x263f42));
  ground.rotation.x = -Math.PI / 2; ground.position.set(path.length / 2, -23, 0);
  const terrainGeometry = new THREE.PlaneGeometry(path.length * 2.5, 10000, 128, 64).rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.getAttribute("position");
  for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i), z = terrainPositions.getZ(i);
    const fade = THREE.MathUtils.smoothstep(Math.abs(z), 350, 1100);
    const ridge = Math.max(0, Math.sin(x * 0.0013 + z * 0.0018) + 0.45 * Math.sin(x * 0.004 - z * 0.003) + 0.3);
    terrainPositions.setY(i, -25 + fade * (90 + ridge ** 1.5 * 350));
  }
  terrainGeometry.computeVertexNormals();
  const terrainMat = material(0x405e66, 0, 0.95); terrainMat.flatShading = true;
  mesh(terrainGeometry, terrainMat).position.x = path.length / 2;
  const grid = new THREE.GridHelper(path.length * 2, 100, 0x48656b, 0x344e53); grid.position.set(path.length / 2, -22.5, 0); scene.add(grid);

  // The front-seat nose and safety bar give the rider a fixed physical reference.
  const cart = new THREE.Group(); camera.add(cart); scene.add(camera);
  const cartBody = mesh(new THREE.BoxGeometry(2.9, 0.52, 1.5), material(0x14313a, 0.7, 0.28), cart); cartBody.position.set(0, -1.7, -2.1);
  const bar = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 16), steel, cart); bar.rotation.z = Math.PI / 2; bar.position.set(0, -1.08, -1.7);
  for (const side of [-1.15, 1.15]) { const arm = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), steel, cart); arm.position.set(side, -1.4, -1.7); }
  const trim = mesh(new THREE.BoxGeometry(2.91, 0.06, 0.1), amber, cart); trim.position.set(0, -1.46, -1.32);

  const resident = new Map<number, Exhibit>();
  const exhibitTransform = (index: number) => {
    const f = path.frame(track.stations[index].u);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize(), side = v(f.side);
    const origin = v(f.point).addScaledVector(side, 31).addScaledVector(forward, 18).add(new THREE.Vector3(0, -3.5, 0));
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, new THREE.Vector3(0, 1, 0), forward.clone().negate()));
    return { origin, rotation, side, forward };
  };
  const ensureExhibits = (index: number) => {
    const wanted = new Set([index - 1, index, index + 1].filter(i => i >= 0 && i < events.length));
    for (const [i, exhibit] of resident) if (!wanted.has(i)) { scene.remove(exhibit.group); exhibit.dispose(); resident.delete(i); }
    for (const i of wanted) {
      if (resident.has(i)) continue;
      const exhibit = buildExhibit(events[i], new THREE.Color(categoryColors[events[i].category]).getHex());
      const transform = exhibitTransform(i); exhibit.group.position.copy(transform.origin); exhibit.group.quaternion.copy(transform.rotation);
      scene.add(exhibit.group); resident.set(i, exhibit);
    }
  };

  let currentIndex = 0, cameraU = track.stations[0]?.u ?? 0;
  let distance = path.distanceAt(cameraU), targetDistance = distance, velocity = 0;
  let arrived = true, playing = false, paused = false, speed = 1, comfort = options.comfort;
  let departureHold = 0, lastAcceleration = 0;
  let view: RideView = "exhibit", previousTime = 0, elapsed = 0, frameMean = 16, quality = options.quality;
  let orbitYaw = -0.35, orbitPitch = 0.25, orbitRadius = 55, roll = 0, ready = false, residentIndex = -1;
  const desiredPosition = new THREE.Vector3(), desiredLook = new THREE.Vector3();
  const aim = new THREE.Object3D(), cameraMotion = createRideCameraMotion(camera);
  const telemetry = (): RideTelemetry => {
    const p = sampleTrack(track, cameraU);
    return { u: cameraU, date: arrived ? events[currentIndex].date : p.date, priceUsd: p.priceUsd, grade: path.frame(cameraU).tangent.y, velocity: paused ? 0 : velocity, arrived,
      phase: paused ? "paused" : departureHold > 0 || lastAcceleration > 1 ? "departing" : lastAcceleration < -1 ? "braking" : "riding" };
  };
  const resize = () => {
    const bounds = canvas.getBoundingClientRect(); const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality > 0.7 ? 1.5 : quality > 0.4 ? 0.8 : 0.6));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  };
  resize();
  const draw = (time: number) => {
    const rawDelta = previousTime ? time - previousTime : 16; previousTime = time;
    // Cap a tab-resume gap, but never exclude sustained sub-5-FPS frames.
    frameMean = frameMean * 0.97 + Math.min(rawDelta, 500) * 0.03;
    const dt = Math.min(rawDelta / 1000, 0.06); if (!paused && !options.reducedMotion) elapsed += dt;
    if (!paused) departureHold = Math.max(0, departureHold - dt);
    if (!arrived && departureHold === 0) {
      const previousVelocity = velocity;
      const result = advanceRide(distance, targetDistance, velocity, dt, path.frame(cameraU).tangent.y, speed, paused, path.speedLimitAt(distance));
      distance = result.distance; velocity = result.velocity; cameraU = path.uAtDistance(distance);
      lastAcceleration = dt > 0 ? (velocity - previousVelocity) / dt : 0;
      if (Math.abs(distance - targetDistance) < 0.08) {
        distance = targetDistance; cameraU = track.stations[currentIndex].u; velocity = 0; arrived = true; options.onArrive();
      }
    }
    const nearest = track.stations.reduce((best, station, i) => Math.abs(station.u - cameraU) < Math.abs(track.stations[best].u - cameraU) ? i : best, 0);
    if (nearest !== residentIndex) {
      ensureExhibits(nearest); residentIndex = nearest;
      const origin = exhibitTransform(nearest).origin;
      sun.target.position.copy(origin); sun.position.copy(origin).add(new THREE.Vector3(-55, 100, 80));
    }
    for (const [i, exhibit] of resident) {
      exhibit.group.visible = Math.abs(path.distanceAt(track.stations[i].u) - distance) < 900;
      if (exhibit.group.visible) exhibit.update(elapsed);
    }
    const f = path.frame(cameraU), position = v(f.point), tangent = v(f.tangent), up = v(f.up);
    const activeView = view === "exhibit" && !arrived ? "seat" : view;
    if (activeView === "overview") {
      const extent = Math.min(path.length, 2800);
      desiredPosition.set(position.x - extent * 0.38, position.y + extent * 0.6, position.z + extent * 0.85);
      desiredLook.set(Math.min(path.length, position.x + extent * 0.16), position.y - 120, position.z);
    } else if (activeView === "exhibit") {
      const transform = exhibitTransform(currentIndex), focus = transform.origin.clone().add(new THREE.Vector3(0, 10, 0));
      const r = orbitRadius * (camera.aspect < 1 ? 1.45 : 1);
      desiredPosition.copy(focus).addScaledVector(transform.side, Math.sin(orbitYaw) * r * Math.cos(orbitPitch))
        .addScaledVector(transform.forward, -Math.cos(orbitYaw) * r * Math.cos(orbitPitch)).add(new THREE.Vector3(0, Math.sin(orbitPitch) * r, 0));
      desiredLook.copy(focus);
      if (camera.aspect > 1.3) desiredLook.addScaledVector(transform.side, -5);
    } else {
      // Stable vertical seat clearance: the old surface-normal offset jumped
      // sideways/vertically when a compressed price curve changed pitch sharply.
      desiredPosition.copy(position).add(new THREE.Vector3(0, 2.9, 0));
      const aheadU = path.uAtDistance(Math.min(path.totalDistance, distance + (comfort ? 48 : 24)));
      desiredLook.copy(v(path.point(aheadU))).addScaledVector(up, 2.1);
      if (distance >= path.totalDistance - 24) desiredLook.copy(position).addScaledVector(tangent, 35).addScaledVector(up, 2.1);
    }
    aim.position.copy(desiredPosition); aim.up.set(0, 1, 0);
    // Cameras look down local -Z (Object3D.lookAt uses +Z).
    aim.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(desiredPosition, desiredLook, aim.up));
    const nextTangent = path.frame(Math.min(1, cameraU + 0.002)).tangent;
    const bank = comfort || activeView !== "seat" || arrived ? 0 : THREE.MathUtils.clamp((nextTangent.z - f.tangent.z) * velocity * 0.09, -0.13, 0.13);
    roll += (bank - roll) * (1 - Math.exp(-dt * 4)); aim.rotateZ(roll);
    const fov = activeView === "exhibit" ? 49 : activeView === "overview" ? 58 : 65 + (comfort ? 0 : Math.min(10, velocity * 0.05));
    cameraMotion.update(desiredPosition, aim.quaternion, fov, activeView, dt);
    camera.updateProjectionMatrix();
    cart.visible = activeView === "seat" && !cameraMotion.isTransitioning();
    headlight.position.copy(position).addScaledVector(tangent, 12).addScaledVector(up, 6);
    if (!ready && arrived) options.onArrive();
    ready = true; renderer.render(scene, camera);
  };
  return {
    draw, resize, telemetry, hasArrived: () => arrived, frameTime: () => frameMean,
    debug: () => ({ distance, targetDistance, camera: camera.position.toArray(), rotation: camera.quaternion.toArray(),
      seat: v(path.point(cameraU)).add(new THREE.Vector3(0, 2.9, 0)).toArray(), transitioning: cameraMotion.isTransitioning() }),
    setStation: (index, teleport = false) => {
      const next = THREE.MathUtils.clamp(index, 0, events.length - 1);
      if (next === currentIndex && !teleport) return;
      departureHold = arrived && view === "exhibit" ? EXHIBIT_TRANSITION_SECONDS + 0.1 : 0;
      if (arrived) velocity = 0;
      currentIndex = next; targetDistance = path.distanceAt(track.stations[next].u); arrived = false; paused = false;
      orbitYaw = -0.35; orbitPitch = 0.25; orbitRadius = 55;
      // Initial deep links position the train directly, subsequent navigation rides there.
      if (!ready || teleport) {
        distance = targetDistance; cameraU = track.stations[next].u;
        velocity = 0; departureHold = 0; lastAcceleration = 0; roll = 0;
        cameraMotion.reset();
      }
      if (Math.abs(targetDistance - distance) < 0.08) { arrived = true; options.onArrive(); }
    },
    setPlayback: (value, multiplier) => { if (playing !== value) paused = !value; playing = value; speed = multiplier; },
    setComfort: value => { comfort = value; },
    setView: value => { view = value; },
    orbit: (dx, dy) => { orbitYaw = THREE.MathUtils.clamp(orbitYaw - dx * 0.007, -1.3, 1.3); orbitPitch = THREE.MathUtils.clamp(orbitPitch + dy * 0.005, 0.03, 0.95); },
    zoom: delta => { orbitRadius = THREE.MathUtils.clamp(orbitRadius + delta * 0.04, 28, 95); },
    lowerQuality: () => { if (quality <= 0.35) return false; quality = quality > 0.55 ? 0.55 : 0.35; renderer.shadowMap.enabled = false; resize(); return true; },
    dispose: () => {
      for (const exhibit of resident.values()) exhibit.dispose(); resident.clear();
      scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); scene.clear(); renderer.dispose();
      sky.geometry.dispose(); sky.material.dispose(); sun.shadow.map?.dispose();
    },
  };
}
