import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildExhibit, type Exhibit } from "../../app/present/ride/exhibits.ts";
import { exhibitDesign } from "../../app/present/ride/exhibit-design.ts";
import type { PresentationEvent } from "../../lib/event-schema";
import early from "../../content/events-early.json";
import late from "../../content/events-late.json";
import prehistory from "../../content/events-prehistory.json";

const all = [...prehistory, ...early, ...late].sort((a, b) => a.date.localeCompare(b.date)) as PresentationEvent[];
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const select = $<HTMLSelectElement>("event"), family = $<HTMLSelectElement>("kind"), search = $<HTMLInputElement>("search");
const canvas = $<HTMLCanvasElement>("scene");
const rideUrl = new URL(location.href); rideUrl.port = "4173"; rideUrl.pathname = "/present"; rideUrl.search = "";
document.querySelector<HTMLAnchorElement>("header a")!.href = rideUrl.href;
const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new T.Scene(); scene.background = new T.Color(0x1b292a);
const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture; scene.environmentIntensity = .35; room.dispose(); pmrem.dispose();
scene.add(new T.HemisphereLight(0xcadce1, 0x534833, 1.1));
const key = new T.DirectionalLight(0xffe4c3, 2.7); key.position.set(-18, 35, 26); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 }); key.shadow.bias = -.00015; key.shadow.normalBias = .04; scene.add(key);
const rim = new T.DirectionalLight(0xa7ccdf, 1.1); rim.position.set(20, 23, -12); scene.add(rim);
const fill = new T.DirectionalLight(0xffe0b0, .55); fill.position.set(0, 12, 25); scene.add(fill);
const floor = new T.Mesh(new T.PlaneGeometry(2000, 2000), new T.MeshStandardMaterial({ color: 0x111e20, roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.05; floor.receiveShadow = true; scene.add(floor);
const camera = new T.PerspectiveCamera(38, 1, .1, 1000);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 8, 0); controls.enableDamping = true; controls.minDistance = 18; controls.maxDistance = 100; controls.maxPolarAngle = Math.PI / 2 - .02; controls.autoRotateSpeed = .65;
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const ao = new SSAOPass(scene, camera, 640, 480, 16); ao.kernelRadius = 1.35; ao.minDistance = .002; ao.maxDistance = .09; composer.addPass(ao); composer.addPass(new OutputPass());
let current: Exhibit | undefined, selected = new URLSearchParams(location.search).get("event") ?? "bitcoin-pizza-purchase", filtered = all;
function cameraView(name: string) {
  const distance = camera.aspect < 1 ? 1.3 : 1;
  camera.position.set(...(name === "front" ? [0, 23, 61] : name === "detail" ? [22, 25, 36] : [36, 30, 55]) as [number, number, number]).multiplyScalar(distance);
  controls.target.set(0, 8, 0); controls.update();
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
}
function show(slug: string) {
  const event = all.find(e => e.slug === slug); if (!event) return;
  selected = slug; select.value = slug;
  if (current) { scene.remove(current.group); current.dispose(); }
  const started = performance.now(); current = buildExhibit(event, 0xd5b675); scene.add(current.group);
  const design = exhibitDesign(event);
  $("title").textContent = event.title; $("date").textContent = event.date; $("summary").textContent = event.summary;
  $("family").textContent = `${design.kind.toUpperCase()} / ${design.state.toUpperCase()}`;
  $("recipe").textContent = `${design.motif.replaceAll("-", " ")} · ${design.state.replaceAll("-", " ")}`;
  $("objects").textContent = current.group.userData.design.artifacts.map((s: string) => s.replaceAll("-", " ")).join(" · ");
  const index = filtered.indexOf(event);
  $("count").textContent = `${String(index + 1).padStart(3, "0")} / ${filtered.length} STATIONS`;
  $<HTMLButtonElement>("previous").disabled = index <= 0; $<HTMLButtonElement>("next").disabled = index >= filtered.length - 1;
  let meshes = 0, vertices = 0; current.group.traverse(o => { if (o instanceof T.Mesh) { meshes++; vertices += o.geometry.attributes.position.count; } });
  $("stats").textContent = `${meshes} MESHES · ${Math.round(vertices / 1000)}K VERTICES · ${Math.round(performance.now() - started)}MS BUILD`;
  history.replaceState(null, "", `?event=${encodeURIComponent(slug)}`);
}
function filter() {
  const query = search.value.toLocaleLowerCase();
  filtered = all.filter(e => (!family.value || exhibitDesign(e).kind === family.value) && `${e.title} ${e.slug} ${e.date} ${e.actors.join(" ")}`.toLocaleLowerCase().includes(query));
  select.replaceChildren(...filtered.map(e => new Option(`${e.date} · ${e.title}`, e.slug)));
  select.disabled = filtered.length === 0;
  if (filtered.length) show(filtered.some(e => e.slug === selected) ? selected : filtered[0].slug);
  else { $("count").textContent = "NO MATCHING EVENTS"; $<HTMLButtonElement>("previous").disabled = true; $<HTMLButtonElement>("next").disabled = true; }
}
for (const kind of [...new Set(all.map(e => exhibitDesign(e).kind))].sort()) family.add(new Option(kind[0].toUpperCase() + kind.slice(1), kind));
search.addEventListener("input", filter); family.addEventListener("change", filter); select.addEventListener("change", () => show(select.value));
for (const [id, delta] of [["previous", -1], ["next", 1]] as const) $(id).addEventListener("click", () => { const e = filtered[filtered.findIndex(e => e.slug === selected) + delta]; if (e) show(e.slug); });
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.addEventListener("click", () => cameraView(b.dataset.view!)));
$("rotate").addEventListener("click", () => { controls.autoRotate = !controls.autoRotate; $("rotate").setAttribute("aria-pressed", String(controls.autoRotate)); $("rotate").classList.toggle("active", controls.autoRotate); });
const resize = () => { const { width, height } = canvas.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); composer.setSize(width, height); };
const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); filter(); cameraView("wide");
renderer.setAnimationLoop(time => { controls.update(); current?.update(time / 1000); composer.render(); });
window.addEventListener("pagehide", () => { observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); current?.dispose(); composer.dispose(); ao.dispose(); environment.dispose(); floor.geometry.dispose(); floor.material.dispose(); key.shadow.map?.dispose(); renderer.dispose(); });
