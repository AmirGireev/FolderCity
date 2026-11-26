// Tests the three browser ways to get a folder.
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

describe("Chromium: folder picker (showDirectoryPicker)", () => {
  it("gives the same JSON as the test tree", async () => {
    const result = await scanTree(fromDirectoryHandle(fakeHandle(FIXTURE.name, FIXTURE.tree)));
    expect(result).toEqual(EXPECTED);
  });

  it("pickDirectory: cancelling the dialog returns null", async () => {
    const win = {
      showDirectoryPicker: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    } as unknown as Window;
    expect(await pickDirectory(win)).toBeNull();
  });

  it("pickDirectory: other errors are passed on", async () => {
    const win = {
      showDirectoryPicker: async () => {
        throw new DOMException("forbidden", "SecurityError");
      },
    } as unknown as Window;
    await expect(pickDirectory(win)).rejects.toThrow("forbidden");
  });

  it("supportsDirectoryPicker detects missing support (Firefox/Safari)", () => {
    expect(supportsDirectoryPicker({} as Window)).toBe(false);
    expect(supportsDirectoryPicker({ showDirectoryPicker: () => {} } as unknown as Window)).toBe(true);
  });
});

describe("Firefox/Safari: drag-and-drop (webkitGetAsEntry)", () => {
  for (const chunk of [1, 2, 3, 100]) {
    it(`gives the same JSON even if readEntries returns only ${chunk} entries per call`, async () => {
      const root = fakeEntry(FIXTURE.name, FIXTURE.tree, chunk) as FileSystemDirectoryEntry;
      expect(await scanTree(fromDirectoryEntry(root))).toEqual(EXPECTED);
    });
  }

  it("readEntries is repeated until an empty array comes back", async () => {
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
    expect(calls).toBe(4);
  });

  it("an empty folder is kept", async () => {
    const root = fakeEntry("r", { leer: {}, "a.txt": "a" }, 1) as FileSystemDirectoryEntry;
    const result = await scanTree(fromDirectoryEntry(root));
    expect(result.directories).toEqual(["leer"]);
    expect(result.emptyDirectories).toEqual(["leer"]);
  });

  const items = (entries: (FileSystemEntry | null)[]) =>
    entries.map((e) => ({ kind: "file", webkitGetAsEntry: () => e })) as unknown as DataTransferItemList;

  it("directoryFromDrop accepts exactly one folder", () => {
    const folder = fakeEntry("r", {}, 1);
    expect(directoryFromDrop(items([folder]))?.name).toBe("r");
  });

  it("directoryFromDrop rejects a file, several entries and nothing", () => {
    const folder = fakeEntry("r", {}, 1);
    const file = fakeEntry("a.txt", "a", 1);
    expect(directoryFromDrop(items([file]))).toBeNull();
    expect(directoryFromDrop(items([folder, folder]))).toBeNull();
    expect(directoryFromDrop(items([]))).toBeNull();
    expect(directoryFromDrop(items([null]))).toBeNull();
  });
});

describe("Fallback: <input webkitdirectory>", () => {
  it("gives the same files but no empty folders", async () => {
    const root = fromFileList(fakeFileList(FIXTURE.name, FIXTURE.tree));
    expect(root?.name).toBe(FIXTURE.name);
    const result = await scanTree(root!);
    expect(result.files).toEqual(EXPECTED.files);
    expect(result.directories).not.toContain("emptyDir");
    expect(result.directories.every((d: string) => EXPECTED.directories.includes(d))).toBe(true);
  });

  it("without a folder (only single files) gives null", () => {
    expect(fromFileList([new File(["x"], "a.txt")])).toBeNull();
    expect(fromFileList([])).toBeNull();
  });
});
