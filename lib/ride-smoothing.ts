/** Geometry-only filters. Recorded daily prices are never changed. */
export const RIDE_TREND_WINDOW_DAYS = 14;
export const SMOOTH_RIDE_HEIGHT = 960;
export const MIN_BEND_SIGMA = 100;
const MAX_CURVATURE = 1 / 400;

export function rideTrackLength(stationCount: number) {
  return Math.max(6800, stationCount * 150);
}

/** Centered Gaussian weights over ±7 calendar days, in logarithmic price space. */
export function smoothDailyLogs<T extends { day: number; logPrice: number }>(knots: T[]): T[] {
  const radius = RIDE_TREND_WINDOW_DAYS / 2;
  const sigma = radius / 2;
  return knots.map((knot, index) => {
    let sum = 0, total = 0;
    for (let i = index; i >= 0 && knot.day - knots[i].day <= radius; i--) {
      const weight = Math.exp(-0.5 * ((knots[i].day - knot.day) / sigma) ** 2);
      sum += knots[i].logPrice * weight; total += weight;
    }
    for (let i = index + 1; i < knots.length && knots[i].day - knot.day <= radius; i++) {
      const weight = Math.exp(-0.5 * ((knots[i].day - knot.day) / sigma) ** 2);
      sum += knots[i].logPrice * weight; total += weight;
    }
    return { ...knot, logPrice: sum / total };
  });
}

/** Positive weights and clamped endpoints avoid invented extrema or edge ringing. */
function gaussian(values: number[], sigma: number): number[] {
  const radius = Math.ceil(sigma * 3);
  const weights = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-0.5 * ((i - radius) / sigma) ** 2));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return values.map((_, index) => {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      sum += values[Math.max(0, Math.min(values.length - 1, index + i))] * weights[i + radius];
    }
    return sum / total;
  });
}

/** Round bends in world distance AFTER calendar compression, independently of setlist. */
export function smoothRailLogs(values: number[], firstPriced: number, length: number, logSpan: number) {
  const dx = length / Math.max(1, values.length - 1);
  const heightPerLog = SMOOTH_RIDE_HEIGHT / logSpan;
  let sigmaUnits = MIN_BEND_SIGMA;
  let rounded = values;
  for (let pass = 0; pass < 10; pass++) {
    rounded = gaussian(values, sigmaUnits / dx);
    // A clipped pre-price plateau must meet the filtered curve with zero slope
    // and acceleration. Otherwise its boundary is still a sudden pitch change.
    const entry = rounded[firstPriced];
    const entrySteps = Math.max(1, 3 * sigmaUnits / dx);
    for (let i = 0; i <= firstPriced; i++) rounded[i] = entry;
    for (let i = firstPriced + 1; i < rounded.length && i < firstPriced + entrySteps; i++) {
      const t = (i - firstPriced) / entrySteps;
      const blend = t ** 3 * (t * (t * 6 - 15) + 10);
      rounded[i] = entry + (rounded[i] - entry) * blend;
    }
    let maximum = 0;
    for (let i = Math.max(1, firstPriced + 1); i < rounded.length - 1; i++) {
      const slope = (rounded[i + 1] - rounded[i - 1]) * heightPerLog / (2 * dx);
      const second = (rounded[i + 1] - 2 * rounded[i] + rounded[i - 1]) * heightPerLog / (dx * dx);
      maximum = Math.max(maximum, Math.abs(second) / (1 + slope * slope) ** 1.5);
    }
    if (maximum <= MAX_CURVATURE || pass === 9) break;
    sigmaUnits *= 1.35;
  }
  return { values: rounded, sigmaUnits };
}
