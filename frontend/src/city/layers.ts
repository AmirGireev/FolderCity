// Defines the layer switches and tells which ones can be used and which ones found something.
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
  hasData?: (city: CityModel | null) => boolean;
}

const hasArchitecture = (kind: ArchitectureKind) => (city: CityModel | null) =>
  city?.architecture.some((item) => item.kind === kind) ?? false;

const always = () => true;

export const LAYER_DEFINITIONS: readonly LayerDefinition[] = [
  { key: "emptyFiles", label: "Empty files", defaultOn: true, isAvailable: always },
  { key: "emptyFolders", label: "Empty folders", defaultOn: true, isAvailable: always },
  { key: "mergeFolders", label: "Merge far folders into blocks", defaultOn: true, isAvailable: always },
  { key: "apiGates", label: "API gates", defaultOn: false, isAvailable: always, hasData: hasArchitecture("api") },
  { key: "databases", label: "Databases", defaultOn: false, isAvailable: always, hasData: hasArchitecture("database") },
  { key: "externalServices", label: "External services", defaultOn: false, isAvailable: always, hasData: hasArchitecture("external") },
  { key: "servers", label: "Servers and containers", defaultOn: false, isAvailable: always, hasData: hasArchitecture("server") },
  {
    key: "dataPaths",
    label: "Data paths (presumed)",
    defaultOn: false,
    isAvailable: always,
    hasData: (city) => hasArchitecture("api")(city) && hasArchitecture("database")(city),
  },
  {
    key: "complexity",
    label: "Complexity (colors)",
    defaultOn: false,
    isAvailable: always,
    hasData: (city) => city?.nodes.some((node) => node.metrics.complexity !== undefined) ?? false,
  },
  {
    key: "errors",
    label: "Findings (lint and rules)",
    defaultOn: false,
    isAvailable: always,
    hasData: (city) => (city?.findings.length ?? 0) > 0,
  },
];

export function defaultLayers(): Layers {
  return Object.fromEntries(LAYER_DEFINITIONS.map((layer) => [layer.key, layer.defaultOn])) as Layers;
}
