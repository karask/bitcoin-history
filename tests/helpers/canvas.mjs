// Raster pixels are visually checked in-browser. This stub exercises the actual
// geometry/texture lifecycles without a GPU or a native canvas dependency.
export function installCanvasStub() {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => context };
    const context = {
      canvas, font: "12px Arial", fillStyle: "", strokeStyle: "", lineWidth: 1,
      globalAlpha: 1, textAlign: "center", textBaseline: "middle",
      fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
      measureText(text) { return { width: text.length * (parseFloat(this.font.match(/[\d.]+px/)?.[0] ?? "12") * .55) }; },
    };
    return canvas;
  } };
  return () => { globalThis.document = previous; };
}
