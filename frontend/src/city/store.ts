// The state store: city, selection, hover, tree expansion, layer switches and camera requests.
import { create } from "zustand";
import type { CityModel, CityNode } from "../types/cityModel";
import { defaultLayers, type LayerKey, type Layers } from "./layers";
import { ancestorIds } from "./tree";

export type { Layers } from "./layers";

export interface CameraRequest {
  nodeId: string;
  instant: boolean;
  seq: number;
}

interface CityState {
  city: CityModel | null;
  nodesById: Map<string, CityNode>;
  selectedId: string | null;
  hoverId: string | null;
  expandedIds: ReadonlySet<string>;
  layers: Layers;
  cameraRequest: CameraRequest | null;
  setCity: (city: CityModel | null) => void;
  select: (id: string | null) => void;
  selectAndFly: (id: string) => void;
  hover: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  setLayer: (layer: LayerKey, on: boolean) => void;
  flyTo: (nodeId: string) => void;
}

export const useCityStore = create<CityState>((set, get) => ({
  city: null,
  nodesById: new Map(),
  selectedId: null,
  hoverId: null,
  expandedIds: new Set(),
  layers: defaultLayers(),
  cameraRequest: null,

  setCity: (city) =>
    set((state) => ({
      city,
      nodesById: new Map((city?.nodes ?? []).map((node) => [node.id, node])),
      selectedId: null,
      hoverId: null,
      expandedIds: new Set(city ? [city.rootId] : []),
      cameraRequest: city
        ? { nodeId: city.rootId, instant: true, seq: (state.cameraRequest?.seq ?? 0) + 1 }
        : null,
    })),

  select: (id) =>
    set((state) => {
      if (id === null || !state.nodesById.has(id)) return { selectedId: null };
      return { selectedId: id, expandedIds: new Set([...state.expandedIds, ...ancestorIds(id, state.nodesById)]) };
    }),

  selectAndFly: (id) => {
    get().select(id);
    get().flyTo(id);
  },

  hover: (id) => set({ hoverId: id }),

  toggleExpanded: (id) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      if (!next.delete(id)) next.add(id);
      return { expandedIds: next };
    }),

  setLayer: (layer, on) => set((state) => ({ layers: { ...state.layers, [layer]: on } })),

  flyTo: (nodeId) => {
    if (!get().nodesById.has(nodeId)) return;
    set((state) => ({ cameraRequest: { nodeId, instant: false, seq: (state.cameraRequest?.seq ?? 0) + 1 } }));
  },
}));
