// The CityModel as TypeScript types.
export const NODE_TYPES = ["folder", "file", "empty_folder", "empty_file"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const ARCHITECTURE_KINDS = ["api", "database", "external", "server"] as const;
export type ArchitectureKind = (typeof ARCHITECTURE_KINDS)[number];

export const SYMBOL_KINDS = ["function", "class", "method"] as const;
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_SOURCES = ["ruff", "rules"] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

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
  depth?: number;
  complexity?: number;
  blastRadius?: number;
  cycle?: number;
  cycleSize?: number;
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

export interface CitySymbol {
  id: string;
  fileId: string;
  kind: SymbolKind;
  name: string;
  startLine: number;
  endLine: number;
  complexity?: number;
}

export interface Finding {
  id: string;
  fileId: string;
  line: number;
  rule: string;
  message: string;
  severity: Severity;
  source: FindingSource;
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
  symbols: CitySymbol[];
  findings: Finding[];
}
