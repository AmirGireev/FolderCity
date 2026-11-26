import { describe, expect, it } from "vitest";
import {
  directoryFromDrop,
  fromDirectoryEntry,
  fromDirectoryHandle,
  fromFileList,
  pickDirectory,
  readAllEntries,
  supportsDirectoryPicker,
} from "../src/scan/adapters";
import { scanTree } from "../src/scan/scanTree";
import { EXPECTED, FIXTURE, fakeEntry, fakeFileList, fakeHandle } from "./fakes";

describe("Chromium: Ordner-Auswahl (showDirectoryPicker)", () => {
  it("liefert dasselbe JSON wie der Testbaum", async () => {
    const result = await scanTree(fromDirectoryHandle(fakeHandle(FIXTURE.name, FIXTURE.tree)));
    expect(result).toEqual(EXPECTED);
  });

  it("pickDirectory: Abbruch im Dialog gibt null zurück", async () => {
    const win = {
      showDirectoryPicker: async () => {
        throw new DOMException("abgebrochen", "AbortError");
      },
    } as unknown as Window;
    expect(await pickDirectory(win)).toBeNull();
  });

  it("pickDirectory: andere Fehler werden weitergegeben", async () => {
    const win = {
      showDirectoryPicker: async () => {
        throw new DOMException("verboten", "SecurityError");
      },
    } as unknown as Window;
    await expect(pickDirectory(win)).rejects.toThrow("verboten");
  });

  it("supportsDirectoryPicker erkennt fehlende Unterstützung (Firefox/Safari)", () => {
    expect(supportsDirectoryPicker({} as Window)).toBe(false);
    expect(supportsDirectoryPicker({ showDirectoryPicker: () => {} } as unknown as Window)).toBe(true);
  });
});

describe("Firefox/Safari: Drag-and-drop (webkitGetAsEntry)", () => {
  for (const chunk of [1, 2, 3, 100]) {
    it(`liefert dasselbe JSON, auch wenn readEntries nur ${chunk} Einträge pro Aufruf gibt`, async () => {
      const root = fakeEntry(FIXTURE.name, FIXTURE.tree, chunk) as FileSystemDirectoryEntry;
      expect(await scanTree(fromDirectoryEntry(root))).toEqual(EXPECTED);
    });
  }

  it("readEntries wird wiederholt, bis ein leeres Array kommt", async () => {
    let calls = 0;
    const children = [1, 2, 3, 4, 5].map((n) => fakeEntry(`f${n}.txt`, "x", 1));
    const dir = fakeEntry("d", {}, 1) as unknown as FileSystemDirectoryEntry;
    let position = 0;
    dir.createReader = (() => ({
      readEntries(ok: (e: FileSystemEntry[]) => void) {
        calls++;
        const batch = children.slice(position, position + 2);
        position += 2;
        ok(batch);
      },
    })) as unknown as typeof dir.createReader;
    const entries = await readAllEntries(dir);
    expect(entries).toHaveLength(5);
    expect(calls).toBe(4); // 2 + 2 + 1 + leeres Array
  });

  it("leerer Ordner bleibt erhalten", async () => {
    const root = fakeEntry("r", { leer: {}, "a.txt": "a" }, 1) as FileSystemDirectoryEntry;
    const result = await scanTree(fromDirectoryEntry(root));
    expect(result.directories).toEqual(["leer"]);
    expect(result.emptyDirectories).toEqual(["leer"]);
  });

  const items = (entries: (FileSystemEntry | null)[]) =>
    entries.map((e) => ({ kind: "file", webkitGetAsEntry: () => e })) as unknown as DataTransferItemList;

  it("directoryFromDrop nimmt genau einen Ordner", () => {
    const folder = fakeEntry("r", {}, 1);
    expect(directoryFromDrop(items([folder]))?.name).toBe("r");
  });

  it("directoryFromDrop lehnt Datei, mehrere Einträge und nichts ab", () => {
    const folder = fakeEntry("r", {}, 1);
    const file = fakeEntry("a.txt", "a", 1);
    expect(directoryFromDrop(items([file]))).toBeNull();
    expect(directoryFromDrop(items([folder, folder]))).toBeNull();
    expect(directoryFromDrop(items([]))).toBeNull();
    expect(directoryFromDrop(items([null]))).toBeNull();
  });
});

describe("Notlösung: <input webkitdirectory>", () => {
  it("liefert dieselben Dateien, aber keine leeren Ordner", async () => {
    const root = fromFileList(fakeFileList(FIXTURE.name, FIXTURE.tree));
    expect(root?.name).toBe(FIXTURE.name);
    const result = await scanTree(root!);
    expect(result.files).toEqual(EXPECTED.files);
    expect(result.directories).not.toContain("emptyDir"); // leere Ordner gehen verloren
    expect(result.directories.every((d: string) => EXPECTED.directories.includes(d))).toBe(true);
  });

  it("ohne Ordner (nur einzelne Dateien) gibt es null", () => {
    expect(fromFileList([new File(["x"], "a.txt")])).toBeNull();
    expect(fromFileList([])).toBeNull();
  });
});
