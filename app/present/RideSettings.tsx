"use client";

import { useEffect, useRef } from "react";
import type { RideView } from "@/lib/ride-path";
import priceContext from "@/content/price-context.json";

type Mode = "ride" | "reader";

export const CAMERA_VIEWS: { id: RideView; label: string; title: string }[] = [
  { id: "exhibit", label: "Auto", title: "Front seat while moving, then the exhibit at each stop" },
  { id: "seat", label: "Front seat", title: "Stay in the front seat" },
  { id: "overview", label: "Overhead", title: "See the track as a landscape" },
];

type RideSettingsProps = {
  id: string;
  onClose: () => void;
  mode: Mode;
  onMode: (mode: Mode) => void;
  rideUnavailable: string | null;
  view: RideView;
  onView: (view: RideView) => void;
  speeds: readonly number[];
  speed: number;
  onSpeed: (speed: number) => void;
  comfort: boolean;
  onComfort: (comfort: boolean) => void;
  sound: { enabled: boolean; busy: boolean; error: string | null; volume: number };
  onSound: (enabled: boolean, test?: boolean) => void;
  onVolume: (volume: number) => void;
  onPostcard: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
};

function Segmented<T extends string | number>({ label, options, value, onChange, disabled }: {
  label: string; options: { value: T; label: string; title?: string; disabled?: boolean }[]; value: T; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <div className="settings-row">
    <span className="settings-label" id={`settings-${label}`}>{label}</span>
    <div className="settings-segmented" role="group" aria-labelledby={`settings-${label}`}>
      {options.map((option) => <button key={String(option.value)} type="button" aria-pressed={value === option.value}
        disabled={disabled || option.disabled} title={option.title} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  </div>;
}

/**
 * Everything that is not play, pause or seek. One sheet instead of a row of mismatched
 * buttons: it opens above the play bar on wide screens and as a bottom sheet on phones.
 */
export default function RideSettings(props: RideSettingsProps) {
  const { id, onClose, mode, sound } = props;
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    sheet?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (sheet?.contains(target) || (target as HTMLElement).closest?.(".settings-toggle")) return;
      onClose();
    };
    // Escape closes the sheet before it can reach the ride's own Escape-to-exit.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    sheet?.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      sheet?.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return <div ref={sheetRef} id={id} className="ride-settings" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
    <div className="settings-head">
      <h2 id={`${id}-title`}>Ride settings</h2>
      <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">×</button>
    </div>

    <Segmented label="Display" value={mode} onChange={props.onMode} options={[
      { value: "ride", label: "3D ride", disabled: Boolean(props.rideUnavailable), title: props.rideUnavailable ? `3D unavailable: ${props.rideUnavailable}` : undefined },
      { value: "reader", label: "2D reader" },
    ]} />
    {mode === "ride" && <Segmented label="Camera" value={props.view} onChange={props.onView}
      options={CAMERA_VIEWS.map((view) => ({ value: view.id, label: view.label, title: view.title }))} />}
    <Segmented label="Speed" value={props.speed} onChange={props.onSpeed}
      options={props.speeds.map((value) => ({ value, label: `${value}×` }))} />

    <div className="settings-row settings-switch">
      <span className="settings-label" id={`${id}-comfort`}>Comfort</span>
      <button type="button" role="switch" aria-checked={props.comfort} aria-labelledby={`${id}-comfort`} aria-describedby={`${id}-comfort-note`}
        onClick={() => props.onComfort(!props.comfort)}><i aria-hidden="true" />{props.comfort ? "On" : "Off"}</button>
      <p id={`${id}-comfort-note`}>A steady horizon, gentle pitch and slower camera turns. Off adds banking and speed zoom.</p>
    </div>

    <div className="settings-row settings-switch">
      <span className="settings-label" id={`${id}-sound`}>Sound</span>
      <button type="button" role="switch" aria-checked={sound.enabled} aria-labelledby={`${id}-sound`} disabled={sound.busy}
        onClick={() => props.onSound(!sound.enabled)}><i aria-hidden="true" />{sound.busy ? "Starting…" : sound.enabled ? "On" : "Off"}</button>
      <p role="status">{sound.error ?? (sound.enabled ? "Soft arrival chimes only. Travel is silent." : "Off until you turn it on. Soft chimes play at each stop.")}</p>
    </div>
    {sound.enabled && <div className="settings-row settings-volume">
      <label className="settings-label" htmlFor={`${id}-volume`}>Volume</label>
      <input id={`${id}-volume`} type="range" min="0" max="100" value={sound.volume} onChange={(event) => props.onVolume(Number(event.target.value))} />
      <output htmlFor={`${id}-volume`}>{sound.volume}%</output>
      <button type="button" className="settings-text-button" onClick={() => props.onSound(true, true)} disabled={sound.busy}>Test sound</button>
    </div>}

    <div className="settings-actions">
      <button type="button" onClick={props.onPostcard}>Save a postcard of this stop</button>
      <button type="button" onClick={props.onFullscreen}>{props.fullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
    </div>

    <details className="settings-about">
      <summary>About the track and prices</summary>
      <p>The track follows a smoothed price trend: two-week Gaussian weighting in log-price space, then rounding of tight bends, so hills are lower and turning points can shift. Horizontal time is compressed and sideways bends are scenic; before the first price the track runs flat.</p>
      <p>Prices shown are the unchanged daily reference at 00:00 UTC on the shown date, not an event-time trade or a daily high. Sourced milestones are shown separately. Not live quotes. Coverage: {priceContext.source.coverage}.</p>
      <a href={priceContext.source.request} target="_blank" rel="noreferrer">Coin Metrics source ↗</a>
    </details>

    <p className="settings-keys"><kbd>←</kbd><kbd>→</kbd> stops · <kbd>Space</kbd> play / pause · <kbd>C</kbd> comfort · <kbd>Esc</kbd> exit</p>
  </div>;
}
