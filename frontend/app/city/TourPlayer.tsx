// The tour player: a card with the current station, buttons and keys, shown over the 3D view in calm mode.
"use client";

import { useEffect } from "react";
import { keyToAction } from "../../src/tour/tour";
import { useTourStore } from "../../src/tour/tourStore";

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
}

export function TourPlayer() {
  const playing = useTourStore((state) => state.playing);
  const tour = useTourStore((state) => state.tour);
  const index = useTourStore((state) => state.index);

  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const action = keyToAction(event.key);
      if (!action) return;
      event.preventDefault();
      const state = useTourStore.getState();
      if (action === "next") state.next();
      else if (action === "previous") state.previous();
      else if (action === "first") state.goTo(0);
      else if (action === "last") state.goTo((state.tour?.stations.length ?? 1) - 1);
      else state.stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    let entered = false;
    const onChange = () => {
      if (entered && !document.fullscreenElement) useTourStore.getState().stop();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        entered = true;
      })
      .catch(() => undefined);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      entered = false;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [playing]);

  const station = tour?.stations[index];
  if (!playing || !tour || !station) return null;
  const last = tour.stations.length - 1;

  return (
    <div className="tour-card" data-testid="tour-card" role="dialog" aria-label="Tour">
      <div className="tour-progress">
        <div style={{ width: `${((index + 1) / tour.stations.length) * 100}%` }} />
      </div>
      <div className="tour-card-body">
        <small>
          Station {index + 1} of {tour.stations.length}
        </small>
        <h3>{station.title || "Untitled"}</h3>
        {station.text && <p>{station.text}</p>}
      </div>
      <div className="tour-card-actions">
        <button type="button" className="btn small" onClick={() => useTourStore.getState().previous()} disabled={index === 0}>
          ← Back
        </button>
        <button type="button" className="btn primary small" onClick={() => useTourStore.getState().next()} disabled={index === last}>
          Next →
        </button>
        <button type="button" className="btn small" onClick={() => useTourStore.getState().stop()}>
          Exit (Esc)
        </button>
        <span className="tour-keys">← → Space</span>
      </div>
    </div>
  );
}
