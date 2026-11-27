// The tour state: the stations of the current repo, playing the tour, calm mode and saving.
import { create } from "zustand";
import { defaultLayers, type LayerKey, type Layers } from "../city/layers";
import { useCityStore } from "../city/store";
import { fetchStationTexts } from "./api";
import { readSaved, removeSaved, writeSaved } from "./storage";
import { stationFacts, suggestTour } from "./suggest";
import {
  allTouchedLayers,
  emptyTour,
  foldLayers,
  moveStation,
  newStation,
  parseTour,
  repoKey,
  serializeTour,
} from "./tour";
import { MAX_STATIONS, MAX_TEXT, MAX_TITLE, type Station, type Tour } from "./types";

export type LayerChoice = "keep" | "on" | "off";

interface TourState {
  tour: Tour | null;
  index: number;
  playing: boolean;
  calm: boolean;
  editorOpen: boolean;
  editing: string | null;
  layersBefore: Partial<Layers> | null;
  aiBusy: boolean;
  message: string | null;
  loadForCity: () => void;
  openEditor: () => void;
  closeEditor: () => void;
  edit: (stationId: string | null) => void;
  createEmpty: () => void;
  suggest: () => void;
  addStation: () => void;
  updateStation: (id: string, patch: Partial<Pick<Station, "title" | "text" | "nodeId">>) => void;
  useSelection: (id: string) => void;
  setLayerChoice: (id: string, layer: LayerKey, choice: LayerChoice) => void;
  moveStationBy: (id: string, direction: -1 | 1) => void;
  removeStation: (id: string) => void;
  rename: (name: string) => void;
  improveWithAi: () => Promise<void>;
  exportJson: () => string;
  importJson: (text: string) => boolean;
  show: (index: number) => void;
  start: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
}

function currentKey(): string | null {
  const city = useCityStore.getState().city;
  return city ? repoKey(city) : null;
}

function persist(tour: Tour | null): void {
  const key = currentKey();
  if (!key) return;
  if (tour && tour.stations.length > 0) writeSaved(key, serializeTour(tour));
  else removeSaved(key);
}

function applyStation(tour: Tour, index: number, before: Partial<Layers> | null): void {
  const station = tour.stations[index];
  if (!station) return;
  const city = useCityStore.getState();
  const folded = foldLayers(tour.stations, index);
  const fallback = before ?? city.layers;
  const base = defaultLayers();
  for (const key of allTouchedLayers(tour.stations)) {
    city.setLayer(key, folded[key] ?? fallback[key] ?? base[key]);
  }
  if (city.nodesById.has(station.nodeId)) {
    city.select(station.nodeId);
    city.flyTo(station.nodeId);
  }
}

