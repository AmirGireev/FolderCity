/** Hilfen für Tests: Testbaum aus schema/examples/scan-fixture.json und simulierte Browser-Objekte. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FsDirectory, FsNode } from "../src/scan/scanTree";

const schemaDir = join(__dirname, "..", "..", "schema");
const readJson = (...parts: string[]) =>
  JSON.parse(readFileSync(join(schemaDir, ...parts), "utf-8"));

export const FIXTURE = readJson("examples", "scan-fixture.json") as {
  name: string;
  tree: Tree;
};
export const EXPECTED_TEXT = readFileSync(join(schemaDir, "examples", "scan.expected.json"), "utf-8");
export const EXPECTED = JSON.parse(EXPECTED_TEXT);
export const RULES = readJson("scan-rules.json");
export const SCAN_SCHEMA = readJson("scan.schema.json");

export type Tree = { [name: string]: string | { $bytes: number[] } | Tree };

function isBytes(v: unknown): v is { $bytes: number[] } {
  return typeof v === "object" && v !== null && "$bytes" in v;
}

export function bytesOf(value: string | { $bytes: number[] }): Uint8Array {
  return isBytes(value) ? Uint8Array.from(value.$bytes) : new TextEncoder().encode(value);
}

// ------------------------------------------------ direkt als FsDirectory

export function memoryDir(name: string, tree: Tree): FsDirectory {
  return {
    kind: "directory",
    name,
    async list() {
      return Object.entries(tree).map(([childName, value]): FsNode => {
        if (typeof value === "string" || isBytes(value)) {
          const data = bytesOf(value);
          return { kind: "file", name: childName, size: data.length, read: async () => data };
        }
        return memoryDir(childName, value as Tree);
      });
    },
  };
}

// ------------------------------------------------ simuliertes webkitGetAsEntry

export function fakeEntry(name: string, value: Tree | string | { $bytes: number[] }, chunk: number): FileSystemEntry {
  if (typeof value === "string" || isBytes(value)) {
    const data = bytesOf(value);
    return {
      name,
      isFile: true,
      isDirectory: false,
      file: (ok: (f: File) => void) => ok(new File([data as BlobPart], name)),
    } as unknown as FileSystemEntry;
  }
  const children = Object.entries(value).map(([n, v]) => fakeEntry(n, v as Tree, chunk));
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let position = 0;
      return {
        // Wie im echten Browser: Portionen, am Ende ein leeres Array.
        readEntries(ok: (e: FileSystemEntry[]) => void) {
          const batch = children.slice(position, position + chunk);
          position += chunk;
          setTimeout(() => ok(batch), 0);
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}

// ------------------------------------------------ simuliertes showDirectoryPicker

export function fakeHandle(name: string, tree: Tree): FileSystemDirectoryHandle {
  return {
    name,
    kind: "directory",
    async *values() {
      for (const [childName, value] of Object.entries(tree)) {
        if (typeof value === "string" || isBytes(value)) {
          const data = bytesOf(value);
          yield {
            kind: "file",
            name: childName,
            getFile: async () => new File([data as BlobPart], childName),
          };
        } else {
          yield fakeHandle(childName, value as Tree);
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

// ------------------------------------------------ simuliertes <input webkitdirectory>

export function fakeFileList(rootName: string, tree: Tree, prefix = rootName): File[] {
  const files: File[] = [];
  for (const [name, value] of Object.entries(tree)) {
    if (typeof value === "string" || isBytes(value)) {
      const file = new File([bytesOf(value) as BlobPart], name);
      Object.defineProperty(file, "webkitRelativePath", { value: `${prefix}/${name}` });
      files.push(file);
    } else {
      files.push(...fakeFileList(rootName, value as Tree, `${prefix}/${name}`));
    }
  }
  return files;
}
