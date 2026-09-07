import * as THREE from "three";
import type { CategoryId } from "@/lib/event-schema";

/**
 * Eight districts, one system.
 *
 * Hand-modelling a scene per event is impossible at 275 records and would read as
 * filler anyway. Instead each category gets an archetype whose instances are placed
 * from the event's own data, so no two stations resolve the same way.
 */
export type PropShape = "tetra" | "block" | "pylon" | "spark" | "tower" | "slab" | "column" | "shard";

export type DistrictConfig = {
  name: string;
  /** Emissive accent, matched to lib/palette so Rail and Ride agree. */
  color: number;
  /**
   * Fog and clear colour. Chosen explicitly rather than derived by lerping from `color`:
   * THREE.Color.lerp works in linear space, so blending even 16% toward a bright hue
   * lands far brighter than it looks on paper.
   */
  atmosphere: number;
  prop: PropShape;
  /** Instances per station before significance scaling. */
  count: number;
  /** Half-extent of the field around the station, in world units. */
  spread: { along: number; lateral: number; vertical: number };
  scale: [number, number, number];
  /** Where the field sits relative to the rail. */
  placement: "flanking" | "below" | "around" | "overhead";
  /** Radians per second of idle rotation. */
  drift: number;
};

export const districts: Record<CategoryId, DistrictConfig> = {
  origins: {
    name: "The Cold Start",
    color: 0xff9b42,
    atmosphere: 0x0c0805,
    prop: "tetra",
    count: 34,
    spread: { along: 190, lateral: 120, vertical: 70 },
    scale: [2.4, 2.4, 2.4],
    placement: "around",
    drift: 0.18,
  },
  protocol: {
    name: "The Lattice",
    color: 0x72d9ff,
    atmosphere: 0x05090e,
    prop: "block",
    count: 70,
    spread: { along: 190, lateral: 74, vertical: 52 },
    scale: [4.4, 4.4, 4.4],
    placement: "flanking",
    drift: 0.05,
  },
  mining: {
    name: "The Furnace",
    color: 0xffd166,
    atmosphere: 0x0d0a04,
    prop: "pylon",
    count: 46,
    spread: { along: 200, lateral: 105, vertical: 0 },
    scale: [2.2, 30, 2.2],
    placement: "below",
    drift: 0,
  },
  adoption: {
    name: "The Grid",
    color: 0x7ee2a8,
    atmosphere: 0x050c07,
    prop: "spark",
    count: 96,
    spread: { along: 200, lateral: 120, vertical: 26 },
    scale: [1.5, 1.5, 1.5],
    placement: "below",
    drift: 0.1,
  },
  infrastructure: {
    name: "The Scaffold",
    color: 0xb8a3ff,
    atmosphere: 0x07060e,
    prop: "tower",
    count: 30,
    spread: { along: 200, lateral: 100, vertical: 0 },
    scale: [4, 46, 4],
    placement: "below",
    drift: 0,
  },
  finance: {
    name: "The Canyon",
    color: 0xf3a6ca,
    atmosphere: 0x0c0509,
    prop: "slab",
    count: 44,
    spread: { along: 200, lateral: 86, vertical: 44 },
    scale: [7, 20, 7],
    placement: "flanking",
    drift: 0,
  },
  policy: {
    name: "The Colonnade",
    color: 0x87a7ff,
    atmosphere: 0x05070e,
    prop: "column",
    count: 26,
    spread: { along: 200, lateral: 62, vertical: 0 },
    scale: [3.4, 62, 3.4],
    placement: "flanking",
    drift: 0,
  },
  crisis: {
    name: "The Fracture",
    color: 0xff746c,
    atmosphere: 0x0e0504,
    prop: "shard",
    count: 58,
    spread: { along: 190, lateral: 110, vertical: 78 },
    scale: [3.2, 9, 3.2],
    placement: "around",
    drift: 0.42,
  },
};

/** Deterministic per-station RNG, so a district looks the same on every visit. */
export function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}

const geometryCache = new Map<PropShape, THREE.BufferGeometry>();

export function propGeometry(shape: PropShape): THREE.BufferGeometry {
  const cached = geometryCache.get(shape);
  if (cached) return cached;
  let geometry: THREE.BufferGeometry;
  switch (shape) {
    case "tetra": geometry = new THREE.TetrahedronGeometry(1); break;
    case "block": geometry = new THREE.BoxGeometry(1, 1, 1); break;
    case "pylon": geometry = new THREE.CylinderGeometry(0.5, 0.9, 1, 6); break;
    case "spark": geometry = new THREE.OctahedronGeometry(1); break;
    case "tower": geometry = new THREE.BoxGeometry(1, 1, 1); break;
    case "slab": geometry = new THREE.BoxGeometry(1, 1, 0.35); break;
    case "column": geometry = new THREE.CylinderGeometry(0.5, 0.55, 1, 10); break;
    case "shard": geometry = new THREE.ConeGeometry(0.7, 1, 4); break;
  }
  geometryCache.set(shape, geometry);
  return geometry;
}

