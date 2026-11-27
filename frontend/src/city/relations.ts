// Looks up which files a file imports and which files import it.
import type { ImportEdge } from "../types/cityModel";

export interface Relations {
  imports: Map<string, ImportEdge[]>;
  importedBy: Map<string, ImportEdge[]>;
}

function add(map: Map<string, ImportEdge[]>, key: string, edge: ImportEdge): void {
  const list = map.get(key);
  if (list) list.push(edge);
  else map.set(key, [edge]);
}

export function buildRelations(edges: ImportEdge[]): Relations {
  const relations: Relations = { imports: new Map(), importedBy: new Map() };
  for (const edge of edges) {
    add(relations.imports, edge.source, edge);
    add(relations.importedBy, edge.target, edge);
  }
  return relations;
}

export const EMPTY_RELATIONS: Relations = { imports: new Map(), importedBy: new Map() };
