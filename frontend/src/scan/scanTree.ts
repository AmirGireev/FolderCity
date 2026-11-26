/**
 * Macht aus einem (echten oder simulierten) Ordnerbaum das Scan-Format.
 *
 * Alle drei Browser-Wege (Ordner-Auswahl in Chromium, Drag-and-drop, Notlösung
 * <input webkitdirectory>) werden zuerst in diesen einfachen Baum übersetzt
 * (siehe adapters.ts). Dadurch gelten Filter, Limits und Leer-Erkennung überall
 * gleich – und gleich wie im Backend (backend/app/scan/walker.py).
 *
 * Sicherheit: Dateien werden nur als Bytes gelesen und als Text gespeichert.
 */

import {
  DEFAULT_LIMITS,
  type ScanLimits,
  hasBinaryExtension,
  isBlankText,
  shouldSkipDirectory,
  shouldSkipFile,
} from "./rules";
import type { ScanFile, ScanResult } from "../types/scan";

export interface FsFile {
  kind: "file";
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

export interface FsDirectory {
  kind: "directory";
  name: string;
  list(): Promise<FsNode[]>;
}

export type FsNode = FsFile | FsDirectory;

/** Text oder null, wenn es eine Binärdatei ist (NUL-Byte oder kein UTF-8). */
export function decodeText(data: Uint8Array): string | null {
  const head = data.length > 8000 ? data.subarray(0, 8000) : data;
  if (head.includes(0)) return null;
  try {
    // ignoreBOM: Das BOM bleibt im Text erhalten (wie im Backend).
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    return null;
  }
}

async function buildFile(path: string, file: FsFile, limits: ScanLimits): Promise<ScanFile> {
  const { size } = file;
  if (hasBinaryExtension(file.name)) {
    return { path, size, content: null, omitted: "binary", isEmpty: size === 0 };
  }
  if (size > limits.maxFileBytes) {
    return { path, size, content: null, omitted: "too_large", isEmpty: false };
  }
  const text = decodeText(await file.read());
  if (text === null) {
    return { path, size, content: null, omitted: "binary", isEmpty: size === 0 };
  }
  return { path, size, content: text, omitted: null, isEmpty: isBlankText(text) };
}

function byName(a: FsNode, b: FsNode): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export async function scanTree(
  root: FsDirectory,
  limits: ScanLimits = DEFAULT_LIMITS,
): Promise<ScanResult> {
  const files: ScanFile[] = [];
  const directories: string[] = [];
  const emptyDirectories: string[] = [];
  let truncated = false;
  let stop = false;

  /** Liefert true, wenn in diesem Ordner (rekursiv) mindestens eine Datei liegt. */
  async function walk(dir: FsDirectory, rel: string, depth: number): Promise<boolean> {
    let hasFile = false;
    let entries: FsNode[];
    try {
      entries = [...(await dir.list())].sort(byName);
    } catch {
      return false; // nicht lesbar: wie leer behandeln (wie im Backend)
    }
    for (const entry of entries) {
      if (stop) break;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        if (shouldSkipDirectory(entry.name)) continue;
        if (depth + 1 > limits.maxDepth) {
          truncated = true;
          hasFile = true; // Inhalt unbekannt, also nicht "leer" behaupten
          continue;
        }
        directories.push(childRel);
        if (await walk(entry, childRel, depth + 1)) hasFile = true;
        else emptyDirectories.push(childRel);
      } else {
        if (shouldSkipFile(entry.name)) continue;
        hasFile = true;
        if (files.length >= limits.maxFiles) {
          truncated = true;
          stop = true;
          break;
        }
        try {
          files.push(await buildFile(childRel, entry, limits));
        } catch {
          continue; // nicht lesbar: überspringen
        }
      }
    }
    return hasFile;
  }

  await walk(root, "", 0);

  return {
    schemaVersion: "1.0",
    rootName: root.name,
    directories: directories.sort(),
    emptyDirectories: emptyDirectories.sort(),
    files: files.sort(byPath),
    truncated,
  };
}
