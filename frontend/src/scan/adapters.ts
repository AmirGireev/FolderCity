/**
 * Übersetzt die drei Browser-Wege in den einfachen Baum aus scanTree.ts.
 *
 * 1. Chromium: window.showDirectoryPicker() (File System Access API)
 * 2. Firefox/Safari: Ordner per Drag-and-drop, gelesen über webkitGetAsEntry().
 *    readEntries liefert die Einträge in Portionen und wird so lange wiederholt,
 *    bis ein leeres Array zurückkommt. Dieser Weg behält leere Ordner.
 * 3. Notlösung: <input webkitdirectory>. Liefert keine leeren Ordner.
 */

import type { FsDirectory, FsFile, FsNode } from "./scanTree";

/** Datei-Knoten aus einem Browser-File. Der Inhalt wird erst bei read() geladen. */
function fileNode(name: string, file: File): FsFile {
  return {
    kind: "file",
    name,
    size: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  };
}

// ---------------------------------------------------------------- 1. Ordner-Auswahl

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<FileSystemDirectoryHandle>;
};

export function supportsDirectoryPicker(win: Window = window): boolean {
  return typeof (win as PickerWindow).showDirectoryPicker === "function";
}

export function fromDirectoryHandle(handle: FileSystemDirectoryHandle): FsDirectory {
  return {
    kind: "directory",
    name: handle.name,
    async list() {
      const nodes: FsNode[] = [];
      for await (const child of handle.values()) {
        if (child.kind === "directory") {
          nodes.push(fromDirectoryHandle(child as FileSystemDirectoryHandle));
        } else {
          const file = await (child as FileSystemFileHandle).getFile();
          nodes.push(fileNode(child.name, file));
        }
      }
      return nodes;
    },
  };
}

/** Öffnet den Ordner-Dialog. Gibt null zurück, wenn der Nutzer abbricht. */
export async function pickDirectory(win: Window = window): Promise<FsDirectory | null> {
  const picker = (win as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Dieser Browser kann keinen Ordner direkt auswählen.");
  try {
    return fromDirectoryHandle(await picker.call(win, { mode: "read" }));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

// ---------------------------------------------------------------- 2. Drag-and-drop

/** Liest alle Einträge eines Ordners: readEntries so lange aufrufen, bis [] kommt. */
export function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

export function fromDirectoryEntry(dir: FileSystemDirectoryEntry): FsDirectory {
  return {
    kind: "directory",
    name: dir.name,
    async list() {
      const children = await readAllEntries(dir);
      return Promise.all(
        children.map(async (child): Promise<FsNode> => {
          if (child.isDirectory) return fromDirectoryEntry(child as FileSystemDirectoryEntry);
          const file = await new Promise<File>((resolve, reject) =>
            (child as FileSystemFileEntry).file(resolve, reject),
          );
          return fileNode(child.name, file);
        }),
      );
    },
  };
}

/**
 * Ordner aus einem Drop. Muss synchron im drop-Ereignis aufgerufen werden
 * (danach sind die Einträge im Browser nicht mehr abrufbar).
 * Gibt null zurück, wenn nicht genau ein Ordner abgelegt wurde.
 */
export function directoryFromDrop(items: DataTransferItemList): FsDirectory | null {
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }
  if (entries.length !== 1 || !entries[0].isDirectory) return null;
  return fromDirectoryEntry(entries[0] as FileSystemDirectoryEntry);
}

// ---------------------------------------------------------------- 3. Notlösung

type MutableDir = { name: string; dirs: Map<string, MutableDir>; files: FsFile[] };

/** Baut aus <input webkitdirectory> einen Baum. Leere Ordner gehen dabei verloren. */
export function fromFileList(files: ArrayLike<File>): FsDirectory | null {
  let root: MutableDir | null = null;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parts = (file.webkitRelativePath || file.name).split("/");
    if (parts.length < 2) return null; // kein Ordner
    root ??= { name: parts[0], dirs: new Map(), files: [] };
    let current = root;
    for (const part of parts.slice(1, -1)) {
      let next = current.dirs.get(part);
      if (!next) {
        next = { name: part, dirs: new Map(), files: [] };
        current.dirs.set(part, next);
      }
      current = next;
    }
    current.files.push(fileNode(parts[parts.length - 1], file));
  }
  return root ? toFsDirectory(root) : null;
}

function toFsDirectory(dir: MutableDir): FsDirectory {
  return {
    kind: "directory",
    name: dir.name,
    list: async () => [...[...dir.dirs.values()].map(toFsDirectory), ...dir.files],
  };
}
