/**
 * The track the presentation rides.
 *
 * Its shape is not decorative: elevation is the real BTC/USD series on a log scale,
 * so when the ride plunges it plunges because the market did. This module is pure and
 * dependency-free — no React, no path aliases, no JSON imports — so `tests/track.test.mjs`
 * can import it directly under Node's type stripping.
 */

/** The minimum an event needs to become a station. */
export type TrackEventInput = {
  slug: string;
  date: string;
  category: string;
  significance: "landmark" | "major" | "context";
  kind?: string;
};

/** Monthly closes keyed `YYYY-MM`, as shipped in content/price-context.json. */
export type PriceSeries = Record<string, number>;

export type TrackPoint = {
  /** Position along the track, 0 at the first station and 1 at the last. */
  u: number;
  /** Calendar date at this point, ISO `YYYY-MM-DD`. */
  date: string;
  /** Interpolated price, or null before Bitcoin had a quoted price. */
  priceUsd: number | null;
  /** 0..1 log-scaled height. Flat at 0 through the pre-price era. */
  elevation: number;
  /** -1..1 sideways offset: which way the chain is leaning. */
  lateral: number;
  /** d(elevation)/du. Positive is a climb. Drives speed and banking. */
  grade: number;
  /** Fractional price change per month here. Drives shake and colour temperature. */
  momentum: number;
};

export type Station = {
  slug: string;
  index: number;
  u: number;
  date: string;
  elevation: number;
  lateral: number;
  priceUsd: number | null;
  category: string;
  significance: TrackEventInput["significance"];
};

export type Track = {
  points: TrackPoint[];
  stations: Station[];
  /** Where the pre-price tunnel ends and the first climb begins, in u. */
  firstPricedU: number;
  span: { from: string; to: string };
  priceRange: { min: number; max: number };
  /** Log-space bounds actually used to normalise elevation. */
  logRange: { min: number; max: number };
};

export type TrackOptions = {
  /** Last observation can be a partial month; do not date it in the future. */
  lastObservationDate?: string;
  /**
   * How much to even out pacing. 0 keeps the track linear in real time, which is honest
   * but leaves the sparse 1983–2008 run-up occupying most of the ride. 1 gives every
   * event equal spacing, which paces well but erases the feel of time passing.
   */
  pacingBlend?: number;
  /** How many points to resample the track into. */
  resolution?: number;
};

const DEFAULT_PACING_BLEND = 0.55;
const DEFAULT_RESOLUTION = 720;

/** Floor for the log scale, a little under the first quoted price of $0.06. */
const PRICE_FLOOR = 0.05;

const MIN_SPEED = 0.45;
const MAX_SPEED = 2.4;
const GRADE_SENSITIVITY = 1.6;

const DAY = 86_400_000;

/**
 * Which way each category pulls the track. Engineering leans one way, the world the
 * other, so "sideways" reads as the chain weaving between the two rather than as noise.
 */
const CATEGORY_LATERAL: Record<string, number> = {
  protocol: -1,
  mining: -0.7,
  origins: -0.45,
  infrastructure: 0.3,
  adoption: 0.55,
  finance: 0.8,
  policy: 1,
  crisis: 0.15,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shape-preserving Hermite interpolation: continuous slope without invented extrema. */
function monotoneSlope(a: number, b: number): number {
  return a * b <= 0 ? 0 : 2 * a * b / (a + b);
}

function hermite(a: number, b: number, m0: number, m1: number, t: number): number {
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * m0
    + (-2 * t ** 3 + 3 * t ** 2) * b + (t ** 3 - t ** 2) * m1;
}

function toDayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY;
}

function toISODate(dayNumber: number): string {
  return new Date(Math.round(dayNumber) * DAY).toISOString().slice(0, 10);
}

