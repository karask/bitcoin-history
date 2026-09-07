import type { Track, TrackPoint } from "./track";

export type V3 = { x: number; y: number; z: number };
export type RideView = "seat" | "exhibit" | "overview";
export type RideTelemetry = { u: number; date: string; priceUsd: number | null; grade: number; velocity: number; arrived: boolean; phase?: "departing" | "braking" | "riding" | "paused" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One semantic date → position mapping, shared by track, vehicle and exhibits.
 * Arc distance is ONLY used for travel speed; it is explicitly converted back to u.
 * Sideways bends are scenic. Only the price series controls elevation.
 */
export function createRidePath(track: Track, sample: (track: Track, u: number) => TrackPoint) {
  const length = Math.max(6800, track.stations.length * 150);
  const height = 1450;
  const base = 32;
  // No market data means no price-implied hill. Keep the pre-price run level with
  // the first observed close so entering the series cannot invent a vertical jump.
  const firstQuote = track.points.find(p => p.priceUsd !== null);
  const floor = base + (firstQuote?.elevation ?? 0) * height;
  const point = (u: number): V3 => {
    const data = sample(track, u);
    return ({
    x: clamp(u, 0, 1) * length,
    y: data.priceUsd === null ? floor : base + data.elevation * height,
    z: Math.sin(clamp(u, 0, 1) * Math.PI * 5) * 145 + Math.sin(clamp(u, 0, 1) * Math.PI * 11) * 28,
  });
  };
  const frame = (u: number) => {
    const p = point(u);
    const a = point(u - 0.0001), b = point(u + 0.0001);
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    const tangent = { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d };
    const flat = Math.hypot(tangent.x, tangent.z) || 1;
    const side = { x: -tangent.z / flat, y: 0, z: tangent.x / flat };
    const up = { x: side.y * tangent.z - side.z * tangent.y, y: side.z * tangent.x - side.x * tangent.z, z: side.x * tangent.y - side.y * tangent.x };
    return { point: p, tangent, side, up };
  };
  const count = 6000;
  const distances = new Float64Array(count + 1);
  let last = point(0);
  for (let i = 1; i <= count; i++) {
    const p = point(i / count);
    distances[i] = distances[i - 1] + Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
    last = p;
  }
  const distanceAt = (u: number) => {
    const n = clamp(u, 0, 1) * count, i = Math.min(count - 1, Math.floor(n));
    return distances[i] + (distances[i + 1] - distances[i]) * (n - i);
  };
  const uAtDistance = (distance: number) => {
    const d = clamp(distance, 0, distances[count]);
    let lo = 0, hi = count;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (distances[mid] < d) lo = mid; else hi = mid; }
    return (lo + (d - distances[lo]) / (distances[hi] - distances[lo] || 1)) / count;
  };
  // Price reversals can be very tight after calendar compression. Plan speed from
  // curvature, then propagate braking backwards so we slow BEFORE each bend.
  // This changes pacing, not the price-derived rail height.
  const speedCount = Math.ceil(distances[count] / 2);
  const speedStep = distances[count] / speedCount;
  const speedLimits = new Float64Array(speedCount + 1);
  for (let i = 0; i <= speedCount; i++) {
    const d = i * speedStep, before = Math.max(0, d - 4), after = Math.min(distances[count], d + 4);
    const a = frame(uAtDistance(before)).tangent, b = frame(uAtDistance(after)).tangent;
    const curvature = Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) / Math.max(1, after - before);
    speedLimits[i] = Math.min(190, Math.sqrt(8 / Math.max(curvature, 0.00001)), 0.7 / Math.max(curvature, 0.00001));
  }
  // Bidirectional envelope: the previous-chapter control rides the same safe path.
  for (let i = speedCount - 1; i >= 0; i--) speedLimits[i] = Math.min(speedLimits[i], Math.sqrt(speedLimits[i + 1] ** 2 + 2 * 30 * speedStep));
  for (let i = 1; i <= speedCount; i++) speedLimits[i] = Math.min(speedLimits[i], Math.sqrt(speedLimits[i - 1] ** 2 + 2 * 30 * speedStep));
  const speedLimitAt = (distance: number) => {
    const n = clamp(distance / speedStep, 0, speedCount), i = Math.min(speedCount - 1, Math.floor(n));
    return speedLimits[i] + (speedLimits[i + 1] - speedLimits[i]) * (n - i);
  };
  return { point, frame, distanceAt, uAtDistance, speedLimitAt, length, height, floor, base, totalDistance: distances[count] };
}

/** Distance-based acceleration/braking. Pause freezes position and velocity. */
export function advanceRide(distance: number, target: number, velocity: number, dt: number, grade: number, speed: number, paused: boolean, bendSpeedLimit = Infinity) {
  if (paused) return { distance, velocity };
  const remaining = Math.abs(target - distance);
  if (remaining < 0.08) return { distance: target, velocity: 0 };
  const direction = Math.sign(target - distance);
  const cruise = Math.min(clamp(95 - grade * direction * 125, 36, 190), bendSpeedLimit) * speed;
  // Playback scales time, so acceleration scales with speed squared. A few seconds
  // of visible run-up and braking replace the old abrupt short-leg transitions.
  const acceleration = 28 * speed * speed;
  const deceleration = 38 * speed * speed;
  const brake = Math.sqrt(2 * deceleration * remaining);
  const desired = Math.min(cruise, brake);
  const nextVelocity = Math.max(0, velocity + clamp(desired - velocity, -deceleration * dt, acceleration * dt));
  const step = (velocity + nextVelocity) * 0.5 * dt;
  return step >= remaining ? { distance: target, velocity: 0 } : { distance: distance + direction * step, velocity: nextVelocity };
}