export const useTourStore = create<TourState>((set, get) => {
  const update = (tour: Tour | null, extra: Partial<TourState> = {}) => {
    persist(tour);
    set({ tour, ...extra });
  };
  const withTour = (fn: (tour: Tour) => Tour | null, extra: Partial<TourState> = {}) => {
    const tour = get().tour;
    if (tour) update(fn(tour), extra);
  };

  return {
    tour: null,
    index: 0,
    playing: false,
    calm: false,
    editorOpen: false,
    editing: null,
    layersBefore: null,
    aiBusy: false,
    message: null,

    loadForCity: () => {
      const city = useCityStore.getState().city;
      let tour: Tour | null = null;
      if (city) {
        const saved = readSaved(repoKey(city));
        tour = saved ? parseTour(saved, new Set(city.nodes.map((n) => n.id))) : null;
        if (tour && tour.stations.length === 0) tour = null;
      }
      set({ tour, index: 0, playing: false, calm: false, editorOpen: false, editing: null, layersBefore: null, aiBusy: false, message: null });
    },

    openEditor: () => {
      if (!get().tour) get().createEmpty();
      set({ editorOpen: true, editing: get().editing ?? get().tour?.stations[0]?.id ?? null });
    },
    closeEditor: () => set({ editorOpen: false }),
    edit: (stationId) => set({ editing: stationId }),

    createEmpty: () => {
      const city = useCityStore.getState().city;
      if (city) set({ tour: emptyTour(`${city.nodes.find((n) => n.id === city.rootId)?.name ?? "Repo"} tour`), editing: null });
    },

    suggest: () => {
      const city = useCityStore.getState().city;
      if (!city) return;
      const tour = suggestTour(city);
      update(tour, { editing: tour.stations[0]?.id ?? null, message: "Suggested a tour. Edit it as you like." });
    },

    addStation: () => {
      const cityState = useCityStore.getState();
      if (!cityState.city) return;
      const node = cityState.nodesById.get(cityState.selectedId ?? cityState.city.rootId);
      if (!node) return;
      const tour = get().tour ?? emptyTour();
      if (tour.stations.length >= MAX_STATIONS) {
        set({ message: `A tour can have at most ${MAX_STATIONS} stations.` });
        return;
      }
      const station = newStation(node.id, node.path === "" ? node.name : node.name);
      update({ ...tour, stations: [...tour.stations, station] }, { editing: station.id, message: null });
    },

    updateStation: (id, patch) =>
      withTour((tour) => ({
        ...tour,
        stations: tour.stations.map((s) =>
          s.id === id
            ? {
                ...s,
                ...(patch.title !== undefined ? { title: patch.title.slice(0, MAX_TITLE) } : {}),
                ...(patch.text !== undefined ? { text: patch.text.slice(0, MAX_TEXT) } : {}),
                ...(patch.nodeId !== undefined ? { nodeId: patch.nodeId } : {}),
              }
            : s,
        ),
      })),

    useSelection: (id) => {
      const selected = useCityStore.getState().selectedId;
      if (selected) get().updateStation(id, { nodeId: selected });
    },

    setLayerChoice: (id, layer, choice) =>
      withTour((tour) => ({
        ...tour,
        stations: tour.stations.map((s) => {
          if (s.id !== id) return s;
          const layers = { ...s.layers };
          if (choice === "keep") delete layers[layer];
          else layers[layer] = choice === "on";
          return { ...s, layers };
        }),
      })),

    moveStationBy: (id, direction) =>
      withTour((tour) => {
        const from = tour.stations.findIndex((s) => s.id === id);
        return { ...tour, stations: moveStation(tour.stations, from, from + direction) };
      }),

    removeStation: (id) => {
      const tour = get().tour;
      if (!tour) return;
      const position = tour.stations.findIndex((s) => s.id === id);
      const stations = tour.stations.filter((s) => s.id !== id);
      const editing = get().editing === id ? stations[Math.min(position, stations.length - 1)]?.id ?? null : get().editing;
      update({ ...tour, stations }, { editing, index: Math.min(get().index, Math.max(0, stations.length - 1)) });
    },

    rename: (name) => withTour((tour) => ({ ...tour, name: name.slice(0, MAX_TITLE) || tour.name })),

    improveWithAi: async () => {
      const city = useCityStore.getState().city;
      const tour = get().tour;
      if (!city || !tour || tour.stations.length === 0 || get().aiBusy) return;
      set({ aiBusy: true, message: "Writing speaker notes…" });
      try {
        const root = city.nodes.find((n) => n.id === city.rootId);
        const texts = await fetchStationTexts(
          root?.name ?? "repo",
          tour.stations.slice(0, 12).map((s) => ({ id: s.id, facts: stationFacts(city, s) })),
        );
        const byId = new Map(texts.map((t) => [t.id, t]));
        const latest = get().tour ?? tour;
        update(
          {
            ...latest,
            stations: latest.stations.map((s) => {
              const text = byId.get(s.id);
              return text ? { ...s, title: text.title.slice(0, MAX_TITLE), text: text.text.slice(0, MAX_TEXT) } : s;
            }),
          },
          { message: `Updated ${byId.size} of ${Math.min(12, tour.stations.length)} stations.` },
        );
      } catch (error) {
        set({ message: error instanceof Error ? error.message : "The AI could not write the notes." });
      } finally {
        set({ aiBusy: false });
      }
    },

    exportJson: () => serializeTour(get().tour ?? emptyTour()),

    importJson: (text) => {
      const city = useCityStore.getState().city;
      if (!city) return false;
      const tour = parseTour(text, new Set(city.nodes.map((n) => n.id)));
      if (!tour || tour.stations.length === 0) {
        set({ message: "That file is not a tour for this repo." });
        return false;
      }
      update(tour, { editing: tour.stations[0].id, message: `Loaded ${tour.stations.length} stations.` });
      return true;
    },

    show: (index) => {
      const tour = get().tour;
      if (tour && tour.stations[index]) applyStation(tour, index, get().layersBefore);
    },

    start: () => {
      const tour = get().tour;
      if (!tour || tour.stations.length === 0) return;
      const before = { ...useCityStore.getState().layers };
      set({ playing: true, calm: true, index: 0, editorOpen: false, layersBefore: before, message: null });
      applyStation(tour, 0, before);
    },

    stop: () => {
      const { tour, layersBefore, playing } = get();
      if (playing && tour && layersBefore) {
        const city = useCityStore.getState();
        for (const key of allTouchedLayers(tour.stations)) {
          if (layersBefore[key] !== undefined) city.setLayer(key, layersBefore[key] as boolean);
        }
      }
      set({ playing: false, calm: false, layersBefore: null });
    },

    next: () => get().goTo(get().index + 1),
    previous: () => get().goTo(get().index - 1),

    goTo: (target) => {
      const { tour, playing } = get();
      if (!tour || !playing || tour.stations.length === 0) return;
      const index = Math.min(Math.max(0, target), tour.stations.length - 1);
      if (index === get().index) {
        applyStation(tour, index, get().layersBefore);
        return;
      }
      set({ index });
      applyStation(tour, index, get().layersBefore);
    },
  };
});

useCityStore.subscribe((state, previous) => {
  if (state.city !== previous.city) useTourStore.getState().loadForCity();
});
