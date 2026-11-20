import * as T from "three";
import type { LandscapeLayout } from "./landscape-layout.ts";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x: number, z: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
const noise = (x: number, z: number, periodX = 0, periodZ = periodX) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const wrap = (a: number, period: number) => period ? (a % period + period) % period : a;
  const a = hash(wrap(ix, periodX), wrap(iz, periodZ)), b = hash(wrap(ix + 1, periodX), wrap(iz, periodZ));
  const c = hash(wrap(ix, periodX), wrap(iz + 1, periodZ)), d = hash(wrap(ix + 1, periodX), wrap(iz + 1, periodZ));
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
};
const texture = (pixels: Uint8Array, size: number) => {
  const t = new T.DataTexture(pixels, size, size);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = T.NoColorSpace;
  t.needsUpdate = true;
  return t;
};

function terrainTiles() {
  const size = 256, field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Sheared coordinates keep the fine marks diagonal and the tile seamless.
    const tuft = noise((x + y) / 8, y / 16, 32, 16);
    const stem = noise((x + y) / 2, y / 8, 128, 32);
    const grit = noise(x / 2, (y - x) / 4, 128, 64);
    field[y * size + x] = .14 + tuft * .38 + stem * .22 + smooth(.52, .83, grit) * .26;
  }
  const normals = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (field[y * size + (x + 1) % size] - field[y * size + (x + size - 1) % size]) * 2.4;
    const dy = (field[((y + 1) % size) * size + x] - field[((y + size - 1) % size) * size + x]) * 2.4;
    const inv = 1 / Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    normals[i] = (-dx * inv * .5 + .5) * 255;
    normals[i + 1] = (-dy * inv * .5 + .5) * 255;
    normals[i + 2] = (inv * .5 + .5) * 255;
    normals[i + 3] = Math.round(255 * (.44 + .48 * field[i / 4]));
  }
  return texture(normals, size);
}

function waterTile() {
  const size = 64, pixels = new Uint8Array(size * size * 4), tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * tau, v = y / size * tau;
    // Long broken wind lines, kept soft enough to avoid glitter in the distance.
    const wind = Math.cos(v * 4 + 1.2 * Math.sin(u) + .7 * Math.sin(u * 2 - v));
    const swell = Math.cos(u + v * 2 + .65 * Math.sin(u + v));
    const capillary = Math.cos(v * 9 - u * 2 + .7 * Math.sin(2 * u + v));
    const dx = wind * .12 + swell * .16 - capillary * .035;
    const dy = wind * .43 + swell * .14 + capillary * (.07 + .04 * swell);
    const inv = 1 / Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    pixels[i] = (-dx * inv * .5 + .5) * 255;
    pixels[i + 1] = (-dy * inv * .5 + .5) * 255;
    pixels[i + 2] = (inv * .5 + .5) * 255; pixels[i + 3] = 255;
  }
  return texture(pixels, size);
}

/** Shared material detail, with all terrain/depth coloring baked at construction.
 * Owns only its two textures; the landscape owns the supplied materials and
 * geometries. No additional meshes, lights, reflection passes or triangles.
 */
