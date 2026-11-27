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

export const GATE = { width: 4, minWidth: 1.6, height: 5, depth: 1, post: 0.8, lintel: 0.8, gap: 0.6, inset: 0.4 };
export const GATE_CORNER_MARGIN = GATE.inset + GATE.depth + GATE.gap;
const ROOF_ORDER: ArchitectureKind[] = ["database", "server", "external"];
const EDGES = ["north", "south", "west", "east"] as const;

type Edge = (typeof EDGES)[number];

function edgeDistances(folder: CityNode, x: number, z: number): [Edge, number][] {
  const { position, width, depth } = folder.dimensions;
  return [
    ["north", z - position.z],
    ["south", position.z + depth - z],
    ["west", x - position.x],
    ["east", position.x + width - x],
  ];
}

export function nearestEdge(folder: CityNode, x: number, z: number): Edge {
  return edgeDistances(folder, x, z).reduce((best, current) => (current[1] < best[1] ? current : best))[0];
}

function edgesByDistance(folder: CityNode, x: number, z: number): Edge[] {
  return edgeDistances(folder, x, z)
    .sort((a, b) => a[1] - b[1] || EDGES.indexOf(a[0]) - EDGES.indexOf(b[0]))
    .map(([edge]) => edge);
}

function edgeRange(folder: CityNode, edge: Edge): { horizontal: boolean; start: number; end: number } {
  const { position, width, depth } = folder.dimensions;
  const horizontal = edge === "north" || edge === "south";
  const origin = horizontal ? position.x : position.z;
  const length = horizontal ? width : depth;
  return { horizontal, start: origin + GATE_CORNER_MARGIN, end: origin + length - GATE_CORNER_MARGIN };
}

function edgeCapacity(folder: CityNode, edge: Edge): number {
  const { start, end } = edgeRange(folder, edge);
  const room = end - start;
  return room < GATE.minWidth ? 1 : Math.floor((room + GATE.gap) / (GATE.minWidth + GATE.gap));
}

function gateShapes(
  archId: string,
  folder: CityNode,
  edge: Edge,
  along: number,
  gateWidth: number,
): { shapes: ArchShape[]; anchor: Vec3 } {
  const { position, width, depth } = folder.dimensions;
  const baseY = position.y + folder.dimensions.height;
  const horizontal = edge === "north" || edge === "south";
  const fixed =
    edge === "north" ? position.z + GATE.inset + GATE.depth / 2
    : edge === "south" ? position.z + depth - GATE.inset - GATE.depth / 2
    : edge === "west" ? position.x + GATE.inset + GATE.depth / 2
    : position.x + width - GATE.inset - GATE.depth / 2;
  const post = Math.min(GATE.post, gateWidth * 0.25);
  const at = (offset: number, y: number): Vec3 => (horizontal ? [along + offset, y, fixed] : [fixed, y, along + offset]);
  const size = (extent: number, h: number): Vec3 => (horizontal ? [extent, h, GATE.depth] : [GATE.depth, h, extent]);
  const half = gateWidth / 2 - post / 2;
  const make = (shapePosition: Vec3, scale: Vec3): ArchShape => ({ archId, kind: "api", shape: "box", position: shapePosition, scale });
  return {
    shapes: [
      make(at(-half, baseY + GATE.height / 2), size(post, GATE.height)),
      make(at(half, baseY + GATE.height / 2), size(post, GATE.height)),
      make(at(0, baseY + GATE.height - GATE.lintel / 2), size(gateWidth, GATE.lintel)),
    ],
    anchor: at(0, baseY + GATE.height + 0.3),
  };
}

interface GateRequest {
  arch: ArchitectureNode;
  file: CityNode;
  folder: CityNode;
}

