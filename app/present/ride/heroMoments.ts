import * as THREE from "three";

/**
 * Hand-authored flourishes for the stations that carry the most weight.
 *
 * The procedural districts give every event a place; these give a handful of them a
 * moment. Each one is built from the record's own material — the actual coinbase text,
 * the actual block height, the actual price — rather than invented decoration.
 */

export type HeroEvent = {
  slug: string;
  title: string;
  date: string;
  priceUsd: number | null;
  blockHeight?: number;
  technicalNote?: string;
};

export type HeroContext = {
  origin: THREE.Vector3;
  tangent: THREE.Vector3;
  color: number;
  event: HeroEvent;
};

export type Hero = {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
};

type Frame = { forward: THREE.Vector3; up: THREE.Vector3; side: THREE.Vector3 };

function frameOf(context: HeroContext): Frame {
  const forward = context.tangent.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(forward, up).normalize();
  return { forward, up, side };
}

type TextPlane = { mesh: THREE.Mesh; setText: (lines: string[]) => void; dispose: () => void };

/**
 * Text as a canvas texture on a plane. Cheap, crisp at ride distances, and the only way
 * to get real typography into the scene without shipping a font loader.
 */
function textPlane(
  lines: string[],
  options: { width?: number; color?: string; font?: string; align?: CanvasTextAlign; background?: string } = {},
): TextPlane {
  const width = options.width ?? 1024;
  const lineHeight = Math.round(width * 0.11);
  const height = Math.max(128, lineHeight * lines.length + lineHeight * 0.6);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const paint = (content: string[]) => {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, width, height);
    }
    context.font = options.font ?? `${Math.round(lineHeight * 0.74)}px Georgia, "Times New Roman", serif`;
    context.fillStyle = options.color ?? "#f1eee6";
    context.textBaseline = "middle";
    context.textAlign = options.align ?? "center";
    const x = options.align === "left" ? 24 : width / 2;
    content.forEach((line, index) => {
      context.fillText(line, x, lineHeight * (index + 0.8), width - 48);
    });
    texture.needsUpdate = true;
  };
  paint(lines);

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, height / width), material);

  return {
    mesh,
    setText: paint,
    dispose: () => {
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}

/** Orient a plane to face back down the rail, so the rider reads it head-on. */
function faceRider(mesh: THREE.Mesh, context: HeroContext, frame: Frame, distance: number, lift: number, scale: number) {
  mesh.position.copy(context.origin).addScaledVector(frame.forward, distance).addScaledVector(frame.up, lift);
  mesh.lookAt(mesh.position.clone().addScaledVector(frame.forward, -1));
  mesh.scale.setScalar(scale);
}

const noop = () => {};

/** The Times masthead line, carried in block 0's coinbase. */
function genesis(context: HeroContext): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const headline = textPlane(
    ["The Times 03/Jan/2009", "Chancellor on brink of", "second bailout for banks"],
    { color: "#efe7d6", font: '76px Georgia, "Times New Roman", serif' },
  );
  faceRider(headline.mesh, context, frame, 42, 20, 58);
  group.add(headline.mesh);

  // The block itself, hanging below the headline.
  const blockMaterial = new THREE.MeshStandardMaterial({
    color: 0xff9b42, emissive: 0xff9b42, emissiveIntensity: 0.7, roughness: 0.4, wireframe: true,
  });
  const block = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), blockMaterial);
  block.position.copy(context.origin).addScaledVector(frame.forward, 44).addScaledVector(frame.up, -6);
  group.add(block);

  return {
    group,
    update: (elapsed) => {
      block.rotation.y = elapsed * 0.4;
      block.rotation.x = Math.sin(elapsed * 0.3) * 0.2;
    },
    dispose: () => { headline.dispose(); blockMaterial.dispose(); block.geometry.dispose(); group.clear(); },
  };
}

/** Two pizzas, in orbit, at the price they actually cost. */
function pizza(context: HeroContext): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const centre = context.origin.clone().addScaledVector(frame.forward, 40).addScaledVector(frame.up, 6);

  const crust = new THREE.MeshStandardMaterial({ color: 0xe8b463, emissive: 0x8a5a1e, emissiveIntensity: 0.25, roughness: 0.8 });
  const discs: THREE.Mesh[] = [];
  for (let index = 0; index < 2; index += 1) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.7, 26), crust);
    group.add(disc);
    discs.push(disc);
  }
  const label = textPlane(["10,000 BTC"], { color: "#ffd8a8", font: '92px ui-monospace, monospace' });
  faceRider(label.mesh, context, frame, 40, 24, 34);
  group.add(label.mesh);

  return {
    group,
    update: (elapsed) => {
      discs.forEach((disc, index) => {
        const angle = elapsed * 0.5 + index * Math.PI;
        disc.position.copy(centre)
          .addScaledVector(frame.side, Math.cos(angle) * 16)
          .addScaledVector(frame.up, Math.sin(angle) * 7);
        disc.rotation.set(elapsed * 0.7 + index, elapsed * 0.4, 0.4);
      });
    },
    dispose: () => { label.dispose(); crust.dispose(); for (const d of discs) d.geometry.dispose(); group.clear(); },
  };
}