export function disposeGeometryCache() {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}

export type DistrictInput = {
  category: CategoryId;
  slug: string;
  significance: "landmark" | "major" | "context";
  /** Position and orientation of the station on the rail. */
  origin: THREE.Vector3;
  tangent: THREE.Vector3;
  /** Extra parameters read straight off the event record. */
  blockHeight?: number;
  actorCount: number;
  /** Disputed evidence renders unstable — the geometry will not quite settle. */
  unstable: boolean;
};

export type District = {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
};

/**
 * Build one district around a station. Instance count, height and jitter all come from
 * the event, so a landmark with a known block height reads denser and taller than a
 * passing note in the same category.
 */
export function buildDistrict(input: DistrictInput): District {
  const config = districts[input.category];
  const random = seededRandom(input.slug);

  // Significance scales the field; a landmark should feel like somewhere.
  const weight = input.significance === "landmark" ? 1.35 : input.significance === "major" ? 1 : 0.66;
  // Block height and actor count give two more axes of variation straight from the record.
  const density = input.blockHeight !== undefined ? 1.15 : 1;
  const count = Math.max(6, Math.round(config.count * weight * density));

  const geometry = propGeometry(config.prop);
  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: input.unstable ? 0.5 : 0.32,
    roughness: 0.62,
    metalness: 0.12,
    transparent: true,
    opacity: input.unstable ? 0.66 : 0.9,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = true;

  // Build a local frame so the field follows the rail's heading rather than world axes.
  const forward = input.tangent.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(forward, up).normalize();

  const dummy = new THREE.Object3D();
  const phases = new Float32Array(count);
  const bases = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const along = (random() * 2 - 1) * config.spread.along;
    let lateral = (random() * 2 - 1) * config.spread.lateral;
    let vertical = (random() * 2 - 1) * config.spread.vertical;

    if (config.placement === "flanking") {
      // Push instances off the rail so the vehicle passes between them.
      const sign = index % 2 === 0 ? 1 : -1;
      lateral = sign * (config.spread.lateral * (0.42 + random() * 0.58));
    } else if (config.placement === "below") {
      vertical = -(18 + random() * config.spread.vertical || 18) - random() * 34;
    } else if (config.placement === "overhead") {
      vertical = 24 + random() * config.spread.vertical;
    }

    const position = input.origin.clone()
      .addScaledVector(forward, along)
      .addScaledVector(side, lateral)
      .addScaledVector(up, vertical);

    bases[index * 3] = position.x;
    bases[index * 3 + 1] = position.y;
    bases[index * 3 + 2] = position.z;
    phases[index] = random() * Math.PI * 2;

    dummy.position.copy(position);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);

    const jitter = 0.55 + random() * 0.9;
    if (config.prop === "pylon" || config.prop === "tower" || config.prop === "column") {
      // Verticals stand upright and vary in height rather than tumbling.
      dummy.rotation.set(0, random() * Math.PI, 0);
      dummy.position.y = position.y - config.scale[1] * jitter * 0.5;
      dummy.scale.set(config.scale[0], config.scale[1] * jitter, config.scale[2]);
    } else {
      dummy.scale.set(config.scale[0] * jitter, config.scale[1] * jitter, config.scale[2] * jitter);
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(mesh);

  // A key light per district gives each one its own colour cast as you pass through.
  const light = new THREE.PointLight(config.color, input.significance === "landmark" ? 2.4 : 1.5, 460, 1.6);
  light.position.copy(input.origin).addScaledVector(up, 26);
  group.add(light);

  const update = config.drift === 0 && !input.unstable
    ? () => {}
    : (elapsed: number) => {
      // Only animated districts pay for a per-frame matrix rewrite.
      for (let index = 0; index < count; index += 1) {
        dummy.position.set(bases[index * 3], bases[index * 3 + 1], bases[index * 3 + 2]);
        const phase = phases[index] + elapsed * config.drift;
        if (input.unstable) {
          // Disputed evidence: the geometry never quite settles.
          dummy.position.x += Math.sin(phase * 3.1) * 1.6;
          dummy.position.y += Math.cos(phase * 2.7) * 1.6;
        }
        dummy.rotation.set(phase * 0.6, phase, phase * 0.3);
        dummy.scale.setScalar(config.scale[0]);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

  return {
    group,
    update,
    dispose: () => {
      // Geometry is shared through the cache; only the material is per-district.
      material.dispose();
      mesh.dispose();
      group.clear();
    },
  };
}
