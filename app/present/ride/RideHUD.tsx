import { useMemo } from "react";
import { sampleTrack, type Track } from "@/lib/track";
import type { RideTelemetry, RideView } from "@/lib/ride-path";
import priceContext from "@/content/price-context.json";
import { priceOnDate, formatDailyPrice } from "@/lib/prices";
import { formatEventRange, type PresentationEvent } from "@/lib/event-schema";
import { CAMERA_VIEWS } from "../RideSettings";

export default function RideHUD({ track, telemetry, view, onView, event }: {
  track: Track; telemetry: RideTelemetry | null; view: RideView; onView: (view: RideView) => void; event: PresentationEvent;
}) {
  const line = useMemo(() => track.points.map((p, i) => `${i ? "L" : "M"}${(p.u * 300).toFixed(2)},${(52 - p.elevation * 46).toFixed(2)}`).join(" "), [track]);
  const u = telemetry?.u ?? track.stations[0].u;
  const point = sampleTrack(track, u);
  const atEvent = !telemetry || telemetry.arrived;
  const date = atEvent ? event.date : telemetry.date;
  const price = atEvent ? event.priceUsd : priceOnDate(priceContext.values, date);
  const milestone = atEvent ? event.priceMilestone : undefined;
  const effectiveView = view === "exhibit" && telemetry && !telemetry.arrived ? "seat" : view;
  const state = telemetry?.arrived ? "AT THE EXHIBIT" : telemetry?.phase === "paused" ? "PAUSED" : telemetry?.phase === "departing" ? "ACCELERATING" : telemetry?.phase === "braking" ? "BRAKING" : (telemetry?.grade ?? 0) > 0.04 ? "CLIMBING" : (telemetry?.grade ?? 0) < -0.04 ? "DESCENDING" : "ON THE TRACK";
  return <section className="ride-hud" aria-label="Ride camera and price context">
    <div className="ride-view-picker" role="group" aria-label="Camera view">
      {CAMERA_VIEWS.map(option => <button type="button" key={option.id} onClick={() => onView(option.id)} aria-pressed={view === option.id} title={option.title}>
        {option.label}
      </button>)}
    </div>
    <div className="ride-instruments">
      <p className="ride-status"><span>{atEvent ? formatEventRange(event) : date}</span><i aria-hidden="true" /><span>{state}</span></p>
      <p className="ride-price">
        {price !== null ? <strong>{formatDailyPrice(price)}</strong> : <strong className="is-empty">No daily price</strong>}
        <small>BTC / USD · DAILY · 00:00 UTC</small>
      </p>
      {milestone && <a className="ride-price-milestone" href={milestone.source.url} target="_blank" rel="noreferrer"><b>{milestone.approximate ? "≈ " : ""}{formatDailyPrice(milestone.usd)}</b> · {milestone.label} ↗</a>}
      <svg viewBox="-2 0 304 58" role="img" aria-label="Ride elevation follows a smoothed logarithmic Bitcoin price trend; the dot marks your position.">
        <path d={line} fill="none" stroke="#94b5bc" strokeWidth="1.5" />
        <line x1={u * 300} y1="0" x2={u * 300} y2="56" stroke="#ffbb63" strokeOpacity="0.4" />
        <circle cx={u * 300} cy={52 - point.elevation * 46} r="3.8" fill="#ffc476" />
      </svg>
      <div className="ride-chart-labels"><span>{track.span.from.slice(0, 4)}</span><span>SMOOTHED PRICE TREND</span><span>{track.span.to.slice(0, 4)}</span></div>
    </div>
    <p className="orbit-hint">{effectiveView === "exhibit"
      ? <><span className="hint-pointer">Drag to look around · scroll to zoom</span><span className="hint-touch">Drag to look around · pinch to zoom</span></>
      : effectiveView === "overview" ? "The market, seen as a landscape" : "The climbs and drops follow price"}</p>
  </section>;
}
