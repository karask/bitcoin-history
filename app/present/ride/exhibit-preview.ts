import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { PresentationEvent } from "@/lib/event-schema";
import { buildExhibit } from "./exhibits";

export type ExhibitPreview = { dispose: () => void };

/**
 * One exhibit on its own, lit and framed as the ride frames it at a stop, for the event
 * pages. No landscape or track: the miniature is the subject. Renders on demand — a
 * frame after building and after each drag — so an open page costs nothing while idle.
 */
export function mountExhibitPreview(canvas: HTMLCanvasElement, event: PresentationEvent, accent: number): ExhibitPreview {
  // Transparent, so the page's sky gradient shows behind the miniature.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // The ride's daylight: hemisphere, sun, fill and rim. The ground fades into the
  // horizon colour of the CSS sky behind the canvas.
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd3e3e3, 90, 300);
  scene.add(new THREE.HemisphereLight(0xe0f0ee, 0x777456, 1.2));
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture; scene.environmentIntensity = 0.35;
  room.dispose(); pmrem.dispose();
  const sun = new THREE.DirectionalLight(0xffe7ba, 2.2);
  sun.position.set(-90, 140, 100); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 360 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  const fill = new THREE.DirectionalLight(0xffe0b0, 0.65); fill.position.set(0, 12, 60);
  const rim = new THREE.DirectionalLight(0xa7ccdf, 0.8); rim.position.set(40, 30, -30);
  scene.add(sun, fill, rim);

  const groundGeometry = new THREE.CircleGeometry(420, 64);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6d8741, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.05; ground.receiveShadow = true;
  scene.add(ground);

  const exhibit = buildExhibit(event, accent);
  scene.add(exhibit.group);

  // The ride's exhibit angle (x is screen right, z is toward the rider), a little closer:
  // the ride leaves room for its panels, and this frame has none.
  const camera = new THREE.PerspectiveCamera(49, 1, 0.5, 2000);
  const focus = new THREE.Vector3(0, 7.5, 0);
  let yaw = -0.35, pitch = 0.25;
  const radius = () => 51 * (camera.aspect < 1 ? 1.4 : 1);
  const place = () => {
    const r = radius();
    camera.position.set(Math.sin(yaw) * r * Math.cos(pitch), focus.y + Math.sin(pitch) * r, Math.cos(yaw) * r * Math.cos(pitch));
    camera.lookAt(focus);
  };

  let frame = 0;
  const render = () => {
    if (frame) return;
    frame = requestAnimationFrame((time) => {
      frame = 0;
      exhibit.update(time / 1000);
      renderer.render(scene, camera);
    });
  };
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
    place(); render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // Drag to look around, within the same limits as the ride's exhibit view.
  let last: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (!last) return;
    yaw = THREE.MathUtils.clamp(yaw - (e.clientX - last.x) * 0.007, -1.3, 1.3);
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - last.y) * 0.005, 0.03, 0.95);
    last = { x: e.clientX, y: e.clientY };
    place(); render();
  };
  const up = () => { last = null; };
  const key = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] };
    const delta = moves[e.key];
    if (!delta) return;
    e.preventDefault();
    yaw = THREE.MathUtils.clamp(yaw + delta[0], -1.3, 1.3);
    pitch = THREE.MathUtils.clamp(pitch + delta[1], 0.03, 0.95);
    place(); render();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("keydown", key);

  return {
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", key);
      exhibit.dispose();
      groundGeometry.dispose(); groundMaterial.dispose();
      environment.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
