"use client";

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  categoryLabels,
  formatEventRange,
  kindLabels,
  categoryIds,
  kindIds,
  type CategoryId,
  type PresentationEvent,
} from "@/lib/event-schema";
import { categoryColors, districtNames, formatPrice } from "@/lib/palette";
import { buildTrack, dwellFor, type Track } from "@/lib/track";
import { createRideAudio, type RideAudio } from "./ride/audio";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import priceContext from "@/content/price-context.json";
import RailMode from "./RailMode";
import RideHUD from "./ride/RideHUD";
import type { RideTelemetry, RideView } from "@/lib/ride-path";
import { sitePath } from "@/lib/site-path";
import { matchesPlace } from "@/lib/places";

// three.js only downloads if someone actually enters the ride, so the archive pages and
// the Reader fallback never pay for it.
const RideMode = lazy(() => import("./ride/RideMode"));
import "./present.css";

type SetlistOption = { id: string; title: string; kicker: string; tagline: string; eventSlugs: string[] };

type PresentationExperienceProps = {
  events: PresentationEvent[];
  allEvents: PresentationEvent[];
  returnHref: string;
  setlistId: string;
  setlistTitle: string;
  setlistKicker: string;
  setlistTagline: string;
  setlistOptions: SetlistOption[];
};

/** Reader is the former Rail: a 2D price chart with the full reading panel. */
type PresentationMode = "ride" | "reader";

const SPEEDS = [0.75, 1, 1.5] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getYear(event: PresentationEvent) {
  return event.date.slice(0, 4);
}

