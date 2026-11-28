// Decides which folders are shown as one single block, based on camera distance and folder shape.
import type { CityModel, CityNode } from "../types/cityModel";
import { type Vec3 } from "./geometry";
import { ancestorIds, childrenByParent, isFolderNode } from "./tree";

export const COLLAPSE_DISTANCE_FACTOR = 4;
export const SPARSE_DISTANCE_FACTOR = 2;
export const MIN_FILES_TO_COLLAPSE = 3;
export const SPARSE_MIN_SUBFOLDERS = 4;
const HYSTERESIS = 0.1;
const CLUSTER_INSET = 1;
const CLUSTER_MIN_HEIGHT = 2;
const CLUSTER_MAX_HEIGHT = 25;

export interface CollapseInfo {
  candidate: boolean;
  sparse: boolean;
  size: number;
  clusterHeight: number;
  dominantExtension?: string;
  maxComplexity?: number;
  hasCycle: boolean;
}

export interface CollapseIndex {
  rootId: string;
  children: Map<string, CityNode[]>;
  info: Map<string, CollapseInfo>;
}

interface Stats {
  maxTop: number;
  extensions: Map<string, number>;
  maxComplexity: number;
  hasCycle: boolean;
}

export function buildCollapseIndex(city: CityModel): CollapseIndex {
  const children = childrenByParent(city.nodes);
  const info = new Map<string, CollapseInfo>();
  const root = city.nodes.find((node) => node.id === city.rootId);

  const visit = (node: CityNode): Stats => {
    const stats: Stats = {
      maxTop: node.dimensions.position.y + node.dimensions.height,
      extensions: new Map(),
      maxComplexity: node.metrics.complexity ?? 0,
      hasCycle: node.metrics.cycle !== undefined,
    };
    const extension = node.metrics.extension;
    if (node.type === "file" && extension) stats.extensions.set(extension, 1);

    const kids = children.get(node.id) ?? [];
    for (const kid of kids) {
      const kidStats = visit(kid);
      stats.maxTop = Math.max(stats.maxTop, kidStats.maxTop);
      stats.maxComplexity = Math.max(stats.maxComplexity, kidStats.maxComplexity);
      stats.hasCycle = stats.hasCycle || kidStats.hasCycle;
      for (const [ext, count] of kidStats.extensions) {
        stats.extensions.set(ext, (stats.extensions.get(ext) ?? 0) + count);
      }
    }

    if (isFolderNode(node)) {
      const subfolders = kids.filter(isFolderNode);
      const fileCount = node.metrics.fileCount ?? 0;
      const sparse =
        subfolders.length >= SPARSE_MIN_SUBFOLDERS && subfolders.every((f) => (f.metrics.fileCount ?? 0) <= 1);
      const top = node.dimensions.position.y + node.dimensions.height;
      const dominant = [...stats.extensions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      info.set(node.id, {
        candidate: node.type === "folder" && node.id !== city.rootId && (fileCount >= MIN_FILES_TO_COLLAPSE || sparse),
        sparse,
        size: Math.max(node.dimensions.width, node.dimensions.depth),
        clusterHeight: Math.min(CLUSTER_MAX_HEIGHT, Math.max(CLUSTER_MIN_HEIGHT, 0.6 * (stats.maxTop - top))),
        dominantExtension: dominant,
        maxComplexity: stats.maxComplexity > 0 ? stats.maxComplexity : undefined,
        hasCycle: stats.hasCycle,
      });
    }
    return stats;
  };

  if (root) visit(root);
  return { rootId: city.rootId, children, info };
}

export function distanceToNode(point: Vec3, node: CityNode): number {
  const { position, width, depth, height } = node.dimensions;
  const dx = Math.max(position.x - point[0], 0, point[0] - (position.x + width));
  const dy = Math.max(position.y - point[1], 0, point[1] - (position.y + height));
  const dz = Math.max(position.z - point[2], 0, point[2] - (position.z + depth));
  return Math.hypot(dx, dy, dz);
}

export function computeCollapsed(
  index: CollapseIndex,
  camera: Vec3,
  previous: ReadonlySet<string>,
  forceOpen: ReadonlySet<string>,
): Set<string> {
  const collapsed = new Set<string>();

  const walk = (parentId: string) => {
    for (const child of index.children.get(parentId) ?? []) {
      const info = index.info.get(child.id);
      if (!info) continue;
      if (info.candidate && !forceOpen.has(child.id)) {
        const factor = info.sparse ? SPARSE_DISTANCE_FACTOR : COLLAPSE_DISTANCE_FACTOR;
        const limit = factor * info.size;
        const distance = distanceToNode(camera, child);
        const shouldCollapse = previous.has(child.id)
          ? distance > limit * (1 - HYSTERESIS)
          : distance > limit * (1 + HYSTERESIS);
        if (shouldCollapse) {
          collapsed.add(child.id);
          continue;
        }
      }
      walk(child.id);
    }
  };

  walk(index.rootId);
  return collapsed;
}

export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function forcedOpenIds(selectedId: string | null, nodesById: Map<string, CityNode>): Set<string> {
  return selectedId === null ? new Set() : new Set(ancestorIds(selectedId, nodesById));
}

export function hiddenIds(collapsed: ReadonlySet<string>, index: CollapseIndex): Set<string> {
  const hidden = new Set<string>();
  const hide = (id: string) => {
    for (const child of index.children.get(id) ?? []) {
      hidden.add(child.id);
      hide(child.id);
    }
  };
  for (const id of collapsed) hide(id);
  return hidden;
}

export function clusterNode(folder: CityNode, info: CollapseInfo): CityNode {
  const { position, width, depth, height } = folder.dimensions;
  const inset = Math.min(CLUSTER_INSET, width * 0.25, depth * 0.25);
  return {
    ...folder,
    dimensions: {
      position: { x: position.x + inset, y: position.y + height, z: position.z + inset },
      width: width - 2 * inset,
      depth: depth - 2 * inset,
      height: info.clusterHeight,
    },
  };
}
