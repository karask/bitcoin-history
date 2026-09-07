"use client";

import { useEffect, useRef } from "react";
import type { CategoryId } from "@/lib/event-schema";
import { categoryColors, formatGridPrice, withAlpha } from "@/lib/palette";
import { priceGridlines, sampleTrack, speedAt, yearTicks, type Track } from "@/lib/track";

type RailModeProps = {
  track: Track;
  currentIndex: number;
  playing: boolean;
  reducedMotion: boolean;
  comfort: boolean;
  /** Fires once the camera has settled on the current station — the arrival beat. */
  onArrive?: () => void;
};

/** How much of the track fits across the viewport. Smaller means more zoomed in. */
const VIEW_SPAN = 0.17;
/** Where the vehicle sits horizontally. Kept right of the text panel so the current
 *  station is never hidden behind it, with the travelled track running out behind. */
const VEHICLE_X = 0.66;
const STAR_COUNT = 150;
/** Base time to travel one leg, before the grade speeds it up or slows it down. */
const TRAVEL_MS = 1900;

type Star = { x: number; y: number; depth: number; size: number };

function makeStars(): Star[] {
  // Deterministic so the field never reshuffles between renders.
  const stars: Star[] = [];
  let seed = 20090103;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let index = 0; index < STAR_COUNT; index += 1) {
    stars.push({ x: random(), y: random(), depth: 0.25 + random() * 0.75, size: random() < 0.86 ? 0.7 : 1.5 });
  }
  return stars;
}