export default function PresentationExperience({
  events: initialEvents,
  allEvents,
  returnHref: initialReturnHref,
  setlistId: initialSetlistId,
  setlistTitle: initialSetlistTitle,
  setlistKicker: initialSetlistKicker,
  setlistTagline: initialSetlistTagline,
  setlistOptions,
}: PresentationExperienceProps) {
  // Must be hydration-safe: it decides the mode, which is on the shell's className.
  const reducedMotion = usePrefersReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<RideAudio | null>(null);
  const queryAppliedRef = useRef(false);
  const detailRef = useRef<HTMLDialogElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rideView, setRideView] = useState<RideView>("exhibit");
  const [telemetry, setTelemetry] = useState<RideTelemetry | null>(null);
  const [journey, setJourney] = useState(() => ({ events: initialEvents, returnHref: initialReturnHref,
    setlistId: initialSetlistId, setlistTitle: initialSetlistTitle, setlistKicker: initialSetlistKicker, setlistTagline: initialSetlistTagline }));
  const { events, returnHref, setlistId, setlistTitle, setlistKicker, setlistTagline } = journey;

  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [volume, setVolume] = useState(70);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Ride is always the default; reduced-motion preferences enable Comfort instead.
  const [modeChoice, setModeChoice] = useState<PresentationMode | null>(null);
  const [comfortChoice, setComfortChoice] = useState<boolean | null>(null);
  /** False while the vehicle is travelling. The panel only reads once it has settled. */
  const [railArrived, setRailArrived] = useState(true);
  /** Set when WebGL is missing or the ride cannot hold a usable frame rate. */
  const [rideUnavailable, setRideUnavailable] = useState<string | null>(null);

  const requested = modeChoice ?? "ride";
  const mode: PresentationMode = requested === "ride" && rideUnavailable ? "reader" : requested;
  const comfort = comfortChoice ?? reducedMotion;
  const arrived = railArrived;

  const onFallback = useCallback((reason: string) => {
    setRideUnavailable(reason);
    setRailArrived(true);
  }, []);

  const eventCount = events.length;
  const safeIndex = clamp(currentIndex, 0, Math.max(0, eventCount - 1));
  const currentEvent = events[safeIndex];
  const previousEvent = safeIndex > 0 ? events[safeIndex - 1] : null;
  const nextEvent = safeIndex < eventCount - 1 ? events[safeIndex + 1] : null;

  const track: Track | null = useMemo(() => {
    if (!events.length) return null;
    return buildTrack(
      events.map((event) => ({
        slug: event.slug,
        date: event.date,
        category: event.category,
        significance: event.significance,
        kind: event.kind,
      })),
      priceContext.values as Record<string, number>,
      { resolution: 2400, pacingBlend: 0.82, lastObservationDate: priceContext.source.coverage.match(/through (\d{4}-\d{2}-\d{2})/)?.[1] },
    );
  }, [events]);

  const accent = currentEvent ? categoryColors[currentEvent.category] : categoryColors.origins;
  const sceneStyle = { "--scene-accent": accent } as CSSProperties;

  useEffect(() => {
    if (queryAppliedRef.current || allEvents.length === 0) return;
    queryAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const option = setlistOptions.find(item => item.id === params.get("setlist")) ?? setlistOptions.find(item => item.id === initialSetlistId)!;
    let selected: PresentationEvent[];
    let title = option.title, kicker = option.kicker, tagline = option.tagline, id = option.id;
    if (params.get("setlist") === "filtered") {
      const ids = (value: string | null, allowed: readonly string[]) => (value?.split(",") ?? []).filter(item => allowed.includes(item));
      const categories = ids(params.get("cat"), categoryIds), kinds = ids(params.get("kind"), kindIds);
      const term = params.get("q")?.trim().toLocaleLowerCase() ?? "";
      const from = Number(params.get("from")) || Number(allEvents[0].date.slice(0, 4));
      const to = Number(params.get("to")) || Number(allEvents.at(-1)!.date.slice(0, 4));
      selected = allEvents.filter(event => {
        const haystack = [event.title, event.summary, ...event.tags, ...event.actors].join(" ").toLocaleLowerCase();
        return (params.get("scope") === "all" || event.curated)
          && (!categories.length || categories.some(category => event.categories.includes(category as typeof event.category)))
          && (!kinds.length || kinds.includes(event.kind)) && (!term || haystack.includes(term))
          && Number(event.date.slice(0, 4)) >= from && Number(event.date.slice(0, 4)) <= to
          && matchesPlace(event.places, params.get("place") ?? "all")
          && (!params.get("sig") || params.get("sig") === "all" || event.significance === params.get("sig"))
          && (!params.get("domain") || params.get("domain") === "all" || event.scope === params.get("domain"))
          && (!params.get("evidence") || params.get("evidence") === "all" || event.evidence === params.get("evidence"));
      }).sort((a, b) => ({ landmark: 0, major: 1, context: 2 }[a.significance] - { landmark: 0, major: 1, context: 2 }[b.significance]))
        .slice(0, 24).sort((a, b) => a.date.localeCompare(b.date));
      id = "filtered"; title = "Your Filter"; kicker = "THE CURRENT SELECTION";
      tagline = "Every event matching the filters you left set on the archive.";
    } else selected = option.eventSlugs.map(slug => allEvents.find(event => event.slug === slug)).filter((event): event is PresentationEvent => Boolean(event));
    const slug = params.get("event"), requested = slug ? allEvents.find(event => event.slug === slug) : undefined;
    if (requested && !selected.some(event => event.slug === requested.slug)) selected = [...selected, requested].sort((a, b) => a.date.localeCompare(b.date));
    const returnParams = new URLSearchParams();
    for (const key of ["scope", "cat", "kind", "q", "from", "to", "place", "sig", "domain", "evidence"]) {
      const value = params.get(key); if (value && !(key === "scope" && value === "curated")) returnParams.set(key, value);
    }
    const returnHref = requested && !params.has("setlist") ? `/events/${requested.slug}` : `/${returnParams.size ? `?${returnParams}` : ""}#events`;
    setJourney({ events: selected, returnHref, setlistId: id, setlistTitle: title, setlistKicker: kicker, setlistTagline: tagline });
    const requestedIndex = requested ? selected.findIndex(event => event.slug === requested.slug) : 0;
    const animationFrame = window.requestAnimationFrame(() => setCurrentIndex(Math.max(0, requestedIndex)));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [allEvents, initialSetlistId, setlistOptions]);

  useEffect(() => {
    if (!started || !currentEvent) return;
    const url = new URL(window.location.href);
    url.searchParams.set("event", currentEvent.slug);
    window.history.replaceState(window.history.state, "", url);
  }, [currentEvent, started]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const goTo = useCallback((requestedIndex: number) => {
    if (eventCount === 0) return;
    const destination = clamp(requestedIndex, 0, eventCount - 1);
    if (destination === safeIndex) return;
    setCurrentIndex(destination);
    setRailArrived(false);
  }, [eventCount, safeIndex]);

  // The panel is gated on arrival, so a rail loop that never runs — a backgrounded tab,
  // a canvas that failed — must not withhold the text indefinitely. Release it regardless.
  useEffect(() => {
    if (railArrived || mode === "ride") return;
    const timer = window.setTimeout(() => setRailArrived(true), 4_000);
    return () => window.clearTimeout(timer);
  }, [railArrived, safeIndex, mode]);

  useEffect(() => {
    if (detailsOpen) detailRef.current?.showModal();
    else detailRef.current?.close();
  }, [detailsOpen]);

  // Arrival contract: the dwell clock starts only once the vehicle has stopped.
  useEffect(() => {
    if (!started || !playing || !arrived || eventCount < 2) return;
    if (safeIndex >= eventCount - 1) {
      const finish = window.setTimeout(() => setPlaying(false), 0);
      return () => window.clearTimeout(finish);
    }
    const dwell = dwellFor(events[safeIndex].significance) / speed;
    const timer = window.setTimeout(() => goTo(safeIndex + 1), dwell);
    return () => window.clearTimeout(timer);
  }, [arrived, eventCount, events, goTo, playing, safeIndex, speed, started]);

  const togglePlay = useCallback(() => {
    if (eventCount < 2) return;
    if (!playing && safeIndex === eventCount - 1) goTo(0);
    setPlaying((value) => !value);
  }, [eventCount, goTo, playing, safeIndex]);

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (detailsOpen) return;
      const target = event.target as HTMLElement | null;
      const isFormField = target?.matches("input, select, textarea, [contenteditable='true']");
      const isButtonOrLink = target?.matches("button, a");

      if (event.key === "Escape") {
        if (detailsOpen) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else window.location.assign(sitePath(returnHref));
        return;
      }
      if (isFormField) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(safeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(safeIndex + 1);
      } else if (event.key.toLowerCase() === "c") {
        setComfortChoice((value) => !(value ?? reducedMotion));
      } else if (event.code === "Space") {
        if (isButtonOrLink) return;
        event.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailsOpen, goTo, reducedMotion, returnHref, safeIndex, started, togglePlay]);

  useEffect(() => () => {
    audioRef.current?.dispose();
    audioRef.current = null;
  }, []);

  // The bed follows the district you are in, whether or not sound is on, so enabling it
  // mid-ride does not jump to the wrong key.
  useEffect(() => {
    if (currentEvent) audioRef.current?.setDistrict(currentEvent.category);
  }, [currentEvent]);

  // Chime on arrival.
  useEffect(() => {
    if (arrived && started && currentEvent) {
      audioRef.current?.arrive(currentEvent.category, currentEvent.significance);
    }
  }, [arrived, currentEvent, started]);

  const onMotion = useCallback((speed: number, grade: number) => {
    audioRef.current?.setMotion(speed, grade);
  }, []);

  /**
   * A postcard from the current station: the frame as rendered, captioned with the
   * record it belongs to so the image stays attributable once it leaves the site.
   */
  const savePostcard = useCallback(() => {
    const source = shellRef.current?.querySelector<HTMLCanvasElement>("canvas.ride-canvas, canvas.rail-canvas");
    if (!source || !currentEvent) return;
    const width = 1600;
    const height = Math.round((source.height / source.width) * width);
    const caption = 190;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height + caption;
    const context = out.getContext("2d");
    if (!context) return;

    context.fillStyle = "#08070a";
    context.fillRect(0, 0, out.width, out.height);
    context.drawImage(source, 0, 0, width, height);

    context.fillStyle = "#0b0a0c";
    context.fillRect(0, height, width, caption);
    context.fillStyle = accent;
    context.fillRect(0, height, width, 2);

    context.fillStyle = accent;
    context.font = '500 22px ui-monospace, SFMono-Regular, monospace';
    context.fillText(formatEventRange(currentEvent).toUpperCase(), 54, height + 52);

    context.fillStyle = "#f1eee6";
    context.font = '400 46px Georgia, "Times New Roman", serif';
    const title = currentEvent.title.length > 58 ? `${currentEvent.title.slice(0, 57)}…` : currentEvent.title;
    context.fillText(title, 54, height + 108);

    context.fillStyle = "#8f887d";
    context.font = '400 20px ui-monospace, SFMono-Regular, monospace';
    const altitudeText = currentEvent.priceUsd === null ? "NO MARKET YET" : `BTC ${formatPrice(currentEvent.priceUsd)}`;
    context.fillText(`${altitudeText}   ·   ${districtNames[currentEvent.category].toUpperCase()}   ·   BITCOIN TIMECHAIN`, 54, height + 152);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `timechain-${currentEvent.slug}.png`;
      link.click();
      // Revoke on the next tick so the download has started.
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }, [accent, currentEvent]);

  const startJourney = () => {
    setStarted(true);
    setPlaying(eventCount > 1);
    window.requestAnimationFrame(() => playButtonRef.current?.focus());
  };

  const enableSound = async (next: boolean, test = false) => {
    if (audioBusy) return;
    setAudioBusy(true);
    setAudioUnavailable(null);
    try {
      // Created on the gesture, never before: browsers require it and so does courtesy.
      if (!audioRef.current) {
        audioRef.current = createRideAudio(() => {
          setSoundEnabled(false);
          setAudioUnavailable("Audio was interrupted. Click Sound to resume it.");
        });
        if (currentEvent) audioRef.current.setDistrict(currentEvent.category);
      }
      audioRef.current.setVolume(volume / 100);
      await audioRef.current.setEnabled(next);
      if (test && soundEnabled) audioRef.current.testTone();
      setSoundEnabled(audioRef.current.isEnabled());
    } catch (error) {
      audioRef.current?.dispose();
      audioRef.current = null;
      setAudioUnavailable(error instanceof Error ? error.message : "Audio could not start. Click Sound to retry.");
      setSoundEnabled(false);
    } finally {
      setAudioBusy(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!shellRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await shellRef.current.requestFullscreen();
    } catch {
      // Fullscreen can be denied by the browser; the fixed presentation remains usable.
    }
  };

  const onArrive = useCallback(() => setRailArrived(true), []);

  const panelMotion = useMemo(() => {
    if (reducedMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.16 },
      };
    }
    return {
      initial: { opacity: 0, y: 22, filter: "blur(7px)" },
      animate: { opacity: 1, y: 0, filter: "blur(0px)" },
      exit: { opacity: 0, y: -14, filter: "blur(5px)" },
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    };
  }, [reducedMotion]);

  if (!currentEvent || !track) {
    return (
      <div className="presentation-shell presentation-shell--empty">
        <div className="empty-state">
          <p className="micro-label">BITCOIN TIMECHAIN / PRESENTATION</p>
          <h1>No chapters match this journey.</h1>
          <p>Return to the archive and choose a broader set of events.</p>
          <Link className="primary-action" href={sitePath(returnHref)}>Return to the timeline</Link>
        </div>
      </div>
    );
  }

  const district = districtNames[currentEvent.category as CategoryId];

  return (
    <div
      ref={shellRef}
      className={`presentation-shell mode-${mode}${started ? " is-started" : ""}${arrived ? " is-arrived" : " is-travelling"}`}
      style={sceneStyle}
    >
      {started && mode === "ride" && (
        <Suspense fallback={<div className="reader-backdrop" aria-hidden="true" />}>
          <RideMode
            track={track}
            events={events}
            currentIndex={safeIndex}
            reducedMotion={reducedMotion}
            comfort={comfort}
            playing={playing}
            speed={speed}
            view={rideView}
            onTelemetry={setTelemetry}
            onArrive={onArrive}
            onFallback={onFallback}
            onMotion={onMotion}
          />
        </Suspense>
      )}
      {started && mode === "reader" && (
        <RailMode
          track={track}
          currentIndex={safeIndex}
          playing={playing}
          reducedMotion={reducedMotion}
          comfort={comfort}
          onArrive={onArrive}
        />
      )}
      {!started && <div className="reader-backdrop" aria-hidden="true" />}
      <div className="presentation-vignette" aria-hidden="true" />

      <AnimatePresence>
        {!started && (
          <motion.section
            className="launch-screen"
            aria-labelledby="launch-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 1.025 }}
            transition={{ duration: reducedMotion ? 0.12 : 0.65 }}
          >
            <div className="launch-topline">
              <span className="timechain-mark"><b>₿</b> BITCOIN TIMECHAIN</span>
              <Link href={sitePath(returnHref)} className="text-link">EXIT TO ARCHIVE <span aria-hidden="true">↗</span></Link>
            </div>

            <div className="launch-copy">
              <p className="micro-label">{setlistKicker || "A GUIDED JOURNEY"} / {eventCount} CHAPTERS</p>
              <h1 id="launch-title">{setlistTitle}</h1>
              <p className="launch-deck">{setlistTagline}</p>

              <p className="launch-premise">
                Board a front-seat roller coaster shaped by Bitcoin’s price. Climb the rallies,
                descend through bear markets, then stop inside detailed 3D historical exhibits.
                Drag to look around. Zoom out to see the track.
              </p>

              <button className="start-button" type="button" onClick={startJourney}>
                <span className="start-icon" aria-hidden="true">▶</span>
                <span>
                  <small>BEGIN AT {getYear(currentEvent)}</small>
                  Enter the Timechain
                </span>
              </button>
              <p className="launch-note">
                Sound remains off until you choose to enable it.
                {" Track: interpolated monthly closes on a logarithmic scale, not daily or live prices."}
                {reducedMotion && " Comfort starts on for your reduced-motion preference. Ride still travels; choose Reader for the calmer 2D view."}
              </p>

              <nav className="setlist-picker" aria-label="Choose a different show">
                <span className="micro-label">OR RIDE SOMETHING ELSE</span>
                <ul>
                  {setlistOptions.filter((option) => option.id !== setlistId).map((option) => (
                    <li key={option.id}>
                      <Link href={sitePath(`/present?setlist=${option.id}`)}>
                        <strong>{option.title}</strong>
                        <small>{option.kicker}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="launch-footer" aria-hidden="true">
              <span>{getYear(events[0])}</span>
              <i />
              <span>{getYear(events[eventCount - 1])}</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {started && (
        <>
          <header className="presentation-chrome">
            <Link className="exit-button" href={sitePath(returnHref)} aria-label="Exit presentation and return to the archive">
              <span aria-hidden="true">←</span><span>EXIT</span>
            </Link>
            <div className="chrome-brand" aria-label="Bitcoin Timechain presentation">
              <b>₿</b><span>{setlistTitle}</span>
            </div>
            <p className="chapter-readout">
              CHAPTER <strong>{String(safeIndex + 1).padStart(2, "0")}</strong>
              <span>/</span>{String(eventCount).padStart(2, "0")}
            </p>
          </header>

          {mode === "ride" && <RideHUD track={track} telemetry={telemetry} view={rideView} onView={setRideView} stationaryDate={formatEventRange(currentEvent)} />}
          {rideUnavailable && <p className="ride-fallback" role="status">3D is unavailable on this device. Reader shows the 2D chart and historical records.</p>}

          <main className="presentation-stage">
            <AnimatePresence mode="wait" initial={false}>
              {arrived && (
                <motion.article
                  key={currentEvent.slug}
                  className="station-panel"
                  aria-labelledby={`scene-${currentEvent.slug}`}
                  aria-live="polite"
                  {...panelMotion}
                >
                  <p className="scene-kicker">
                    <span>{district}</span>
                    <span>{categoryLabels[currentEvent.category]}</span>
                    <span>{kindLabels[currentEvent.kind]}</span>
                  </p>
                  <time dateTime={currentEvent.date}>{formatEventRange(currentEvent)}</time>
                  <h1 id={`scene-${currentEvent.slug}`}>{currentEvent.title}</h1>
                  <p className="scene-summary">{currentEvent.summary}</p>
                  {mode === "ride" && <button className="read-exhibit" type="button" onClick={() => { setPlaying(false); setDetailsOpen(true); }}>Read the story & sources <span aria-hidden="true">↗</span></button>}
                  <div className="scene-context">
                    <div>
                      <span className="context-label">WHY IT MATTERS</span>
                      <p>{currentEvent.whyItMatters}</p>
                    </div>
                    <Link href={sitePath(`/events/${currentEvent.slug}`)} className="event-link">
                      OPEN THE RECORD <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                  <div className="scene-readout">
                    <span><b>MONTHLY PRICE CONTEXT</b>{currentEvent.priceUsd === null ? "no quote in series" : formatPrice(currentEvent.priceUsd)}</span>
                    <span><b>EVIDENCE</b>{currentEvent.evidence.replace("-", " ")}</span>
                    {currentEvent.blockHeight !== undefined && (
                      <span><b>BLOCK</b>{currentEvent.blockHeight.toLocaleString("en-US")}</span>
                    )}
                  </div>
                </motion.article>
              )}
            </AnimatePresence>

            {!arrived && (
              <p className="approach-readout" aria-hidden="true">
                <i /> APPROACHING {getYear(currentEvent)} — {currentEvent.title}
              </p>
            )}
          </main>

          <dialog ref={detailRef} className="exhibit-dialog" onCancel={() => setDetailsOpen(false)} onClose={() => setDetailsOpen(false)} aria-labelledby="exhibit-story-title">
            <button className="close-exhibit" type="button" onClick={() => setDetailsOpen(false)} aria-label="Close historical record">Close ×</button>
            <p className="micro-label">{formatEventRange(currentEvent)} / {currentEvent.evidence}</p>
            <h2 id="exhibit-story-title">{currentEvent.title}</h2>
            <p>{currentEvent.details}</p>
            <h3>Why it matters</h3><p>{currentEvent.whyItMatters}</p>
            {currentEvent.technicalNote && <><h3>Technical context</h3><p>{currentEvent.technicalNote}</p></>}
            {!!currentEvent.actors.length && <p className="exhibit-actors">People & organizations: {currentEvent.actors.join(", ")}</p>}
            <h3>Sources</h3>
            <ul>{currentEvent.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><small>{source.publisher} · {source.type}</small></li>)}</ul>
            <p className="exhibit-disclaimer">The 3D scene is an interpretive exhibit, not a reconstruction of an actual room or building. The record and linked sources document the historical event.</p>
          </dialog>

          <footer className="presentation-controls" aria-label="Presentation controls">
            <div className="transport-controls">
              <button
                type="button"
                className="round-control"
                onClick={() => goTo(safeIndex - 1)}
                disabled={!previousEvent}
                aria-label="Previous chapter"
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                ref={playButtonRef}
                type="button"
                className="round-control play-control"
                onClick={togglePlay}
                aria-label={playing ? "Pause presentation" : safeIndex === eventCount - 1 ? "Replay presentation" : "Play presentation"}
              >
                <span aria-hidden="true">{playing ? "Ⅱ" : safeIndex === eventCount - 1 ? "↻" : "▶"}</span>
              </button>
              <button
                type="button"
                className="round-control"
                onClick={() => goTo(safeIndex + 1)}
                disabled={!nextEvent}
                aria-label="Next chapter"
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>

            <div className="chapter-scrubber">
              <div className="scrubber-labels">
                <span>{getYear(events[0])}</span>
                <strong>{currentEvent.title}</strong>
                <span>{getYear(events[eventCount - 1])}</span>
              </div>
              <div className="range-wrap">
                <div className="range-progress" style={{ width: `${eventCount > 1 ? (safeIndex / (eventCount - 1)) * 100 : 100}%` }} />
                <div className="range-markers" aria-hidden="true">
                  {events.map((event) => (
                    <i key={event.slug} className={`marker-${event.significance}`} />
                  ))}
                </div>
                <input
                  className="progress-range"
                  type="range"
                  min={0}
                  max={Math.max(0, eventCount - 1)}
                  step={1}
                  value={safeIndex}
                  onChange={(event) => goTo(Number(event.currentTarget.value))}
                  aria-label="Choose a presentation chapter"
                  aria-valuetext={`${safeIndex + 1} of ${eventCount}: ${currentEvent.title}`}
                />
              </div>
            </div>

            <div className="utility-controls">
              <div className="mode-control" role="group" aria-label="Presentation mode">
                <button
                  type="button"
                  className={mode === "ride" ? "is-active" : ""}
                  onClick={() => setModeChoice("ride")}
                  aria-pressed={mode === "ride"}
                  disabled={Boolean(rideUnavailable)}
                  title={rideUnavailable ? `3D unavailable: ${rideUnavailable}` : undefined}
                >
                  RIDE
                </button>
                <button
                  type="button"
                  className={mode === "reader" ? "is-active" : ""}
                  onClick={() => setModeChoice("reader")}
                  aria-pressed={mode === "reader"}
                >
                  READER
                </button>
              </div>
              <div className="speed-control" role="group" aria-label="Playback speed">
                {SPEEDS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={speed === option ? "is-active" : ""}
                    onClick={() => setSpeed(option)}
                    aria-pressed={speed === option}
                  >
                    {option}×
                  </button>
                ))}
              </div>
              <div className="comfort-control">
              <button
                type="button"
                className={`utility-button${comfort ? " is-active" : ""}`}
                onClick={() => setComfortChoice(!comfort)}
                aria-pressed={comfort}
                aria-label={comfort ? "Turn comfort mode off" : "Turn comfort mode on"}
                aria-describedby="comfort-explanation"
                title="Comfort steadies the camera: no banking or speed zoom. The ride still accelerates and brakes."
              >
                <span>{comfort ? "COMFORT ON" : "COMFORT OFF"}</span>
              </button>
              <p id="comfort-explanation" role="tooltip">Comfort ON steadies the camera: no banking or speed-related zoom. OFF adds those coaster effects. Travel still accelerates and brakes in either setting.</p>
              </div>
              <button
                type="button"
                className={`utility-button${soundEnabled ? " is-active" : ""}`}
                onClick={() => void enableSound(!soundEnabled)}
                disabled={audioBusy}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? "Turn ambient sound off" : "Turn ambient sound on"}
              >
                <span className="sound-bars" aria-hidden="true"><i /><i /><i /></span>
                <span>{audioBusy ? "STARTING…" : audioUnavailable ? "RETRY SOUND" : soundEnabled ? "SOUND ON" : "SOUND OFF"}</span>
              </button>
              <details className="audio-settings">
                <summary>Audio settings</summary>
                <div className="audio-settings-panel">
                  <label htmlFor="ride-volume">Volume <output>{volume}%</output></label>
                  <input id="ride-volume" type="range" min="0" max="100" value={volume} onChange={event => {
                    const value = Number(event.target.value); setVolume(value); audioRef.current?.setVolume(value / 100);
                  }} />
                  <button type="button" onClick={() => void enableSound(true, true)} disabled={audioBusy}>Test sound</button>
                  <p role="status">{audioUnavailable ?? (soundEnabled ? "Audio is running. Test sound plays three clear notes." : "Sound is off. Test sound enables it and plays three notes.")}</p>
                  <p>If you hear nothing, unmute this browser tab and check your device volume and selected speakers or headphones.</p>
                </div>
              </details>
              <button
                type="button"
                className="utility-button"
                onClick={savePostcard}
                aria-label="Save a postcard of this station"
              >
                <span>POSTCARD</span>
              </button>
              <button
                type="button"
                className="utility-button fullscreen-button"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                <span className="fullscreen-icon" aria-hidden="true" />
                <span>{isFullscreen ? "WINDOW" : "FULLSCREEN"}</span>
              </button>
            </div>
          </footer>

          <p className="keyboard-hint" aria-hidden="true">
            ← → NAVIGATE&nbsp;&nbsp; SPACE PLAY / PAUSE&nbsp;&nbsp; C COMFORT&nbsp;&nbsp; ESC EXIT
          </p>
        </>
      )}
    </div>
  );
}
