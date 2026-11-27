// Builds the folder tree rows from the flat node list.
import type { CityNode } from "../types/cityModel";

export interface TreeRow {
  node: CityNode;
  level: number;
  isFolder: boolean;
  hasChildren: boolean;
  expanded: boolean;
}

export function isFolderNode(node: CityNode): boolean {
  return node.type === "folder" || node.type === "empty_folder";
}

export function childrenByParent(nodes: CityNode[]): Map<string, CityNode[]> {
  const map = new Map<string, CityNode[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const list = map.get(node.parentId);
    if (list) list.push(node);
    else map.set(node.parentId, [node]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(isFolderNode(b)) - Number(isFolderNode(a)) || a.name.localeCompare(b.name));
  }
  return map;
}

export function ancestorIds(id: string, nodesById: Map<string, CityNode>): string[] {
  const result: string[] = [];
  let parent = nodesById.get(id)?.parentId ?? null;
  while (parent !== null && !result.includes(parent)) {
    result.push(parent);
    parent = nodesById.get(parent)?.parentId ?? null;
  }
  return result;
}

export function visibleRows(
  rootId: string,
  nodesById: Map<string, CityNode>,
  children: Map<string, CityNode[]>,
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const root = nodesById.get(rootId);
  if (!root) return [];
  const rows: TreeRow[] = [];
  const walk = (node: CityNode, level: number) => {
    const kids = children.get(node.id) ?? [];
    const isOpen = expanded.has(node.id);
    rows.push({ node, level, isFolder: isFolderNode(node), hasChildren: kids.length > 0, expanded: isOpen });
    if (isOpen) for (const kid of kids) walk(kid, level + 1);
  };
  walk(root, 0);
  return rows;
}
