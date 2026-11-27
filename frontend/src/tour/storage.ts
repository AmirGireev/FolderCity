// Saves tours in the browser (localStorage) and falls back to memory when it is not available.
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSaved(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeSaved(key: string, value: string): void {
  memory.set(key, value);
  try {
    storage()?.setItem(key, value);
  } catch {
    return;
  }
}

export function removeSaved(key: string): void {
  memory.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {
    return;
  }
}
