// The CityModel as TypeScript types.
export const NODE_TYPES = ["folder", "file", "empty_folder", "empty_file"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const ARCHITECTURE_KINDS = ["api", "database", "external", "server"] as const;
export type ArchitectureKind = (typeof ARCHITECTURE_KINDS)[number];

export const SOURCE_KINDS = ["local", "github", "demo"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface Position {
  x: number;

  y: number;
  z: number;
}

export interface Dimensions {
  position: Position;
  width: number;
  depth: number;
  height: number;
}

export interface Metrics {
  sizeBytes?: number;
  lines?: number;
  fileCount?: number;
  extension?: string;
  language?: string;

  [metric: string]: number | string | undefined;
}

export interface CityNode {
  id: string;

  path: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  dimensions: Dimensions;
  metrics: Metrics;
}

export interface ImportEdge {
  source: string;
  target: string;
  line?: number;
}

export interface ArchitectureNode {
  id: string;
  kind: ArchitectureKind;
  label: string;
  fileId: string;
  line: number;
}

export interface CitySource {
  kind: SourceKind;
  name: string;
  url?: string;
  hash?: string;
}

export interface CityModel {
  schemaVersion: "1.0";
  source?: CitySource;
  rootId: string;
  nodes: CityNode[];
  edges: ImportEdge[];
  architecture: ArchitectureNode[];
}
