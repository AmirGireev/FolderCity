// Places architecture elements (gates, cylinders, satellites, servers) in the city and groups them by layer.
import type { ArchitectureKind, ArchitectureNode, CityModel, CityNode } from "../types/cityModel";
import type { LayerKey } from "./layers";
import type { Vec3 } from "./geometry";

export type ShapeKind = "box" | "cylinder" | "sphere";

export interface ArchShape {
  archId: string;
  kind: ArchitectureKind;
  shape: ShapeKind;
  position: Vec3;
  scale: Vec3;
}

export interface Placement {
  shapes: ArchShape[];
  anchors: Map<string, Vec3>;
}

export const ARCH_LAYER: Record<ArchitectureKind, LayerKey> = {
  api: "apiGates",
  database: "databases",
  external: "externalServices",
  server: "servers",
};

export const ARCH_KIND_LABEL: Record<ArchitectureKind, string> = {
  api: "API gate",
  database: "Database",
  external: "External service",
  server: "Server / container",
};

export const GATE = { width: 4, height: 5, depth: 1, post: 0.8, lintel: 0.8, gap: 0.6, inset: 0.4 };
const ROOF_ORDER: ArchitectureKind[] = ["database", "server", "external"];

type Edge = "north" | "south" | "west" | "east";

export function nearestEdge(folder: CityNode, x: number, z: number): Edge {
  const { position, width, depth } = folder.dimensions;
  const distances: [Edge, number][] = [
    ["north", z - position.z],
    ["south", position.z + depth - z],
    ["west", x - position.x],
    ["east", position.x + width - x],
  ];
  return distances.reduce((best, current) => (current[1] < best[1] ? current : best))[0];
}

function gateShapes(archId: string, folder: CityNode, edge: Edge, along: number): { shapes: ArchShape[]; anchor: Vec3 } {
  const { position, width, depth } = folder.dimensions;
  const baseY = position.y + folder.dimensions.height;
  const horizontal = edge === "north" || edge === "south";
  const fixed =
    edge === "north" ? position.z + GATE.inset + GATE.depth / 2
    : edge === "south" ? position.z + depth - GATE.inset - GATE.depth / 2
    : edge === "west" ? position.x + GATE.inset + GATE.depth / 2
    : position.x + width - GATE.inset - GATE.depth / 2;
  const at = (offset: number, y: number): Vec3 => (horizontal ? [along + offset, y, fixed] : [fixed, y, along + offset]);
  const size = (extent: number, h: number): Vec3 => (horizontal ? [extent, h, GATE.depth] : [GATE.depth, h, extent]);
  const half = GATE.width / 2 - GATE.post / 2;
  const make = (position: Vec3, scale: Vec3): ArchShape => ({ archId, kind: "api", shape: "box", position, scale });
  return {
    shapes: [
      make(at(-half, baseY + GATE.height / 2), size(GATE.post, GATE.height)),
      make(at(half, baseY + GATE.height / 2), size(GATE.post, GATE.height)),
      make(at(0, baseY + GATE.height - GATE.lintel / 2), size(GATE.width, GATE.lintel)),
    ],
    anchor: at(0, baseY + GATE.height + 0.3),
  };
}

function placeGates(gates: { arch: ArchitectureNode; file: CityNode; folder: CityNode }[]): Placement {
  const shapes: ArchShape[] = [];
  const anchors = new Map<string, Vec3>();
  const groups = new Map<string, { arch: ArchitectureNode; folder: CityNode; edge: Edge; desired: number }[]>();

  for (const { arch, file, folder } of gates) {
    const { position, width, depth } = file.dimensions;
    const cx = position.x + width / 2;
    const cz = position.z + depth / 2;
    const edge = nearestEdge(folder, cx, cz);
    const desired = edge === "north" || edge === "south" ? cx : cz;
    const key = `${folder.id}|${edge}`;
    const list = groups.get(key) ?? [];
    list.push({ arch, folder, edge, desired });
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.desired - b.desired || a.arch.id.localeCompare(b.arch.id));
    const { position, width, depth } = list[0].folder.dimensions;
    const horizontal = list[0].edge === "north" || list[0].edge === "south";
    const start = horizontal ? position.x : position.z;
    const end = start + (horizontal ? width : depth);
    let previous = -Infinity;
    for (const item of list) {
      let along = Math.max(item.desired, previous + GATE.width + GATE.gap);
      along = Math.min(Math.max(along, start + GATE.width / 2), end - GATE.width / 2);
      if (end - start < GATE.width) along = (start + end) / 2;
      previous = along;
      const gate = gateShapes(item.arch.id, item.folder, item.edge, along);
      shapes.push(...gate.shapes);
      anchors.set(item.arch.id, gate.anchor);
    }
  }
  return { shapes, anchors };
}

