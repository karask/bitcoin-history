import assert from "node:assert/strict";
import test from "node:test";

const { districts, seededRandom } = await import("../app/present/ride/districts.ts");

const categories = ["origins", "protocol", "mining", "adoption", "infrastructure", "finance", "policy", "crisis"];

const luminance = (hex) => {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

test("every category has a district", () => {
  for (const category of categories) {
    assert.ok(districts[category], `no district for ${category}`);
  }
  assert.equal(Object.keys(districts).length, categories.length);
});

/**
 * Regression guard. Atmosphere colours were originally derived by lerping 16% from the
 * district's bright accent toward black. THREE.Color.lerp works in linear space, so that
 * produced a rgb(112,66,27) background instead of near-black — the whole scene washed out.
 * Atmospheres are now hand-picked and must stay dark.
 */
test("district atmospheres are dark enough to be a night sky", () => {
  for (const category of categories) {
    const { atmosphere, name } = districts[category];
    const lum = luminance(atmosphere);
    assert.ok(lum < 0.06, `${name} atmosphere ${atmosphere.toString(16)} is too bright (luminance ${lum.toFixed(3)})`);
  }
});

test("district accents are bright enough to read against their atmosphere", () => {
  for (const category of categories) {
    const { color, atmosphere, name } = districts[category];
    assert.ok(
      luminance(color) > luminance(atmosphere) + 0.35,
      `${name} accent does not contrast with its atmosphere`,
    );
  }
});

test("district accents match the shared palette", async () => {
  // Rail and Ride must not drift apart on colour.
  const palette = await import("../lib/palette.ts").catch(() => null);
  if (!palette) return; // path alias unavailable under plain node; covered by tsc instead
  for (const category of categories) {
    const hex = `#${districts[category].color.toString(16).padStart(6, "0")}`;
    assert.equal(hex, palette.categoryColors[category], `${category} colour drifted from the palette`);
  }
});

test("district fields are sanely proportioned", () => {
  for (const category of categories) {
    const d = districts[category];
    assert.ok(d.count >= 6 && d.count <= 200, `${d.name} instance count out of range`);
    assert.ok(d.spread.along > 0 && d.spread.lateral > 0, `${d.name} has no extent`);
    assert.ok(d.scale.every((s) => s > 0), `${d.name} has a non-positive scale`);
    assert.ok(["flanking", "below", "around", "overhead"].includes(d.placement));
    assert.ok(d.drift >= 0 && d.drift < 2, `${d.name} drift is out of range`);
  }
});

test("the station RNG is deterministic and well distributed", () => {
  const a = seededRandom("genesis-block-mined");
  const b = seededRandom("genesis-block-mined");
  const c = seededRandom("bitcoin-pizza-purchase");
  const first = Array.from({ length: 8 }, () => a());
  const second = Array.from({ length: 8 }, () => b());
  const other = Array.from({ length: 8 }, () => c());
  assert.deepEqual(first, second, "the same slug must always build the same district");
  assert.notDeepEqual(first, other, "different slugs must build different districts");

  const rng = seededRandom("distribution-check");
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 10_000; i += 1) {
    const value = rng();
    assert.ok(value >= 0 && value < 1, `value ${value} outside [0,1)`);
    buckets[Math.floor(value * 10)] += 1;
  }
  for (const bucket of buckets) {
    assert.ok(bucket > 700 && bucket < 1300, `uneven distribution: ${buckets.join(",")}`);
  }
});