function placeGates(gates: GateRequest[]): Placement {
  const shapes: ArchShape[] = [];
  const anchors = new Map<string, Vec3>();
  const groups = new Map<string, { arch: ArchitectureNode; folder: CityNode; edge: Edge; desired: number }[]>();

  const ordered = [...gates].sort((a, b) => a.arch.fileId.localeCompare(b.arch.fileId) || a.arch.id.localeCompare(b.arch.id));
  for (const { arch, file, folder } of ordered) {
    const { position, width, depth } = file.dimensions;
    const cx = position.x + width / 2;
    const cz = position.z + depth / 2;
    const preferred = edgesByDistance(folder, cx, cz);
    const edge =
      preferred.find((candidate) => (groups.get(`${folder.id}|${candidate}`)?.length ?? 0) < edgeCapacity(folder, candidate)) ??
      preferred[0];
    const key = `${folder.id}|${edge}`;
    const list = groups.get(key) ?? [];
    list.push({ arch, folder, edge, desired: edge === "north" || edge === "south" ? cx : cz });
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.desired - b.desired || a.arch.id.localeCompare(b.arch.id));
    const { folder, edge } = list[0];
    const { start, end } = edgeRange(folder, edge);
    const room = end - start;
    const count = list.length;
    const gateWidth = room < GATE.minWidth ? GATE.width : Math.max(GATE.minWidth, Math.min(GATE.width, (room - (count - 1) * GATE.gap) / count));
    const positions = list.map((item) => item.desired);
    if (room < GATE.minWidth) {
      positions.fill((start + end) / 2);
    } else {
      const step = gateWidth + GATE.gap;
      positions[0] = Math.max(positions[0], start + gateWidth / 2);
      for (let i = 1; i < count; i++) positions[i] = Math.max(positions[i], positions[i - 1] + step);
      positions[count - 1] = Math.min(positions[count - 1], end - gateWidth / 2);
      for (let i = count - 2; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - step);
    }
    list.forEach((item, index) => {
      const gate = gateShapes(item.arch.id, item.folder, item.edge, positions[index], gateWidth);
      shapes.push(...gate.shapes);
      anchors.set(item.arch.id, gate.anchor);
    });
  }
  return { shapes, anchors };
}

export const ROOF = { margin: 0.9, fill: 0.8, maxFootprint: 3.2, minFootprint: 0.15 };

export function roofGrid(count: number, width: number, depth: number): { cols: number; rows: number; cell: number } {
  const room = { w: width * ROOF.margin, d: depth * ROOF.margin };
  let best = { cols: 1, rows: count, cell: Math.min(room.w, room.d / count) };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cell = Math.min(room.w / cols, room.d / rows);
    if (cell > best.cell + 1e-9) best = { cols, rows, cell };
  }
  return best;
}

function placeRoofItems(file: CityNode, items: ArchitectureNode[]): Placement {
  const shapes: ArchShape[] = [];
  const anchors = new Map<string, Vec3>();
  const { position, width, depth, height } = file.dimensions;
  const top = position.y + height;
  const ordered = [...items].sort(
    (a, b) => ROOF_ORDER.indexOf(a.kind) - ROOF_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id),
  );
  const { cols, rows, cell } = roofGrid(ordered.length, width, depth);
  const footprint = Math.min(ROOF.maxFootprint, Math.max(ROOF.minFootprint, cell * ROOF.fill));
  const originX = position.x + (width - cols * cell) / 2;
  const originZ = position.z + (depth - rows * cell) / 2;

  ordered.forEach((arch, index) => {
    const row = Math.floor(index / cols);
    const inRow = row === rows - 1 ? ordered.length - row * cols : cols;
    const column = index - row * cols;
    const x = originX + ((cols - inRow) / 2 + column + 0.5) * cell;
    const z = originZ + (row + 0.5) * cell;
    if (arch.kind === "database") {
      const h = 0.5 + footprint * 0.8;
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "cylinder", position: [x, top + h / 2, z], scale: [footprint, h, footprint] });
      anchors.set(arch.id, [x, top + h + 0.3, z]);
    } else if (arch.kind === "server") {
      const h = 0.5 + footprint * 1.2;
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "box", position: [x, top + h / 2, z], scale: [footprint, h, footprint] });
      anchors.set(arch.id, [x, top + h + 0.3, z]);
    } else {
      const mast = 0.8 + footprint * 1.4;
      const ball = footprint * 0.9;
      const thin = Math.max(0.05, footprint * 0.12);
      shapes.push({ archId: arch.id, kind: arch.kind, shape: "box", position: [x, top + mast / 2, z], scale: [thin, mast, thin] });
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
