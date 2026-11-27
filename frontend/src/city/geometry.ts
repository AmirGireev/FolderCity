// Pure geometry helpers: node centers, camera poses and outline segments.
import type { CityNode } from "../types/cityModel";

export type Vec3 = [number, number, number];

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export const EMPTY_FOLDER_PLATE_HEIGHT = 0.05;
const VIEW_DIRECTION: Vec3 = [0.6, 0.75, 0.6];
const MIN_DISTANCE = 12;

export function nodeCenter(node: CityNode): Vec3 {
  const { position, width, depth, height } = node.dimensions;
  return [position.x + width / 2, position.y + height / 2, position.z + depth / 2];
}

export function cameraPoseFor(node: CityNode): CameraPose {
  const { width, depth, height } = node.dimensions;
  const target = nodeCenter(node);
  const distance = Math.max(MIN_DISTANCE, Math.max(width, depth, height) * 1.6);
  const length = Math.hypot(...VIEW_DIRECTION);
  const position: Vec3 = [
    target[0] + (VIEW_DIRECTION[0] / length) * distance,
    target[1] + (VIEW_DIRECTION[1] / length) * distance,
    target[2] + (VIEW_DIRECTION[2] / length) * distance,
  ];
  return { position, target };
}

export function outlineSegments(node: CityNode): number[] {
  const { position, width, depth } = node.dimensions;
  const y = position.y + EMPTY_FOLDER_PLATE_HEIGHT;
  const x0 = position.x;
  const x1 = position.x + width;
  const z0 = position.z;
  const z1 = position.z + depth;
  return [
    x0, y, z0, x1, y, z0,
    x1, y, z0, x1, y, z1,
    x1, y, z1, x0, y, z1,
    x0, y, z1, x0, y, z0,
  ]; // prettier-ignore
}

export function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function boxEdgeSegments(node: CityNode, minHeight = 0): number[] {
  const { position, width, depth, height } = node.dimensions;
  const x0 = position.x;
  const x1 = position.x + width;
  const y0 = position.y;
  const y1 = position.y + Math.max(height, minHeight);
  const z0 = position.z;
  const z1 = position.z + depth;
  const corners: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ]; // prettier-ignore
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]; // prettier-ignore
  return edges.flatMap(([a, b]) => [...corners[a], ...corners[b]]);
}