/**
 * A halving, shown rather than stated: the subsidy stream runs at full rate up to the
 * station and at exactly half beyond it.
 */
function halving(context: HeroContext, subsidyBefore: number): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const COUNT = 220;
  const positions = new Float32Array(COUNT * 3);
  const offsets = new Float32Array(COUNT);
  for (let index = 0; index < COUNT; index += 1) {
    offsets[index] = Math.random();
    positions[index * 3] = 0;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffd166, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false,
  });
  const points = new THREE.Points(geometry, material);
  group.add(points);

  const label = textPlane(
    [`${subsidyBefore} BTC  →  ${subsidyBefore / 2} BTC`],
    { color: "#ffe6a8", font: '80px ui-monospace, monospace' },
  );
  faceRider(label.mesh, context, frame, 34, 22, 40);
  group.add(label.mesh);

  const SPAN = 170;
  return {
    group,
    update: (elapsed) => {
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < COUNT; index += 1) {
        // Travel from behind the station to ahead of it, looping.
        const t = (offsets[index] + elapsed * 0.11) % 1;
        const along = -SPAN + t * SPAN * 2;
        // Past the station only half the stream survives — the subsidy is cut in two.
        const survives = along < 0 || index % 2 === 0;
        const wobble = Math.sin(elapsed * 2 + index) * 3.5;
        const position = context.origin.clone()
          .addScaledVector(frame.forward, along)
          .addScaledVector(frame.side, wobble)
          .addScaledVector(frame.up, 3 + Math.cos(elapsed * 1.7 + index) * 2.5);
        attribute.setXYZ(index, position.x, survives ? position.y : -9999, position.z);
      }
      attribute.needsUpdate = true;
    },
    dispose: () => { label.dispose(); geometry.dispose(); material.dispose(); group.clear(); },
  };
}

/** An altitude marker: a plane at the price level, with the number on it. */
function altitude(context: HeroContext, caption: string): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const label = textPlane([caption], { color: "#fff4dd", font: '104px ui-monospace, monospace' });
  faceRider(label.mesh, context, frame, 40, 18, 52);
  group.add(label.mesh);

  const ringMaterial = new THREE.MeshBasicMaterial({ color: context.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(26, 27.4, 48), ringMaterial);
  ring.position.copy(context.origin).addScaledVector(frame.forward, 40);
  ring.lookAt(ring.position.clone().addScaledVector(frame.forward, -1));
  group.add(ring);

  return {
    group,
    update: (elapsed) => { ring.scale.setScalar(1 + Math.sin(elapsed * 1.2) * 0.04); },
    dispose: () => { label.dispose(); ringMaterial.dispose(); ring.geometry.dispose(); group.clear(); },
  };
}

/** The supply counter, ticking to twenty million while you stand there. */
function supplyCounter(context: HeroContext): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const counter = textPlane(["19,999,000 BTC"], { color: "#ffd166", font: '96px ui-monospace, monospace' });
  faceRider(counter.mesh, context, frame, 38, 16, 56);
  group.add(counter.mesh);

  const caption = textPlane(["MINED SUPPLY"], { color: "#a8a096", font: '54px ui-monospace, monospace' });
  faceRider(caption.mesh, context, frame, 38, 27, 30);
  group.add(caption.mesh);

  let shown = -1;
  return {
    group,
    update: (elapsed) => {
      // Ticks up over roughly six seconds, then holds.
      const progress = Math.min(1, (elapsed % 24) / 6);
      const value = Math.round(19_999_000 + progress * 1000);
      if (value !== shown) {
        shown = value;
        counter.setText([`${value.toLocaleString("en-US")} BTC`]);
      }
    },
    dispose: () => { counter.dispose(); caption.dispose(); group.clear(); },
  };
}

