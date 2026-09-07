import { useMemo } from "react";
import { sampleTrack, type Track } from "@/lib/track";
import type { RideTelemetry, RideView } from "@/lib/ride-path";
import { formatPrice } from "@/lib/palette";
import priceContext from "@/content/price-context.json";

export default function RideHUD({ track, telemetry, view, onView, stationaryDate }: {
  track: Track; telemetry: RideTelemetry | null; view: RideView; onView: (view: RideView) => void; stationaryDate: string;
}) {
  const line = useMemo(() => track.points.map((p, i) => `${i ? "L" : "M"}${(p.u * 300).toFixed(2)},${(76 - p.elevation * 68).toFixed(2)}`).join(" "), [track]);
  const u = telemetry?.u ?? track.stations[0].u;
  const point = sampleTrack(track, u);
  const effectiveView = view === "exhibit" && telemetry && !telemetry.arrived ? "seat" : view;
  const state = telemetry?.arrived ? "AT THE EXHIBIT" : telemetry?.phase === "paused" ? "PAUSED" : telemetry?.phase === "departing" ? "ACCELERATING" : telemetry?.phase === "braking" ? "BRAKING" : (telemetry?.grade ?? 0) > 0.04 ? "CLIMBING" : (telemetry?.grade ?? 0) < -0.04 ? "DESCENDING" : "ON THE TRACK";
  return <section className="ride-hud" aria-label="Ride camera and price context">
    <div className="ride-view-picker" role="group" aria-label="Camera view">
      {(["seat", "exhibit", "overview"] as const).map(option => <button type="button" key={option} onClick={() => onView(option)} aria-pressed={view === option}>
        {option === "seat" ? "Front seat" : option === "exhibit" ? "Auto / exhibits" : "Overhead"}
      </button>)}
    </div>
    <div className="ride-instruments">
      <div className="ride-live-price"><span>{telemetry?.arrived ? stationaryDate : telemetry?.date ?? track.span.from} <i /> {state}</span><strong>{point.priceUsd === null ? "Before price data" : formatPrice(point.priceUsd)}</strong></div>
      <svg viewBox="-2 0 304 84" role="img" aria-label="Entire ride elevation follows logarithmic Bitcoin price; the dot marks your position.">
        {[8, 42, 76].map(y => <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="white" strokeOpacity="0.1" />)}
        <path d={line} fill="none" stroke="#94b5bc" strokeWidth="1.5" />
        <line x1={u * 300} y1="0" x2={u * 300} y2="82" stroke="#ffbb63" strokeOpacity="0.4" />
        <circle cx={u * 300} cy={76 - point.elevation * 68} r="3.8" fill="#ffc476" />
      </svg>
      <div className="ride-chart-labels"><span>{track.span.from.slice(0, 4)}</span><span>LOG PRICE / BTC–USD</span><span>{track.span.to.slice(0, 4)}</span></div>
      <details className="ride-data-note"><summary>About the track data</summary><p>Height follows Coin Metrics monthly closing snapshots, smoothly interpolated in log space. It does not show daily extremes or an exact transaction-day quote. Horizontal time is compressed between chapters; sideways bends are scenic. Data through 23 August 2026. No recorded close: flat track.</p><a href={priceContext.source.request} target="_blank" rel="noreferrer">Coin Metrics source ↗</a></details>
    </div>
    <p className="orbit-hint">{effectiveView === "exhibit" ? "DRAG TO ORBIT · SCROLL TO ZOOM" : effectiveView === "overview" ? "THE MARKET, SEEN AS A LANDSCAPE" : "THE CLIMBS AND DROPS FOLLOW PRICE"}</p>
  </section>;
}
