"use client";

import { useEffect, useRef } from "react";
import type { PresentationEvent } from "@/lib/event-schema";
import type { Track } from "@/lib/track";
import type { RideTelemetry, RideView } from "@/lib/ride-path";
import { createRideScene, type RideScene } from "./rideScene";

type RideModeProps = {
  track: Track;
  events: PresentationEvent[];
  currentIndex: number;
  reducedMotion: boolean;
  comfort: boolean;
  playing: boolean;
  speed: number;
  view: RideView;
  onTelemetry: (value: RideTelemetry) => void;
  onArrive: () => void;
  /** Called when the scene cannot be created or cannot hold a usable frame rate. */
  onFallback: (reason: string) => void;
  /** Per-frame speed and grade at the camera, for the audio rig. */
  onMotion?: (speed: number, grade: number) => void;
};

/** Below this sustained frame time (ms) the ride drops quality, then gives up. */
const SLOW_FRAME_MS = 42;
const HOPELESS_FRAME_MS = 250;

export default function RideMode({
  track, events, currentIndex, reducedMotion, comfort, playing, speed, view, onTelemetry, onArrive, onFallback, onMotion,
}: RideModeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RideScene | null>(null);
  const stateRef = useRef({ currentIndex, comfort, playing, speed, view, onTelemetry, onArrive, onFallback, onMotion });
  useEffect(() => {
    stateRef.current = { currentIndex, comfort, playing, speed, view, onTelemetry, onArrive, onFallback, onMotion };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    let disposed = false;
    let scene: RideScene | null = null;
    let lastIndex = -1;
    let slowSince = 0;
    let lastTelemetry = 0;

    try {
      scene = createRideScene(
        canvas,
        track,
        events,
        {
          onArrive: () => stateRef.current.onArrive(),
          comfort,
          reducedMotion,
          // Start conservative on machines that report few cores.
          quality: (navigator.hardwareConcurrency ?? 8) <= 4 ? 0.55 : 1,
        },
      );
    } catch (error) {
      stateRef.current.onFallback(error instanceof Error ? error.message : "WebGL unavailable");
      return;
    }
    sceneRef.current = scene;

    const loop = (time: number) => {
      if (disposed || !scene) return;
      const state = stateRef.current;
      if (state.currentIndex !== lastIndex) {
        lastIndex = state.currentIndex;
        scene.setStation(lastIndex);
      }
      scene.setComfort(state.comfort);
      scene.setPlayback(state.playing, state.speed);
      scene.setView(state.view);
      try { scene.draw(time); }
      catch (error) {
        state.onFallback(error instanceof Error ? error.message : "3D rendering could not continue.");
        return;
      }
      if (state.onMotion) {
        const motion = scene.telemetry();
        state.onMotion(motion.velocity / 95, motion.grade);
      }
      if (time - lastTelemetry > 100) {
        state.onTelemetry(scene.telemetry());
        lastTelemetry = time;
      }

      // Watchdog: a ride that cannot hold a usable frame rate is worse than the rail.
      const mean = scene.frameTime();
      if (mean > SLOW_FRAME_MS) {
        if (!slowSince) slowSince = time;
        else if (time - slowSince > 4000) {
          if (scene.lowerQuality()) slowSince = time;
          else if (mean > HOPELESS_FRAME_MS && time - slowSince > 12000) {
            state.onFallback(`This device could not sustain the 3D ride (${Math.round(mean)}ms per frame).`);
            return;
          }
        }
      } else if (mean < SLOW_FRAME_MS) {
        slowSince = 0;
      }

      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    const observer = new ResizeObserver(() => scene?.resize());
    observer.observe(canvas);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stateRef.current.onFallback("The browser lost its WebGL graphics context.");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    // Dev-only hook, mirroring RailMode: paint one frame on demand so a headless check
    // can read pixels back without requestAnimationFrame. Stripped from production.
    if (process.env.NODE_ENV !== "production") {
      // One full loop iteration, not just a paint, so a forced frame reflects the
      // current station exactly as the running loop would.
      (window as unknown as { __rideDrawFrame?: (t?: number) => void }).__rideDrawFrame =
        (t = performance.now()) => {
          if (!scene) return;
          const state = stateRef.current;
          if (state.currentIndex !== lastIndex) {
            lastIndex = state.currentIndex;
            scene.setStation(lastIndex);
          }
          scene.setComfort(state.comfort);
          scene.setPlayback(state.playing, state.speed);
          scene.setView(state.view);
          scene.draw(t);
        };
      (window as unknown as { __rideDebug?: () => unknown }).__rideDebug = () => ({ ...scene?.telemetry(), ...scene?.debug(), frameTime: scene?.frameTime() });
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene?.dispose();
      sceneRef.current = null;
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as { __rideDrawFrame?: unknown }).__rideDrawFrame;
        delete (window as unknown as { __rideDebug?: unknown }).__rideDebug;
      }
    };
    // The scene is rebuilt only when the setlist itself changes; everything else is
    // pushed through refs so the render loop is never torn down mid-ride.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, events, reducedMotion]);

  const pointer = useRef<{ x: number; y: number } | null>(null);
  return <canvas ref={canvasRef} className="ride-canvas" tabIndex={0}
    aria-label="3D historical exhibit. Drag to orbit and scroll to zoom at a stop. Use arrow keys on this canvas to orbit, plus and minus to zoom."
    onPointerDown={event => { if (view !== "exhibit") return; pointer.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (!pointer.current) return; sceneRef.current?.orbit(event.clientX - pointer.current.x, event.clientY - pointer.current.y); pointer.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}
    onWheel={event => { if (view === "exhibit") sceneRef.current?.zoom(event.deltaY); }}
    onKeyDown={event => {
      if (view !== "exhibit") return;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
      if (moves[event.key]) { event.preventDefault(); event.stopPropagation(); sceneRef.current?.orbit(...moves[event.key]); }
      if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); sceneRef.current?.zoom(event.key === "-" ? 100 : -100); }
    }} />;
}
