"use client";

import { useEffect, useRef, useState } from "react";
import type { PresentationEvent } from "@/lib/event-schema";
import { categoryColors } from "@/lib/palette";

type State = "waiting" | "ready" | "unavailable";

/**
 * The event's ride exhibit, rendered in place. three.js and the exhibit builders load only
 * once the figure scrolls near the viewport, so readers who never reach it never pay.
 */
export default function ExhibitPreview({ event, rideHref }: { event: PresentationEvent; rideHref: string }) {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>("waiting");

  useEffect(() => {
    const figure = figureRef.current, canvas = canvasRef.current;
    if (!figure || !canvas) return;
    let disposed = false;
    let preview: { dispose: () => void } | undefined;
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      try {
        const { mountExhibitPreview } = await import("@/app/present/ride/exhibit-preview");
        if (disposed) return;
        preview = mountExhibitPreview(canvas, event, Number.parseInt(categoryColors[event.category].slice(1), 16));
        setState("ready");
      } catch {
        if (!disposed) setState("unavailable");
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(figure);
    return () => { disposed = true; observer.disconnect(); preview?.dispose(); };
  }, [event]);

  if (state === "unavailable") return null;
  return <figure ref={figureRef} className={`exhibit-preview is-${state}`}>
    <canvas ref={canvasRef} tabIndex={0} aria-label={`3D exhibit for “${event.title}”. Drag, or use the arrow keys, to look around.`} />
    <figcaption>
      <span>THE RIDE EXHIBIT · DRAG TO LOOK AROUND</span>
      <a href={rideHref}>Ride to this stop <span aria-hidden="true">→</span></a>
    </figcaption>
  </figure>;
}
