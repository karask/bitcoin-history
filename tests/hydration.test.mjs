import assert from "node:assert/strict";
import test from "node:test";

const { subscribe, getSnapshot, getServerSnapshot } =
  await import("../app/present/usePrefersReducedMotion.ts");

const withWindow = (stub, run) => {
  const had = "window" in globalThis;
  const previous = globalThis.window;
  globalThis.window = stub;
  try {
    return run();
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
};

const mediaStub = (matches) => {
  const listeners = new Set();
  return {
    listeners,
    matchMedia: (query) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    }),
  };
};

/**
 * The bug this guards against: motion's useReducedMotion reads the media query
 * synchronously into useState, so a visitor with reduced motion enabled hydrated with a
 * different value than the server rendered, and React discarded the tree. The server
 * snapshot must therefore be false unconditionally — that is what the hydration render
 * uses, and it is what the server rendered.
 */
test("the server snapshot never reports a preference", () => {
  assert.equal(getServerSnapshot(), false);
  // Even with a window present and the query matching, the server snapshot is fixed.
  withWindow(mediaStub(true), () => {
    assert.equal(getServerSnapshot(), false, "server snapshot must not read the media query");
  });
});

test("the client snapshot reflects the media query", () => {
  withWindow(mediaStub(true), () => assert.equal(getSnapshot(), true));
  withWindow(mediaStub(false), () => assert.equal(getSnapshot(), false));
});

test("the client snapshot is safe without a window or matchMedia", () => {
  const had = "window" in globalThis;
  const previous = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(getSnapshot(), false, "must not throw during server rendering");
  } finally {
    if (had) globalThis.window = previous;
  }
  withWindow({}, () => assert.equal(getSnapshot(), false, "must tolerate a window without matchMedia"));
});

test("subscribing registers and cleanly unregisters a listener", () => {
  const stub = mediaStub(false);
  withWindow(stub, () => {
    assert.equal(stub.listeners.size, 0);
    const unsubscribe = subscribe(() => {});
    assert.equal(stub.listeners.size, 1, "should listen for changes to the setting");
    unsubscribe();
    assert.equal(stub.listeners.size, 0, "should remove its listener on cleanup");
  });
});

test("subscribing is a no-op without matchMedia", () => {
  withWindow({}, () => {
    assert.doesNotThrow(() => subscribe(() => {})());
  });
});
