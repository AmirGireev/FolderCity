// The scan format as TypeScript types.
export type OmittedReason = "binary" | "too_large";

export interface ScanFile {
  path: string;

  size: number;

  content: string | null;
  omitted: OmittedReason | null;

  isEmpty: boolean;
}

export interface ScanResult {
  schemaVersion: "1.0";
  rootName: string;

  directories: string[];

  emptyDirectories: string[];
  files: ScanFile[];

  truncated: boolean;
}
