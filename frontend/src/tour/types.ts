// Types of the guided tour: stations with a place in the city, a text and optional layer changes.
import type { LayerKey } from "../city/layers";

export type StationLayers = Partial<Record<LayerKey, boolean>>;

export interface Station {
  id: string;
  nodeId: string;
  title: string;
  text: string;
  layers: StationLayers;
  facts?: string;
}

export interface Tour {
  version: 1;
  name: string;
  stations: Station[];
}

export const TOUR_LAYER_KEYS = ["apiGates", "databases", "externalServices", "servers", "dataPaths"] as const;
export const MAX_STATIONS = 30;
export const MAX_TITLE = 80;
export const MAX_TEXT = 500;