export default function RailMode({
  track, currentIndex, playing, reducedMotion, comfort, onArrive,
}: RailModeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<number>(track.stations[0]?.u ?? 0);
  const starsRef = useRef<Star[]>(makeStars());
  const arrivedRef = useRef(false);
  const legRef = useRef({ from: 0, to: track.stations[0]?.u ?? 0, start: 0, duration: 0 });
  // Read through refs inside the loop so changing props never restarts the animation.
  const stateRef = useRef({ currentIndex, playing, reducedMotion, comfort, track, onArrive });
  useEffect(() => {
    stateRef.current = { currentIndex, playing, reducedMotion, comfort, track, onArrive };
  });

  useEffect(() => {
    arrivedRef.current = false;
  }, [currentIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;

    const draw = (time: number) => {
      const state = stateRef.current;

      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const activeTrack = state.track;
      const target = activeTrack.stations[state.currentIndex]?.u ?? 0;
      const leg = legRef.current;

      // Travel is timed per leg rather than per pixel, so pacing stays the same whether
      // the setlist has 20 stations or 275. The track's own grade sets the tempo:
      // speedAt returns >1 on descents and <1 on climbs.
      if (leg.to !== target) {
        const from = cameraRef.current;
        const factor = speedAt(activeTrack, (from + target) / 2);
        leg.from = from;
        leg.to = target;
        leg.start = time;
        leg.duration = Math.max(320, TRAVEL_MS / factor);
      }

      let progress = 1;
      if (state.reducedMotion) {
        cameraRef.current = target;
      } else if (leg.duration > 0) {
        progress = Math.min(1, (time - leg.start) / leg.duration);
        // Ease in and out so the vehicle leaves and arrives gently.
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - ((-2 * progress + 2) ** 3) / 2;
        cameraRef.current = leg.from + (leg.to - leg.from) * eased;
      }

      const settled = progress >= 1;
      if (settled) {
        cameraRef.current = target;
        if (!arrivedRef.current) {
          arrivedRef.current = true;
          state.onArrive?.();
        }
      }
      const view = { left: cameraRef.current - VIEW_SPAN * VEHICLE_X, span: VIEW_SPAN };
      const padTop = height * 0.16;
      const padBottom = height * 0.24;
      const plotHeight = Math.max(40, height - padTop - padBottom);

      const toX = (u: number) => ((u - view.left) / view.span) * width;
      const toY = (elevation: number) => padTop + (1 - elevation) * plotHeight;

      const current = activeTrack.stations[state.currentIndex];
      const accent = categoryColors[(current?.category ?? "origins") as CategoryId];
      const here = sampleTrack(activeTrack, cameraRef.current);

      // --- background -------------------------------------------------------
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#0a0a0c");
      sky.addColorStop(0.55, "#08070a");
      sky.addColorStop(1, "#0d0906");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const glow = context.createRadialGradient(
        width * VEHICLE_X, toY(here.elevation), 0,
        width * VEHICLE_X, toY(here.elevation), Math.max(width, height) * 0.55,
      );
      glow.addColorStop(0, withAlpha(accent, 0.13));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      // Stars drift with the camera at depth, giving parallax without motion sickness.
      for (const star of starsRef.current) {
        const drift = state.reducedMotion ? 0 : cameraRef.current * star.depth * 2.2;
        const x = (((star.x - drift) % 1) + 1) % 1 * width;
        context.beginPath();
        context.arc(x, star.y * height, star.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(241,238,230,${0.06 + star.depth * 0.16})`;
        context.fill();
      }

      // --- price gridlines --------------------------------------------------
      context.font = "9px ui-monospace, SFMono-Regular, monospace";
      context.textBaseline = "middle";
      for (const line of priceGridlines(activeTrack)) {
        const y = toY(line.elevation);
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.strokeStyle = "rgba(255,255,255,0.09)";
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = "rgba(203,197,187,0.78)";
        context.fillText(formatGridPrice(line.price), 12, y - 8);
      }

      // --- year ticks -------------------------------------------------------
      const axisY = padTop + plotHeight + 26;
      for (const tick of yearTicks(activeTrack, 60)) {
        const x = toX(tick.u);
        if (x < -40 || x > width + 40) continue;
        context.beginPath();
        context.moveTo(x, axisY - 6);
        context.lineTo(x, axisY);
        context.strokeStyle = "rgba(255,255,255,0.36)";
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = "rgba(216,210,200,0.9)";
        context.textAlign = "center";
        context.fillText(String(tick.year), x, axisY + 12);
      }
      context.textAlign = "left";

      // --- the rail ---------------------------------------------------------
      const visible = activeTrack.points.filter(
        (point) => point.u >= view.left - 0.02 && point.u <= view.left + view.span + 0.02,
      );

      if (visible.length > 1) {
        // Fill under the curve so the chart reads as terrain.
        context.beginPath();
        context.moveTo(toX(visible[0].u), toY(visible[0].elevation));
        for (const point of visible) context.lineTo(toX(point.u), toY(point.elevation));
        context.lineTo(toX(visible[visible.length - 1].u), height);
        context.lineTo(toX(visible[0].u), height);
        context.closePath();
        const terrain = context.createLinearGradient(0, padTop, 0, height);
        terrain.addColorStop(0, withAlpha(accent, 0.16));
        terrain.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = terrain;
        context.fill();

        // The rail itself, coloured segment by segment: red when falling, warm when climbing.
        context.lineWidth = 2.4;
        context.lineCap = "round";
        for (let index = 1; index < visible.length; index += 1) {
          const previous = visible[index - 1];
          const point = visible[index];
          const priced = point.priceUsd !== null;
          context.beginPath();
          context.moveTo(toX(previous.u), toY(previous.elevation));
          context.lineTo(toX(point.u), toY(point.elevation));
          if (!priced) {
            // The pre-price tunnel: there was no market, so there is no signal to draw.
            context.strokeStyle = "rgba(150,144,136,0.34)";
            context.setLineDash([4, 6]);
          } else {
            context.setLineDash([]);
            const heat = Math.max(-1, Math.min(1, point.momentum * 4));
            context.strokeStyle = heat < 0
              ? `rgba(255,${Math.round(150 + heat * 60)},${Math.round(110 + heat * 50)},0.92)`
              : `rgba(255,${Math.round(190 - heat * 20)},${Math.round(120 + heat * 90)},0.92)`;
          }
          context.stroke();
        }
        context.setLineDash([]);

        // Glow pass over the rail.
        context.beginPath();
        context.moveTo(toX(visible[0].u), toY(visible[0].elevation));
        for (const point of visible) context.lineTo(toX(point.u), toY(point.elevation));
        context.strokeStyle = withAlpha(accent, 0.28);
        context.lineWidth = 8;
        context.shadowBlur = 26;
        context.shadowColor = accent;
        context.stroke();
        context.shadowBlur = 0;
      }

      // --- stations ---------------------------------------------------------
      for (const station of activeTrack.stations) {
        const x = toX(station.u);
        if (x < -80 || x > width + 80) continue;
        const y = toY(station.elevation);
        const isCurrent = station.index === state.currentIndex;
        const isPast = station.index < state.currentIndex;
        const colour = categoryColors[station.category as CategoryId] ?? accent;
        const radius = station.significance === "landmark" ? 7 : station.significance === "major" ? 5 : 3.5;

        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, padTop + plotHeight + 8);
        context.strokeStyle = withAlpha(colour, isCurrent ? 0.4 : 0.1);
        context.lineWidth = 1;
        context.stroke();

        if (isCurrent) {
          const pulse = state.reducedMotion ? 1 : 1 + Math.sin(time * 0.004) * 0.16;
          context.beginPath();
          context.arc(x, y, radius * 3.1 * pulse, 0, Math.PI * 2);
          context.fillStyle = withAlpha(colour, 0.16);
          context.fill();
        }

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = isCurrent ? "#fffaf0" : isPast ? withAlpha(colour, 0.85) : withAlpha(colour, 0.4);
        context.fill();
        context.lineWidth = isCurrent ? 2.5 : 1.2;
        context.strokeStyle = isCurrent ? colour : withAlpha(colour, 0.55);
        context.stroke();
      }

      // --- the vehicle ------------------------------------------------------
      const vehicleX = width * VEHICLE_X;
      const vehicleY = toY(here.elevation);
      const bank = state.comfort ? 0 : Math.atan(-here.grade * 0.55);
      context.save();
      context.translate(vehicleX, vehicleY);
      context.rotate(bank);
      context.beginPath();
      context.roundRect(-13, -5, 26, 10, 5);
      context.fillStyle = "#fffaf0";
      context.shadowBlur = 22;
      context.shadowColor = accent;
      context.fill();
      context.restore();
      context.shadowBlur = 0;

      // Motion streaks only while genuinely travelling.
      if (!settled && !state.reducedMotion && !state.comfort) {
        // Strongest mid-leg, tapering as the vehicle eases into the station.
        const intensity = Math.sin(progress * Math.PI);
        for (let index = 0; index < 7; index += 1) {
          const offset = 22 + index * 15;
          context.beginPath();
          context.moveTo(vehicleX - offset, vehicleY + (index - 3) * 3);
          context.lineTo(vehicleX - offset - 18 * intensity, vehicleY + (index - 3) * 3);
          context.strokeStyle = `rgba(255,250,240,${0.06 * intensity})`;
          context.lineWidth = 1.4;
          context.stroke();
        }
      }

      // --- the tunnel label -------------------------------------------------
      if (here.priceUsd === null) {
        context.fillStyle = "rgba(203,197,187,0.78)";
        context.font = "10px ui-monospace, SFMono-Regular, monospace";
        context.fillText("NO MARKET YET — BITCOIN HAD NO PRICE HERE", vehicleX - 12, vehicleY - 26);
      }

    };

    const loop = (time: number) => {
      draw(time);
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);

    // Dev-only hook: lets a headless check paint one frame and read the pixels back
    // without depending on requestAnimationFrame, which browsers throttle when the
    // page is not being composited. Stripped from production builds.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __railDrawFrame?: (t?: number) => void }).__railDrawFrame =
        (t = performance.now()) => draw(t);
    }
    // The loop re-reads the element size each frame, so a resize needs no extra handling
    // beyond keeping the observer alive to trigger layout.
    const observer = new ResizeObserver(() => {});
    observer.observe(canvas);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as { __railDrawFrame?: unknown }).__railDrawFrame;
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="rail-canvas" aria-hidden="true" />;
}
