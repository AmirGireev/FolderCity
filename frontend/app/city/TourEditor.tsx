// The tour editor: a drawer to build, change, save, load and improve the stations of the tour.
"use client";

import { useRef, type ChangeEvent } from "react";
import { useCityStore } from "../../src/city/store";
import { TOUR_LAYER_KEYS, MAX_STATIONS, MAX_TEXT, MAX_TITLE } from "../../src/tour/types";
import { useTourStore, type LayerChoice } from "../../src/tour/tourStore";
import type { LayerKey } from "../../src/city/layers";

const LAYER_LABELS: Record<(typeof TOUR_LAYER_KEYS)[number], string> = {
  apiGates: "API gates",
  databases: "Databases",
  externalServices: "External services",
  servers: "Servers and containers",
  dataPaths: "Data paths",
};

export function TourEditor() {
  const open = useTourStore((state) => state.editorOpen);
  const tour = useTourStore((state) => state.tour);
  const editingId = useTourStore((state) => state.editing);
  const message = useTourStore((state) => state.message);
  const aiBusy = useTourStore((state) => state.aiBusy);
  const nodesById = useCityStore((state) => state.nodesById);
  const selectedId = useCityStore((state) => state.selectedId);
  const importInput = useRef<HTMLInputElement>(null);
  const store = useTourStore.getState();

  if (!open || !tour) return null;
  const stations = tour.stations;
  const index = stations.findIndex((s) => s.id === editingId);
  const station = index >= 0 ? stations[index] : undefined;

  function download() {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tour?.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "tour"}.tour.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) store.importJson(await file.text());
  }

  function onSuggest() {
    if (stations.length > 0 && !window.confirm("Replace your tour with a new suggestion?")) return;
    store.suggest();
  }

  const choiceOf = (layer: LayerKey): LayerChoice => {
    const value = station?.layers[layer];
    return value === undefined ? "keep" : value ? "on" : "off";
  };

  return (
    <aside className="tour-editor" data-testid="tour-editor" aria-label="Tour editor">
      <header>
        <input
          className="tour-name"
          aria-label="Tour name"
          value={tour.name}
          maxLength={MAX_TITLE}
          onChange={(event) => store.rename(event.target.value)}
        />
        <button type="button" className="btn small" onClick={() => store.closeEditor()}>
          Close
        </button>
      </header>

      <div className="tour-editor-body">
        <ol className="tour-list">
          {stations.map((item, position) => (
            <li key={item.id} className={item.id === editingId ? "active" : undefined}>
              <button type="button" onClick={() => store.edit(item.id)}>
                {position + 1}. {item.title || "Untitled"}
              </button>
            </li>
          ))}
          {stations.length === 0 && <li className="empty">No stations yet.</li>}
        </ol>
        <div className="tour-list-actions">
          <button type="button" className="btn small" onClick={() => store.addStation()} disabled={stations.length >= MAX_STATIONS}>
            + Station at current selection
          </button>
          <button type="button" className="btn small" onClick={onSuggest}>
            Suggest a tour
          </button>
          <button type="button" className="btn small" onClick={() => void store.improveWithAi()} disabled={aiBusy || stations.length === 0}>
            {aiBusy ? "Writing…" : "Improve texts with AI"}
          </button>
        </div>

        {station && (
          <div className="tour-station" data-testid="tour-station">
            <label>
              Title
              <input value={station.title} maxLength={MAX_TITLE} onChange={(event) => store.updateStation(station.id, { title: event.target.value })} />
            </label>
            <label>
              Text
              <textarea
                value={station.text}
                maxLength={MAX_TEXT}
                rows={4}
                onChange={(event) => store.updateStation(station.id, { text: event.target.value })}
              />
            </label>
            <p className="place">
              Place: <strong>{station.nodeId === "root" || station.nodeId === "." ? "(root)" : station.nodeId}</strong>
              {!nodesById.has(station.nodeId) && " (missing)"}
            </p>
            <div className="tour-station-buttons">
              <button type="button" className="btn small" onClick={() => store.useSelection(station.id)} disabled={!selectedId}>
                Use current selection
              </button>
              <button type="button" className="btn small" onClick={() => store.show(index)}>
                Show in city
              </button>
            </div>
            <fieldset>
              <legend>Layers at this station</legend>
              {TOUR_LAYER_KEYS.map((layer) => (
                <label key={layer} className="layer-choice">
                  <span>{LAYER_LABELS[layer]}</span>
                  <select value={choiceOf(layer)} onChange={(event) => store.setLayerChoice(station.id, layer, event.target.value as LayerChoice)}>
                    <option value="keep">keep</option>
                    <option value="on">turn on</option>
                    <option value="off">turn off</option>
                  </select>
                </label>
              ))}
            </fieldset>
            <div className="tour-station-buttons">
              <button type="button" className="btn small" onClick={() => store.moveStationBy(station.id, -1)} disabled={index === 0}>
                Move up
              </button>
              <button type="button" className="btn small" onClick={() => store.moveStationBy(station.id, 1)} disabled={index === stations.length - 1}>
                Move down
              </button>
              <button type="button" className="btn small danger" onClick={() => store.removeStation(station.id)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <footer>
        {message && <p className="note">{message}</p>}
        <div className="tour-buttons">
          <button type="button" className="btn primary small" onClick={() => store.start()} disabled={stations.length === 0}>
            Start tour
          </button>
          <button type="button" className="btn small" onClick={download} disabled={stations.length === 0}>
            Export
          </button>
          <button type="button" className="btn small" onClick={() => importInput.current?.click()}>
            Import
          </button>
          <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(event) => void onImport(event)} />
        </div>
        <p className="note">Saved automatically in this browser.</p>
      </footer>
    </aside>
  );
}
