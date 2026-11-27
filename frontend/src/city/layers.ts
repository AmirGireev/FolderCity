// Defines the layer switches and tells which ones have data yet.
import type { ArchitectureKind, CityModel } from "../types/cityModel";

export const LAYER_KEYS = [
  "emptyFiles",
  "emptyFolders",
  "mergeFolders",
  "apiGates",
  "databases",
  "externalServices",
  "servers",
  "dataPaths",
  "complexity",
  "errors",
] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
export type Layers = Record<LayerKey, boolean>;

export interface LayerDefinition {
  key: LayerKey;
  label: string;
  defaultOn: boolean;
  isAvailable: (city: CityModel | null) => boolean;
}

const hasArchitecture = (kind: ArchitectureKind) => (city: CityModel | null) =>
  city?.architecture.some((item) => item.kind === kind) ?? false;

export const LAYER_DEFINITIONS: readonly LayerDefinition[] = [
  { key: "emptyFiles", label: "Empty files", defaultOn: true, isAvailable: () => true },
  { key: "emptyFolders", label: "Empty folders", defaultOn: true, isAvailable: () => true },
  { key: "mergeFolders", label: "Merge far folders into blocks", defaultOn: true, isAvailable: () => true },
  { key: "apiGates", label: "API gates", defaultOn: false, isAvailable: hasArchitecture("api") },
  { key: "databases", label: "Databases", defaultOn: false, isAvailable: hasArchitecture("database") },
  { key: "externalServices", label: "External services", defaultOn: false, isAvailable: hasArchitecture("external") },
  { key: "servers", label: "Servers and containers", defaultOn: false, isAvailable: hasArchitecture("server") },
  { key: "dataPaths", label: "Data paths", defaultOn: false, isAvailable: () => false },
  { key: "complexity", label: "Complexity", defaultOn: false, isAvailable: () => false },
  { key: "errors", label: "Errors", defaultOn: false, isAvailable: () => false },
];

export function defaultLayers(): Layers {
  return Object.fromEntries(LAYER_DEFINITIONS.map((layer) => [layer.key, layer.defaultOn])) as Layers;
}
