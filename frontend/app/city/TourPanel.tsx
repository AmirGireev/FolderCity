// The tour section of the sidebar: start the tour, edit it or let the app suggest one.
"use client";

import { useTourStore } from "../../src/tour/tourStore";

export function TourPanel() {
  const tour = useTourStore((state) => state.tour);
  const message = useTourStore((state) => state.message);
  const { start, openEditor, suggest } = useTourStore.getState();
  const count = tour?.stations.length ?? 0;

  function onSuggest() {
    if (count > 0 && !window.confirm("Replace your tour with a new suggestion?")) return;
    suggest();
  }

  return (
    <div className="tour-panel" data-testid="tour-panel">
      {count > 0 ? (
        <p className="note">
          <strong>{tour?.name}</strong>: {count} {count === 1 ? "station" : "stations"}
        </p>
      ) : (
        <p className="note">No tour yet. Let the app suggest one or build your own.</p>
      )}
      <div className="tour-buttons">
        <button type="button" className="btn primary small" onClick={start} disabled={count === 0}>
          Start tour
        </button>
        <button type="button" className="btn small" onClick={openEditor}>
          Edit tour
        </button>
        <button type="button" className="btn small" onClick={onSuggest}>
          Suggest a tour
        </button>
      </div>
      {message && <p className="note">{message}</p>}
    </div>
  );
}
