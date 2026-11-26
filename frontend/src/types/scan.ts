/**
 * Das Scan-Format (Schritt 2). Quelle der Wahrheit: schema/scan.schema.json.
 * Lokaler Ordner und GitHub-Import liefern genau dieses JSON.
 * Die Reihenfolge der Felder ist absichtlich dieselbe wie im Backend.
 */

export type OmittedReason = "binary" | "too_large";

export interface ScanFile {
  path: string;
  /** Größe in Bytes. */
  size: number;
  /** Textinhalt; null bei Binärdateien und zu großen Dateien. */
  content: string | null;
  omitted: OmittedReason | null;
  /** 0 Bytes oder nur Leerzeichen. */
  isEmpty: boolean;
}

export interface ScanResult {
  schemaVersion: "1.0";
  rootName: string;
  /** Alle Ordnerpfade (ohne die Wurzel), sortiert. */
  directories: string[];
  /** Teilmenge von directories: keine Dateien und nur leere Unterordner. */
  emptyDirectories: string[];
  files: ScanFile[];
  /** true, wenn wegen Datei- oder Tiefen-Limit nicht alles eingelesen wurde. */
  truncated: boolean;
}