/** Catmull-Rom through four knots. Gives C¹ continuity across the monthly price points. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

type PriceKnot = { day: number; logPrice: number; price: number };

/** A monthly closing snapshot belongs at month-end, not at the 15th. */
function buildPriceKnots(series: PriceSeries, lastObservationDate?: string): PriceKnot[] {
  return Object.keys(series)
    .sort()
    .map((month) => {
      const price = series[month];
      const [year, monthNumber] = month.split("-").map(Number);
      const monthEnd = Date.UTC(year, monthNumber, 0) / DAY;
      const day = lastObservationDate ? Math.min(monthEnd, toDayNumber(lastObservationDate)) : monthEnd;
      return { day, logPrice: Math.log10(Math.max(price, PRICE_FLOOR)), price };
    });
}

/**
 * Price at an arbitrary day, splined in log space because price moves multiplicatively.
 * Returns null before the series starts — Bitcoin genuinely had no price then, and the
 * track is meant to be flat there rather than guessing.
 */
function logPriceAt(knots: PriceKnot[], day: number): number | null {
  if (!knots.length || day < knots[0].day) return null;
  if (day >= knots[knots.length - 1].day) return knots[knots.length - 1].logPrice;

  let high = 1;
  while (high < knots.length && knots[high].day <= day) high += 1;
  const index = high - 1;
  const current = knots[index];
  const next = knots[Math.min(index + 1, knots.length - 1)];
  const previous = knots[Math.max(index - 1, 0)];
  const after = knots[Math.min(index + 2, knots.length - 1)];

  const span = next.day - current.day;
  const t = span > 0 ? (day - current.day) / span : 0;
  // Monotone cubic Hermite: retain smooth hills, without inventing price highs/lows
  // between the observed closes (unconstrained Catmull–Rom can overshoot).
  const delta = (next.logPrice - current.logPrice) / span;
  const left = index > 0 ? (current.logPrice - previous.logPrice) / (current.day - previous.day) : delta;
  const right = high + 1 < knots.length ? (after.logPrice - next.logPrice) / (after.day - next.day) : delta;
  const slope = (a: number, b: number) => a * b <= 0 ? 0 : 2 * a * b / (a + b);
  const m0 = slope(left, delta) * span;
  const m1 = slope(delta, right) * span;
  const value = (2 * t ** 3 - 3 * t ** 2 + 1) * current.logPrice
    + (t ** 3 - 2 * t ** 2 + t) * m0
    + (-2 * t ** 3 + 3 * t ** 2) * next.logPrice
    + (t ** 3 - t ** 2) * m1;
  return clamp(value, Math.min(current.logPrice, next.logPrice), Math.max(current.logPrice, next.logPrice));
}

