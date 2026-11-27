// The state store: city, selection, hover, tree expansion, collapsed folders, layer switches, file contents, highlighted lines and camera requests.
import { create } from "zustand";
import type { ArchitectureNode, CityModel, CityNode } from "../types/cityModel";
import type { ScanResult } from "../types/scan";
import { buildCollapseIndex, type CollapseIndex } from "./collapse";
import { defaultLayers, type LayerKey, type Layers } from "./layers";
import { buildRelations, EMPTY_RELATIONS, type Relations } from "./relations";
import { ancestorIds } from "./tree";

export type { Layers } from "./layers";

export interface CameraRequest {
  nodeId: string;
  instant: boolean;
  seq: number;
}

export interface HighlightRange {
  fileId: string;
  startLine: number;
  endLine: number;
  seq: number;
}

interface CityState {
  city: CityModel | null;
  nodesById: Map<string, CityNode>;
  selectedId: string | null;
  selectedArchId: string | null;
  archById: ReadonlyMap<string, ArchitectureNode>;
  hoverId: string | null;
  expandedIds: ReadonlySet<string>;
  collapseIndex: CollapseIndex | null;
  collapsedIds: ReadonlySet<string>;
  contents: ReadonlyMap<string, string | null>;
  scan: ScanResult | null;
  relations: Relations;
  highlight: HighlightRange | null;
  layers: Layers;
  cameraRequest: CameraRequest | null;
  setCity: (city: CityModel | null, contents?: ReadonlyMap<string, string | null>, scan?: ScanResult) => void;
  select: (id: string | null) => void;
  selectArch: (id: string | null) => void;
  selectAndFly: (id: string) => void;
  hover: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  highlightLines: (fileId: string, startLine: number, endLine: number) => void;
  setCollapsed: (ids: ReadonlySet<string>) => void;
  setLayer: (layer: LayerKey, on: boolean) => void;
  flyTo: (nodeId: string) => void;
}

export const useCityStore = create<CityState>((set, get) => ({
  city: null,
  nodesById: new Map(),
  selectedId: null,
  selectedArchId: null,
  archById: new Map(),
  hoverId: null,
  expandedIds: new Set(),
  collapseIndex: null,
  collapsedIds: new Set(),
  contents: new Map(),
  scan: null,
  relations: EMPTY_RELATIONS,
  highlight: null,
  layers: defaultLayers(),
  cameraRequest: null,

  setCity: (city, contents, scan) =>
    set((state) => ({
      city,
      nodesById: new Map((city?.nodes ?? []).map((node) => [node.id, node])),
      selectedId: null,
      selectedArchId: null,
      archById: new Map((city?.architecture ?? []).map((item) => [item.id, item])),
      hoverId: null,
      expandedIds: new Set(city ? [city.rootId] : []),
      collapseIndex: city ? buildCollapseIndex(city) : null,
      collapsedIds: new Set(),
      contents: contents ?? new Map(),
      scan: scan ?? null,
      relations: city ? buildRelations(city.edges) : EMPTY_RELATIONS,
      highlight: null,
      cameraRequest: city
        ? { nodeId: city.rootId, instant: true, seq: (state.cameraRequest?.seq ?? 0) + 1 }
        : null,
    })),

  select: (id) =>
    set((state) => {
      if (id === null || !state.nodesById.has(id)) return { selectedId: null, selectedArchId: null, highlight: null };
      return {
        selectedId: id,
        selectedArchId: id === state.selectedId ? state.selectedArchId : null,
        highlight: state.highlight?.fileId === id ? state.highlight : null,
        expandedIds: new Set([...state.expandedIds, ...ancestorIds(id, state.nodesById)]),
      };
    }),

  selectArch: (id) => {
    const item = id === null ? undefined : get().archById.get(id);
    if (!item) {
      set({ selectedArchId: null });
      return;
    }
    get().highlightLines(item.fileId, item.line, item.line);
    get().select(item.fileId);
    set({ selectedArchId: item.id });
  },

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

  highlightLines: (fileId, startLine, endLine) => {
    const node = get().nodesById.get(fileId);
    if (!node || (node.type !== "file" && node.type !== "empty_file")) return;
    get().select(fileId);
    const low = Math.max(1, Math.min(startLine, endLine));
    const high = Math.max(low, startLine, endLine);
    set((state) => ({ highlight: { fileId, startLine: low, endLine: high, seq: (state.highlight?.seq ?? 0) + 1 } }));
  },

  setCollapsed: (ids) => set({ collapsedIds: ids }),

  setLayer: (layer, on) => set((state) => ({ layers: { ...state.layers, [layer]: on } })),

  flyTo: (nodeId) => {
    if (!get().nodesById.has(nodeId)) return;
    set((state) => ({ cameraRequest: { nodeId, instant: false, seq: (state.cameraRequest?.seq ?? 0) + 1 } }));
  },
}));