/** A wall that has sheared away — used where an institution collapsed. */
function collapse(context: HeroContext): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6f6259, emissive: 0x2a1512, emissiveIntensity: 0.5, roughness: 0.95, flatShading: true,
  });
  const geometry = new THREE.BoxGeometry(9, 9, 9);
  const COUNT = 60;
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  const dummy = new THREE.Object3D();
  const seeds = Array.from({ length: COUNT }, () => ({
    along: (Math.random() * 2 - 1) * 120,
    side: (Math.random() > 0.5 ? 1 : -1) * (34 + Math.random() * 46),
    top: 40 + Math.random() * 60,
    speed: 0.4 + Math.random() * 1.2,
    spin: Math.random() * 2 - 1,
    scale: 0.4 + Math.random() * 1.1,
  }));
  group.add(mesh);

  return {
    group,
    update: (elapsed) => {
      for (let index = 0; index < COUNT; index += 1) {
        const seed = seeds[index];
        // Debris falls, resets, falls again — the wall never stops coming down.
        const fall = ((elapsed * seed.speed * 9) % (seed.top + 70)) - 10;
        dummy.position.copy(context.origin)
          .addScaledVector(frame.forward, seed.along)
          .addScaledVector(frame.side, seed.side)
          .addScaledVector(frame.up, seed.top - fall);
        dummy.rotation.set(elapsed * seed.spin, elapsed * seed.spin * 0.6, 0);
        dummy.scale.setScalar(seed.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => { geometry.dispose(); material.dispose(); mesh.dispose(); group.clear(); },
  };
}

/** A hall opening out — used where access widened to everyone at once. */
function hall(context: HeroContext): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf3a6ca, emissive: context.color, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3,
  });
  const geometry = new THREE.CylinderGeometry(3, 3.4, 130, 12);
  const COUNT = 24;
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < COUNT; index += 1) {
    const row = Math.floor(index / 2);
    const sign = index % 2 === 0 ? 1 : -1;
    // The colonnade widens as it recedes: the hall opens.
    const along = -60 + row * 34;
    const spread = 30 + row * 7;
    dummy.position.copy(context.origin)
      .addScaledVector(frame.forward, along)
      .addScaledVector(frame.side, sign * spread)
      .addScaledVector(frame.up, -52);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1 + row * 0.06, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  return {
    group,
    update: noop,
    dispose: () => { geometry.dispose(); material.dispose(); mesh.dispose(); group.clear(); },
  };
}

/** The white paper's own title page, floating in the dark. */
function whitePaper(context: HeroContext): Hero {
  const group = new THREE.Group();
  const frame = frameOf(context);
  const page = textPlane(
    ["Bitcoin: A Peer-to-Peer", "Electronic Cash System", "", "Satoshi Nakamoto"],
    { color: "#1a1713", background: "rgba(238,234,224,0.94)", font: '64px Georgia, "Times New Roman", serif' },
  );
  faceRider(page.mesh, context, frame, 40, 12, 46);
  group.add(page.mesh);
  return {
    group,
    update: (elapsed) => { page.mesh.rotation.z = Math.sin(elapsed * 0.35) * 0.02; },
    dispose: () => { page.dispose(); group.clear(); },
  };
}

type HeroBuilder = (context: HeroContext) => Hero;

/** Slug → flourish. Anything not listed here gets its district and nothing more. */
const builders: Record<string, HeroBuilder> = {
  "bitcoin-white-paper-announced": whitePaper,
  "genesis-block-mined": genesis,
  "bitcoin-pizza-purchase": pizza,
  "first-bitcoin-halving": (context) => halving(context, 50),
  "second-bitcoin-halving": (context) => halving(context, 25),
  "third-bitcoin-halving": (context) => halving(context, 12.5),
  "fourth-bitcoin-halving": (context) => halving(context, 6.25),
  "mt-gox-files-for-bankruptcy": collapse,
  "ftx-chapter-11": collapse,
  "us-spot-bitcoin-etps-start-trading": hall,
  "bitcoin-crosses-one-hundred-thousand": (context) => altitude(context, "$100,000"),
  "bitcoin-2025-all-time-high": (context) => altitude(context, "$126,038"),
  "bitcoin-2017-cycle-high": (context) => altitude(context, "$19,783"),
  "bitcoin-twenty-million-mined": supplyCounter,
  "bitcoin-dollar-parity": (context) => altitude(context, "$1.00"),
};

export function hasHero(slug: string): boolean {
  return slug in builders;
}

export function buildHero(context: HeroContext): Hero | null {
  const builder = builders[context.event.slug];
  return builder ? builder(context) : null;
}

export const heroSlugs = Object.keys(builders);
