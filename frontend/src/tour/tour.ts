// Pure helpers for tours: layers per station, editing, saving and loading with checks.
import type { CityModel } from "../types/cityModel";
import type { LayerKey } from "../city/layers";
import { LAYER_KEYS } from "../city/layers";
import { MAX_STATIONS, MAX_TEXT, MAX_TITLE, type Station, type StationLayers, type Tour } from "./types";

export function emptyTour(name = "Tour"): Tour {
  return { version: 1, name, stations: [] };
}

export function foldLayers(stations: Station[], index: number): StationLayers {
  const result: StationLayers = {};
  for (const station of stations.slice(0, index + 1)) Object.assign(result, station.layers);
  return result;
}

export function allTouchedLayers(stations: Station[]): LayerKey[] {
  const keys = new Set<LayerKey>();
  for (const station of stations) for (const key of Object.keys(station.layers) as LayerKey[]) keys.add(key);
  return [...keys];
}

let counter = 0;

export function newStationId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function newStation(nodeId: string, title: string, text = ""): Station {
  return { id: newStationId(), nodeId, title: title.slice(0, MAX_TITLE), text: text.slice(0, MAX_TEXT), layers: {} };
}

export function moveStation(stations: Station[], from: number, to: number): Station[] {
  if (from < 0 || from >= stations.length || to < 0 || to >= stations.length || from === to) return stations;
  const next = [...stations];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function repoKey(city: CityModel): string {
  let hash = 5381;
  const text = [...city.nodes.map((n) => n.id)].sort().join("\n");
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return `foldercity.tour.${hash.toString(36)}.${city.nodes.length}`;
}

export function serializeTour(tour: Tour): string {
  return JSON.stringify(tour, null, 2) + "\n";
}

function cleanLayers(value: unknown): StationLayers {
  const layers: StationLayers = {};
  if (typeof value !== "object" || value === null) return layers;
  for (const key of LAYER_KEYS) {
    const flag = (value as Record<string, unknown>)[key];
    if (typeof flag === "boolean") layers[key] = flag;
  }
  return layers;
}

export function parseTour(text: string, validNodeIds: ReadonlySet<string>): Tour | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const raw = data as { name?: unknown; stations?: unknown };
  if (!Array.isArray(raw.stations)) return null;
  const stations: Station[] = [];
  for (const item of raw.stations.slice(0, MAX_STATIONS)) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.nodeId !== "string" || !validNodeIds.has(entry.nodeId)) continue;
    stations.push({
      id: typeof entry.id === "string" && entry.id ? entry.id.slice(0, 40) : newStationId(),
      nodeId: entry.nodeId,
      title: typeof entry.title === "string" ? entry.title.slice(0, MAX_TITLE) : "",
      text: typeof entry.text === "string" ? entry.text.slice(0, MAX_TEXT) : "",
      layers: cleanLayers(entry.layers),
    });
  }
  const ids = new Set<string>();
  for (const station of stations) {
    while (ids.has(station.id)) station.id = newStationId();
    ids.add(station.id);
  }
  return { version: 1, name: typeof raw.name === "string" && raw.name ? raw.name.slice(0, MAX_TITLE) : "Tour", stations };
}

export type TourAction = "next" | "previous" | "first" | "last" | "exit";

export function keyToAction(key: string): TourAction | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
    case "Enter":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
    case "Backspace":
      return "previous";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return "exit";
    default:
      return null;
  }
}
