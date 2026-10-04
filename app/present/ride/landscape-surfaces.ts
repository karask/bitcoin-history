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
  const size = 256, field = new Float32Array(size * size), albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Periodic fine strokes suggest blades and flecks without alpha-tested cards.
    const fine = noise(x / 4, y / 2, 64, 128), mid = noise(x / 16, y / 16, 16);
    const blade = noise(x / 2, y / 8, 128, 32) * .22;
    const v = clamp(.5 + (fine - .5) * .55 + (mid - .5) * .32 + blade, .15, 1);
    field[y * size + x] = v;
    const tone = 183 + v * 69, i = (y * size + x) * 4;
    albedo[i] = tone * .988; albedo[i + 1] = tone; albedo[i + 2] = tone * .95; albedo[i + 3] = 255;
  }
  const normals = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (field[y * size + (x + 1) % size] - field[y * size + (x + size - 1) % size]) * 2.4;
    const dy = (field[((y + 1) % size) * size + x] - field[((y + size - 1) % size) * size + x]) * 2.4;
    const inv = 1 / Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    normals[i] = (-dx * inv * .5 + .5) * 255;
    normals[i + 1] = (-dy * inv * .5 + .5) * 255;
    normals[i + 2] = (inv * .5 + .5) * 255; normals[i + 3] = 255;
  }
  // Normal RGB is unchanged. Alpha carries the approved nearly-neutral albedo
  // as linear luminance, allowing one texture fetch to serve both material maps.
  const linear = Float64Array.from({ length: 256 }, (_, byte) => {
    const v = byte / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  });
  for (let i = 0; i < normals.length; i += 4) {
    normals[i + 3] = Math.round((linear[albedo[i]] * .2126 + linear[albedo[i + 1]] * .7152 + linear[albedo[i + 2]] * .0722) * 255);
  }
  return texture(normals, size);
}

function waterTile() {
  const size = 64, pixels = new Uint8Array(size * size * 4), tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * tau, v = y / size * tau;
    // Derivatives of periodic wave components, baked into one normal tile.
    const dx = Math.cos(u * 2 + v * 5) * .32 + Math.cos(u * 7 - v * 3) * .18 + Math.cos(u * 13 + v * 11) * .08;
    const dy = Math.cos(u * 2 + v * 5) * .48 - Math.cos(u * 7 - v * 3) * .10 + Math.cos(u * 13 + v * 11) * .06;
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
    pasture: new T.Color(0x6d8741), forest: new T.Color(0x4e733f), gorge: new T.Color(0x687d50), alpine: new T.Color(0x63806b),
    autumn: new T.Color(0x978749), coast: new T.Color(0x859359), wetland: new T.Color(0x54794d),
  };
  const stone = new T.Color(0x778188), darkStone = new T.Color(0x394c5a);
  const dryGrass = new T.Color(0xaa9860), richGrass = new T.Color(0x527a3e);
  const snow = new T.Color(0xe5e9e7), beach = new T.Color(0xc2b78c);
  const shallow = new T.Color(0x369f9d), deep = new T.Color(0x125473);
  const color = new T.Color(), other = new T.Color(), point = new T.Vector3();
  const terrain = terrainTiles(), waterNormal = waterTile();
  groundMat.map = terrain;
  groundMat.bumpMap = null;
  groundMat.normalMap = terrain; groundMat.normalScale.set(.48, .48);
  groundMat.roughness = 1;
  groundMat.onBeforeCompile = shader => {
    // Both maps share one UV transform. Preserve the standard tangent frame and
    // opacity; packed alpha is surface luminance, never transparency. These
    // linear tint factors reproduce approved albedo within ~1 sRGB byte.
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
  waterMat.normalMap = waterNormal; waterMat.normalScale.set(.72, .48);
  waterMat.roughness = .25; waterMat.metalness = .12; waterMat.opacity = .94;
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
            const patch = noise(x * .023, z * .023), fertile = noise(x * .009 + 59, z * .011 + 94);
            const slope = 1 - Math.abs(normals.getY(i));
            const bare = Math.max(smooth(.17, .59, slope), smooth(100, 300, elevation) * .93);
            color.lerp(richGrass, smooth(.46, .83, fertile) * .27).lerp(dryGrass, smooth(.50, .85, patch) * .4);
            const strata = .5 + Math.sin(y * .045 + noise(x * .015, z * .015) * 3.5) * .5;
            other.copy(stone).lerp(darkStone, smooth(.30, .72, strata) * .50);
            color.lerp(other, bare * .92);
            const w = layout.water(r);
            if (r.kind === "coast") color.lerp(beach, (1 - smooth(2, 10, Math.abs(y - w.y))) * (1 - bare));
            if (r.kind === "alpine") color.lerp(snow, smooth(320, 455, elevation) * (1 - slope * .55));
            color.multiplyScalar(.92 + noise(x * .04 + 400, z * .04) * .17);
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
            color.copy(shallow).lerp(deep, horizontal ? depthTint : .18);
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