export function createLandscapeSurfaces(layout: LandscapeLayout, groundMat: T.MeshStandardMaterial, waterMat: T.MeshStandardMaterial) {
  const palette = {
    pasture: new T.Color(0x899747), forest: new T.Color(0x536c44), gorge: new T.Color(0x6b835d), alpine: new T.Color(0x729277),
    autumn: new T.Color(0xab864e), coast: new T.Color(0x95a173), wetland: new T.Color(0x63895c),
  };
  const granite = new T.Color(0xb3ac98), darkStone = new T.Color(0x485569);
  const straw = new T.Color(0xb8ab68), wetGrass = new T.Color(0x436b52), lichen = new T.Color(0x8a865e);
  const snow = new T.Color(0xf0f1e6), beach = new T.Color(0xdec494), shingle = new T.Color(0x9f987a);
  const shallow = new T.Color(0x60b9ac), deep = new T.Color(0x205c75), waterline = new T.Color(0x45a39c);
  const color = new T.Color(), other = new T.Color(), point = new T.Vector3();
  const terrain = terrainTiles(), waterNormal = waterTile();
  groundMat.map = terrain;
  groundMat.bumpMap = null;
  groundMat.normalMap = terrain; groundMat.normalScale.set(.48, .48);
  groundMat.roughness = 1;
  groundMat.onBeforeCompile = shader => {
    // Both maps share one UV transform. The alpha channel modulates ground
    // brightness while RGB supplies the tangent-space normal.
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      vec4 landscapeSurface = texture2D(map, vMapUv);
      diffuseColor.rgb *= landscapeSurface.a * vec3(0.98749, 1.01371, 0.90302);
    `).replace("#include <normal_fragment_maps>", `
      vec3 mapN = landscapeSurface.rgb * 2.0 - 1.0;
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
    `);
  };
  groundMat.customProgramCacheKey = () => "landscape-packed-terrain-v1";
  waterMat.color.set(0xffffff); waterMat.vertexColors = true;
  waterMat.normalMap = waterNormal; waterMat.normalScale.set(.59, .57);
  waterMat.roughness = .31; waterMat.metalness = .14; waterMat.opacity = .94;
  waterMat.onBeforeCompile = shader => {
    // A quiet sky tint at grazing angles; no reflection render target or pass.
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float landscapeFacing = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      float landscapeFresnel = landscapeFacing * landscapeFacing * landscapeFacing;
      outgoingLight = mix(outgoingLight, vec3(0.08, 0.30, 0.40), landscapeFresnel * 0.16);
      #include <opaque_fragment>
    `);
  };
  waterMat.customProgramCacheKey = () => "landscape-water-fresnel-v1";
  groundMat.needsUpdate = true; waterMat.needsUpdate = true;
  const bakedGround = new WeakSet<T.BufferGeometry>(), bakedWater = new WeakSet<T.BufferGeometry>();
  let lastTime = Number.NaN, disposed = false;
  return {
    apply(group: T.Group) {
      if (disposed) return;
      group.updateWorldMatrix(true, true);
      group.traverse(object => {
        if (!(object instanceof T.Mesh)) return;
        const ground = object.material === groundMat, water = object.material === waterMat;
        if (!ground && !water) return;
        const geo = object.geometry, positions = geo.getAttribute("position"), normals = geo.getAttribute("normal");
        if (ground && !bakedGround.has(geo)) {
          bakedGround.add(geo);
          const colors = new Float32Array(positions.count * 3);
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
            const r = layout.regionAt(x), next = layout.regions[Math.min(layout.regions.length - 1, r.index + 1)];
            const route = layout.route(x), elevation = y - route.y;
            const transition = smooth(r.x + layout.span * .18, r.x + layout.span * .5, x);
            color.copy(palette[r.kind]).lerp(other.copy(palette[next.kind]), transition);
            // Global-coordinate variation keeps adjoining chunk edges seamless.
            const broad = noise(x * .005, z * .006);
            const fold = noise(x * .014 + z * .006, z * .009 - x * .004);
            const detail = noise(x * .034 + 12, z * .026);
            const slope = 1 - Math.abs(normals.getY(i));
            // Moisture follows shallow swales. The dry patches stretch along the contours.
            const lowland = 1 - smooth(40, 135, elevation);
            const moisture = .65 * broad + .35 * fold;
            color.lerp(wetGrass, (1 - smooth(.28, .58, moisture)) * .73 * lowland);
            color.lerp(straw, smooth(.48, .76, moisture + (detail - .5) * .13) * .61 * lowland);
            // Downslope grain, shaded clefts, and warm granite faces read at mountain scale.
            const upward = elevation + (broad - .5) * 100;
            const bare = Math.max(smooth(.17, .48, slope), smooth(100, 290, upward));
            const seam = Math.abs(Math.sin(y * .031 + x * .012 - z * .009 + fold * 2.7));
            const aspect = clamp(.48 - normals.getX(i) * .42 + normals.getZ(i) * .36);
            other.copy(darkStone).lerp(granite, clamp(aspect * .72 + smooth(.20, .82, seam) * .31 + (fold - .5) * .32));
            other.lerp(lichen, (1 - smooth(.14, .36, slope)) * (1 - smooth(250, 390, elevation)) * .37);
            color.lerp(other, bare);
            if (r.kind === "coast") {
              const beachHeight = y - layout.water(r).y;
              const sand = (1 - smooth(3, 19, Math.abs(beachHeight))) * (1 - smooth(.12, .38, slope));
              other.copy(shingle).lerp(beach, smooth(-2, 7, beachHeight) * .74 + fold * .25);
              color.lerp(other, sand);
            }
            if (r.kind === "alpine") {
              const snowLine = 320 + (broad - .5) * 105 + normals.getX(i) * 42;
              color.lerp(snow, smooth(snowLine, snowLine + 80, elevation) * (1 - smooth(.16, .53, slope)));
            }
            color.multiplyScalar(.92 + detail * .16);
            colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
          }
          geo.setAttribute("color", new T.BufferAttribute(colors, 3));
        } else if (water && !bakedWater.has(geo)) {
          bakedWater.add(geo);
          const colors = new Float32Array(positions.count * 3), uvs = new Float32Array(positions.count * 2);
          const faceNormal = new T.Vector3().fromBufferAttribute(normals, 0)
            .applyNormalMatrix(new T.Matrix3().getNormalMatrix(object.matrixWorld));
          const horizontal = Math.abs(faceNormal.y) > .5;
          const waterRegion = layout.regionAt(object.position.x), coastal = waterRegion.kind === "coast";
          for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
            const depth = Math.max(0, point.y - layout.height(point.x, point.z));
            // Existing coastal cross-shore rows carry a shallow-to-deep tint.
            const depthTint = coastal ? smooth(5, 520, waterRegion.z - 105 - point.z) : smooth(.5, 13, depth);
            color.copy(shallow).lerp(waterline, smooth(0, .24, depthTint)).lerp(deep, horizontal ? smooth(.06, .94, depthTint) : .18);
            colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
            const rippleScale = coastal ? 90 : 40;
            uvs[i * 2] = point.x / rippleScale; uvs[i * 2 + 1] = (horizontal ? point.z : point.y) / rippleScale;
          }
          geo.setAttribute("color", new T.BufferAttribute(colors, 3));
          geo.setAttribute("uv", new T.BufferAttribute(uvs, 2));
        }
      });
    },
    update(time: number) {
      if (lastTime === time || disposed) return;
      lastTime = time;
      waterNormal.offset.set(time * .008, time * .004);
    },
    dispose() {
      if (disposed) return; disposed = true;
      terrain.dispose(); waterNormal.dispose();
    },
  };
}
