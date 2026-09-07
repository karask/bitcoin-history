import assert from "node:assert/strict";
import test from "node:test";
import { createRideAudio } from "../app/present/ride/audio.ts";

class Param {
  value = 0;
  setValueAtTime(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class AudioNode {
  gain = new Param(); frequency = new Param(); Q = new Param(); connections = [];
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}
class Context {
  static last;
  state = "suspended"; currentTime = 1; sampleRate = 8000; destination = {}; oscillators = []; gains = []; filters = [];
  constructor() { Context.last = this; }
  createGain() { const n = new AudioNode(); this.gains.push(n); return n; }
  createOscillator() { const n = new AudioNode(); this.oscillators.push(n); return n; }
  createBiquadFilter() { const n = new AudioNode(); this.filters.push(n); return n; }
  createConvolver() { return new AudioNode(); }
  createBufferSource() { return new AudioNode(); }
  createBuffer(channels, length) { const data = Array.from({length: channels}, () => new Float32Array(length)); return { getChannelData: i => data[i] }; }
  async resume() { this.state = "running"; this.onstatechange?.(); }
  async close() { this.state = "closed"; }
}
const previousContext = globalThis.AudioContext, previousWindow = globalThis.window;
globalThis.AudioContext = Context;
globalThis.window = { setInterval, clearInterval, setTimeout, clearTimeout };
test.after(() => { globalThis.AudioContext = previousContext; globalThis.window = previousWindow; });

test("enabling resumes audio and immediately schedules three audible midrange notes", async () => {
  const rig = createRideAudio(); const ctx = Context.last;
  assert.equal(rig.isEnabled(), false);
  assert.ok(ctx.oscillators.every(o => o.frequency.value >= 196), "ambient voices must reach small speakers");
  await rig.setEnabled(true);
  assert.equal(ctx.state, "running"); assert.equal(rig.isEnabled(), true);
  assert.equal(ctx.oscillators.length, 6, "three ambience voices plus three confirmation notes");
  assert.deepEqual(ctx.oscillators.slice(3).map(o => o.frequency.value), [523.25, 659.25, 783.99]);
  assert.ok(ctx.gains[0].gain.value > 0.4);
  rig.setMotion(1, -0.3); assert.ok(ctx.filters[0].frequency.value > 1000);
  rig.setVolume(0); assert.equal(ctx.gains[0].gain.value, 0);
  rig.setVolume(1); assert.equal(ctx.gains[0].gain.value, 0.65);
  rig.testTone(); assert.equal(ctx.oscillators.length, 9);
  await rig.setEnabled(false); assert.equal(rig.isEnabled(), false); assert.equal(ctx.gains[0].gain.value, 0);
  rig.dispose(); assert.equal(ctx.state, "closed");
});

test("a resume that leaves audio suspended must not claim sound is on", async () => {
  const rig = createRideAudio(); const ctx = Context.last; ctx.resume = async () => {};
  await assert.rejects(rig.setEnabled(true), /not running/);
  assert.equal(rig.isEnabled(), false); rig.dispose();
});

test("browser interruptions notify the controls and allow gesture-based recovery", async () => {
  let interruptions = 0;
  const rig = createRideAudio(() => interruptions++); const ctx = Context.last;
  await rig.setEnabled(true);
  ctx.state = "interrupted"; ctx.onstatechange();
  assert.equal(interruptions, 1); assert.equal(rig.isEnabled(), false); assert.equal(ctx.gains[0].gain.value, 0);
  await rig.setEnabled(true); assert.equal(rig.isEnabled(), true); rig.dispose();
});