function placeRoofItems(file: CityNode, items: ArchitectureNode[]): Placement {
  const shapes: ArchShape[] = [];
  const anchors = new Map<string, Vec3>();
  const { position, width, depth, height } = file.dimensions;
  const top = position.y + height;
  const ordered = [...items].sort(
    (a, b) => ROOF_ORDER.indexOf(a.kind) - ROOF_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id),
  );
  const unit = Math.min(1.6, Math.max(0.4, (Math.min(width / ordered.length, depth) * 0.7) / 2));
  ordered.forEach((arch, index) => {
    const x = position.x + ((index + 0.5) / ordered.length) * width;
    const z = position.z + depth / 2;
    if (arch.kind === "database") {
      const h = 1.6 + unit;
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "cylinder", position: [x, top + h / 2, z], scale: [unit * 2, h, unit * 2] });
      anchors.set(arch.id, [x, top + h + 0.3, z]);
    } else if (arch.kind === "server") {
      const h = 1.4 + unit * 1.6;
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "box", position: [x, top + h / 2, z], scale: [unit * 2, h, unit * 2] });
      anchors.set(arch.id, [x, top + h + 0.3, z]);
    } else {
      const mast = 2.5 + unit;
      const ball = unit * 1.2;
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "box", position: [x, top + mast / 2, z], scale: [0.2, mast, 0.2] });
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "sphere", position: [x, top + mast + ball / 2, z], scale: [ball, ball, ball] });
      anchors.set(arch.id, [x, top + mast + ball + 0.3, z]);
    }
  });
  return { shapes, anchors };
}

export function placeArchitecture(
  city: CityModel,
  nodesById: Map<string, CityNode>,
  hiddenIds: ReadonlySet<string> = new Set(),
): Placement {
  const result: Placement = { shapes: [], anchors: new Map() };
  const gates: { arch: ArchitectureNode; file: CityNode; folder: CityNode }[] = [];
  const byFile = new Map<string, ArchitectureNode[]>();

  for (const arch of city.architecture) {
    const file = nodesById.get(arch.fileId);
    if (!file || hiddenIds.has(file.id)) continue;
    if (arch.kind === "api") {
      const folder = file.parentId === null ? undefined : nodesById.get(file.parentId);
      if (folder) gates.push({ arch, file, folder });
    } else {
      const list = byFile.get(file.id) ?? [];
      list.push(arch);
      byFile.set(file.id, list);
    }
  }

  const gatePlacement = placeGates(gates);
  result.shapes.push(...gatePlacement.shapes);
  gatePlacement.anchors.forEach((value, key) => result.anchors.set(key, value));

  for (const [fileId, items] of byFile) {
    const placement = placeRoofItems(nodesById.get(fileId)!, items);
    result.shapes.push(...placement.shapes);
    placement.anchors.forEach((value, key) => result.anchors.set(key, value));
  }
  return result;
}

export function architectureByFile(city: CityModel): Map<string, ArchitectureNode[]> {
  const map = new Map<string, ArchitectureNode[]>();
  for (const arch of city.architecture) {
    const list = map.get(arch.fileId);
    if (list) list.push(arch);
    else map.set(arch.fileId, [arch]);
  }
  return map;
}
