import assert from "node:assert/strict";
import test from "node:test";
import { makeTree, makeUnderstory } from "../app/present/ride/landscape-models.ts";

// The previous scenery's triangle counts are ceilings for each shared model.
// Added instances multiply this cost, so both distance levels must stay bounded.
const treeBudgets = {
  oak: [2472, 188], pine: [2114, 154], birch: [2604, 188],
  autumn: [2472, 188], willow: [3984, 188], orchard: [2832, 188],
};
const understoryBudgets = { grass: 520, flowers: 624, reeds: 504, rock: 180, hay: 384, fern: 2548 };

function verifyGeometry(geometry, budget, label) {
  assert.equal(geometry.index, null, `${label}: compatible with the merged instance geometry`);
  assert.deepEqual(Object.keys(geometry.attributes).sort(), ["color", "normal", "position"]);
  const vertices = geometry.getAttribute("position").count;
  assert.equal(vertices % 3, 0);
  assert.ok(vertices / 3 <= budget, `${label}: ${vertices / 3} triangles exceeds ${budget}`);
  for (const [attribute, values] of Object.entries(geometry.attributes)) {
    assert.equal(values.count, vertices, `${label}: ${attribute} aligns with positions`);
    for (const n of values.array) assert.ok(Number.isFinite(n), `${label}: finite ${attribute}`);
  }
  assert.ok(Number.isFinite(geometry.boundingSphere.radius));
  assert.ok(geometry.boundingSphere.radius > 0);
}

function sameGeometry(a, b, label) {
  for (const key of ["position", "normal", "color"]) {
    assert.deepEqual(a.getAttribute(key).array, b.getAttribute(key).array, `${label}: deterministic ${key}`);
  }
}

test("all vegetation prototypes are deterministic, finite and within their previous rendering budgets", () => {
  for (const [kind, budgets] of Object.entries(treeBudgets)) for (const seed of [11, 99, 553]) {
    // Far-first construction must work even without a previously cached crown.
    for (const distant of [true, false]) {
      const label = `${kind}/${seed}/${distant ? "far" : "near"}`;
      const a = makeTree(kind, seed, distant), b = makeTree(kind, seed, distant);
      try {
        verifyGeometry(a, budgets[distant ? 1 : 0], label);
        sameGeometry(a, b, label);
      } finally { a.dispose(); b.dispose(); }
    }
  }
});

test("tree distance swaps preserve every side of the crown's horizontal envelope", () => {
  for (const kind of Object.keys(treeBudgets)) for (const seed of [123, 1001, 7623]) {
    const far = makeTree(kind, seed, true), near = makeTree(kind, seed, false);
    try {
      far.computeBoundingBox(); near.computeBoundingBox();
      for (const axis of ["x", "z"]) for (const side of ["min", "max"]) {
        assert.ok(Math.abs(near.boundingBox[side][axis] - far.boundingBox[side][axis]) < 1e-5,
          `${kind}/${seed}: ${side} ${axis} must not shrink or grow at the distance switch`);
      }
    } finally { near.dispose(); far.dispose(); }
  }
});

test("ground plants retain deterministic geometry with substantial grass and fern savings", () => {
  for (const [kind, budget] of Object.entries(understoryBudgets)) {
    const a = makeUnderstory(kind), b = makeUnderstory(kind);
    try {
      verifyGeometry(a, budget, kind); sameGeometry(a, b, kind);
      if (kind === "grass") assert.ok(a.getAttribute("position").count / 3 < budget * .3);
      if (kind === "fern") assert.ok(a.getAttribute("position").count / 3 < budget * .25);
    } finally { a.dispose(); b.dispose(); }
  }
});
