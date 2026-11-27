// Finds the presumed data paths from an API gate to files with database access by searching the import graph.
import type { ArchitectureNode, CityModel } from "../types/cityModel";

export interface DataPath {
  files: string[];
  database: ArchitectureNode;
}

export const MAX_PATH_LENGTH = 10;
export const MAX_PATHS = 20;

export function findDataPaths(city: CityModel, gateId: string): DataPath[] {
  const gate = city.architecture.find((item) => item.id === gateId && item.kind === "api");
  if (!gate) return [];

  const databasesByFile = new Map<string, ArchitectureNode[]>();
  for (const item of city.architecture) {
    if (item.kind !== "database") continue;
    const list = databasesByFile.get(item.fileId) ?? [];
    list.push(item);
    databasesByFile.set(item.fileId, list);
  }

  const neighbors = new Map<string, string[]>();
  for (const edge of city.edges) {
    const list = neighbors.get(edge.source) ?? [];
    list.push(edge.target);
    neighbors.set(edge.source, list);
  }
  for (const list of neighbors.values()) list.sort();

  const parent = new Map<string, string | null>([[gate.fileId, null]]);
  const depth = new Map<string, number>([[gate.fileId, 0]]);
  const queue = [gate.fileId];
  const order: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const file = queue[head];
    order.push(file);
    if ((depth.get(file) ?? 0) >= MAX_PATH_LENGTH) continue;
    for (const next of neighbors.get(file) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, file);
      depth.set(next, (depth.get(file) ?? 0) + 1);
      queue.push(next);
    }
  }

  const paths: DataPath[] = [];
  for (const file of order) {
    const databases = databasesByFile.get(file);
    if (!databases) continue;
    const files: string[] = [];
    for (let current: string | null | undefined = file; current != null; current = parent.get(current)) files.push(current);
    files.reverse();
    for (const database of databases) paths.push({ files, database });
    if (paths.length >= MAX_PATHS) break;
  }
  return paths.slice(0, MAX_PATHS);
}
