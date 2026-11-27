// The state store: city, selection, hover, layer switches and camera requests.
import { create } from "zustand";
import type { CityModel, CityNode } from "../types/cityModel";

export interface CameraRequest {
  nodeId: string;
  instant: boolean;
  seq: number;
}

export interface Layers {
  emptyFiles: boolean;
  emptyFolders: boolean;
}

interface CityState {
  city: CityModel | null;
  nodesById: Map<string, CityNode>;
  selectedId: string | null;
  hoverId: string | null;
  layers: Layers;
  cameraRequest: CameraRequest | null;
  setCity: (city: CityModel | null) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setLayer: (layer: keyof Layers, on: boolean) => void;
  flyTo: (nodeId: string) => void;
}

export const useCityStore = create<CityState>((set, get) => ({
  city: null,
  nodesById: new Map(),
  selectedId: null,
  hoverId: null,
  layers: { emptyFiles: true, emptyFolders: true },
  cameraRequest: null,

  setCity: (city) =>
    set((state) => ({
      city,
      nodesById: new Map((city?.nodes ?? []).map((node) => [node.id, node])),
      selectedId: null,
      hoverId: null,
      cameraRequest: city
        ? { nodeId: city.rootId, instant: true, seq: (state.cameraRequest?.seq ?? 0) + 1 }
        : null,
    })),

  select: (id) => set({ selectedId: id === null || get().nodesById.has(id) ? id : null }),

  hover: (id) => set({ hoverId: id }),

  setLayer: (layer, on) => set((state) => ({ layers: { ...state.layers, [layer]: on } })),

  flyTo: (nodeId) => {
    if (!get().nodesById.has(nodeId)) return;
    set((state) => ({ cameraRequest: { nodeId, instant: false, seq: (state.cameraRequest?.seq ?? 0) + 1 } }));
  },
}));