export function buildTrack(
  events: TrackEventInput[],
  series: PriceSeries,
  options: TrackOptions = {},
): Track {
  if (events.length === 0) throw new Error("buildTrack needs at least one event");

  const blend = clamp(options.pacingBlend ?? DEFAULT_PACING_BLEND, 0, 1);
  const resolution = Math.max(16, Math.floor(options.resolution ?? DEFAULT_RESOLUTION));
  // Stable sort on date alone: same-day events keep the order the caller passed them in,
  // so the ride visits them in the same sequence the archive lists them.
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const knots = buildPriceKnots(series, options.lastObservationDate);
  const days = ordered.map((event) => toDayNumber(event.date));
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const timeSpan = Math.max(lastDay - firstDay, 1);

  // Station positions blend real time with even spacing (see TrackOptions.pacingBlend).
  const stationU = days.map((day, index) => {
    const timeFraction = (day - firstDay) / timeSpan;
    const indexFraction = ordered.length > 1 ? index / (ordered.length - 1) : 0;
    return (1 - blend) * timeFraction + blend * indexFraction;
  });

  // A piecewise-linear clock changes its slope abruptly at every event. That used
  // to put corners in an otherwise smooth price curve. Preserve each event's exact
  // day/position, but ease the rate at which calendar time passes between them.
  const dayRates = stationU.slice(1).map((u, i) => (days[i + 1] - days[i]) / (u - stationU[i] || 1));
  const daySlopes = days.map((_, i) => i === 0 ? (dayRates[0] ?? 0)
    : i === days.length - 1 ? dayRates[i - 1] : monotoneSlope(dayRates[i - 1], dayRates[i]));
  /** Map a track parameter back to a calendar day with a continuous, monotone clock. */
  const dayAtU = (u: number): number => {
    if (u <= stationU[0]) return firstDay;
    if (u >= stationU[stationU.length - 1]) return lastDay;
    let high = 1;
    while (high < stationU.length && stationU[high] <= u) high += 1;
    const index = high - 1;
    const span = stationU[index + 1] - stationU[index];
    const t = span > 0 ? (u - stationU[index]) / span : 0;
    return hermite(days[index], days[index + 1], daySlopes[index] * span, daySlopes[index + 1] * span, t);
  };

  // Normalise elevation over the range the ride actually visits.
  let logMin = Infinity;
  let logMax = -Infinity;
  for (let step = 0; step <= resolution; step += 1) {
    const value = logPriceAt(knots, dayAtU(step / resolution));
    if (value === null) continue;
    logMin = Math.min(logMin, value);
    logMax = Math.max(logMax, value);
  }
  const hasPrice = Number.isFinite(logMin) && Number.isFinite(logMax);
  if (!hasPrice) {
    logMin = Math.log10(PRICE_FLOOR);
    logMax = logMin + 1;
  }
  // Anchor the floor below the lowest visited price so the tunnel sits under the first climb.
  const logFloor = Math.min(logMin, Math.log10(PRICE_FLOOR));
  const logCeiling = Math.max(logMax, logFloor + 1);

  const elevationAt = (day: number): { elevation: number; price: number | null } => {
    const value = logPriceAt(knots, day);
    if (value === null) return { elevation: 0, price: null };
    return { elevation: clamp((value - logFloor) / (logCeiling - logFloor), 0, 1), price: 10 ** value };
  };

  const lateralAtU = (u: number): number => {
    // Lean toward the district of the nearest stations, weighted by proximity.
    let high = 1;
    while (high < stationU.length && stationU[high] <= u) high += 1;
    const index = Math.min(high - 1, ordered.length - 1);
    const nextIndex = Math.min(index + 1, ordered.length - 1);
    const span = stationU[nextIndex] - stationU[index];
    const t = span > 0 ? clamp((u - stationU[index]) / span, 0, 1) : 0;
    const from = CATEGORY_LATERAL[ordered[index].category] ?? 0;
    const to = CATEGORY_LATERAL[ordered[nextIndex].category] ?? 0;
    // Smoothstep so the lean eases rather than switching at each station.
    return lerp(from, to, t * t * (3 - 2 * t));
  };

  const points: TrackPoint[] = [];
  for (let step = 0; step <= resolution; step += 1) {
    const u = step / resolution;
    const day = dayAtU(u);
    const { elevation, price } = elevationAt(day);
    const monthEarlier = elevationAt(day - 30);
    const momentum = price !== null && monthEarlier.price !== null && monthEarlier.price > 0
      ? (price - monthEarlier.price) / monthEarlier.price
      : 0;
    const wobble = Math.sin(u * Math.PI * 26) * clamp(Math.abs(momentum) * 1.4, 0, 0.45);
    points.push({
      u,
      date: toISODate(day),
      priceUsd: price,
      elevation,
      lateral: clamp(lateralAtU(u) * 0.78 + wobble, -1, 1),
      grade: 0,
      momentum,
    });
  }

  // Central-difference grade, so speed and banking read from the same curve the eye sees.
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];
    const du = next.u - previous.u;
    points[index].grade = du > 0 ? (next.elevation - previous.elevation) / du : 0;
  }

  const firstPriced = points.find((point) => point.priceUsd !== null);
  const prices = points.map((point) => point.priceUsd).filter((price): price is number => price !== null);

  const stations: Station[] = ordered.map((event, index) => {
    const u = stationU[index];
    const { elevation, price } = elevationAt(days[index]);
    return {
      slug: event.slug,
      index,
      u,
      date: event.date,
      elevation,
      lateral: lateralAtU(u),
      priceUsd: price,
      category: event.category,
      significance: event.significance,
    };
  });

  return {
    points,
    stations,
    firstPricedU: firstPriced ? firstPriced.u : 0,
    span: { from: ordered[0].date, to: ordered[ordered.length - 1].date },
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
    logRange: { min: logFloor, max: logCeiling },
  };
}

