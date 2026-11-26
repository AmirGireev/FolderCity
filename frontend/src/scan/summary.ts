// Counts folders and files for the display.
import type { ScanResult } from "../types/scan";

export interface ScanSummary {
  folders: number;
  emptyFolders: number;
  files: number;
  emptyFiles: number;

  withoutContent: number;
  truncated: boolean;
}

export function summarize(scan: ScanResult): ScanSummary {
  return {
    folders: scan.directories.length,
    emptyFolders: scan.emptyDirectories.length,
    files: scan.files.length,
    emptyFiles: scan.files.filter((f) => f.isEmpty).length,
    withoutContent: scan.files.filter((f) => f.omitted !== null).length,
    truncated: scan.truncated,
  };
}