/** Interpolate a point at an arbitrary position along the track. */
export function sampleTrack(track: Track, u: number): TrackPoint {
  const points = track.points;
  const clamped = clamp(u, 0, 1);
  const scaled = clamped * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  const t = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  // Do not turn the dense smooth price samples back into a polygonal rail.
  // Interpolate in log space with shared knot tangents, including flat extrema.
  const logA = Math.log10(a.priceUsd ?? b.priceUsd ?? 1);
  const logB = Math.log10(b.priceUsd ?? a.priceUsd ?? 1);
  const previous = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 2)];
  const delta = logB - logA;
  const left = previous.priceUsd === null ? 0 : logA - Math.log10(previous.priceUsd);
  const right = after.priceUsd === null ? 0 : Math.log10(after.priceUsd) - logB;
  const logPrice = hermite(logA, logB, monotoneSlope(left, delta), monotoneSlope(delta, right), t);
  const priceUsd = a.priceUsd === null && (b.priceUsd === null || t < 0.5) ? null : 10 ** logPrice;
  return {
    u: clamped,
    date: t < 0.5 ? a.date : b.date,
    priceUsd,
    elevation: priceUsd === null ? 0 : clamp((Math.log10(priceUsd) - track.logRange.min) / (track.logRange.max - track.logRange.min), 0, 1),
    lateral: lerp(a.lateral, b.lateral, t),
    grade: lerp(a.grade, b.grade, t),
    momentum: lerp(a.momentum, b.momentum, t),
  };
}

/**
 * Ride speed as a multiplier. Descents accelerate and climbs slow, clamped at both ends
 * so the ride is never nauseating and never stalls.
 */
export function speedAt(track: Track, u: number): number {
  const { grade } = sampleTrack(track, u);
  return clamp(1 - grade * GRADE_SENSITIVITY, MIN_SPEED, MAX_SPEED);
}

/** How long the ride holds at a station, in milliseconds, before moving on. */
export function dwellFor(significance: TrackEventInput["significance"]): number {
  if (significance === "landmark") return 9_000;
  if (significance === "major") return 7_000;
  return 5_500;
}

/** Decade gridlines ($1, $10, $100 …) that fall inside the track's range. */
export function priceGridlines(track: Track): { price: number; elevation: number }[] {
  const lines: { price: number; elevation: number }[] = [];
  const span = track.logRange.max - track.logRange.min;
  if (span <= 0) return lines;
  for (let exponent = Math.ceil(track.logRange.min); exponent <= Math.floor(track.logRange.max); exponent += 1) {
    lines.push({ price: 10 ** exponent, elevation: (exponent - track.logRange.min) / span });
  }
  return lines;
}

/** Year ticks along the track, for the time axis. */
export function yearTicks(track: Track, maxTicks = 12): { year: number; u: number }[] {
  const first = Number(track.span.from.slice(0, 4));
  const last = Number(track.span.to.slice(0, 4));
  const stride = Math.max(1, Math.ceil((last - first + 1) / maxTicks));
  const ticks: { year: number; u: number }[] = [];
  for (let year = first; year <= last; year += stride) {
    const target = `${year}-01-01`;
    const point = track.points.find((item) => item.date >= target);
    if (point) ticks.push({ year, u: point.u });
  }
  return ticks;
}

export const trackConstants = { MIN_SPEED, MAX_SPEED, PRICE_FLOOR, CATEGORY_LATERAL };
