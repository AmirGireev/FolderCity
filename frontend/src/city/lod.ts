// Level of detail: picks the few folder labels that are close enough to the camera.
import type { CityNode } from "../types/cityModel";
import { distanceBetween, nodeCenter, type Vec3 } from "./geometry";

export const LABEL_MAX_DISTANCE = 60;
export const LABEL_MAX_COUNT = 25;

export function nearbyFolderLabels(
  folders: CityNode[],
  camera: Vec3,
  maxDistance = LABEL_MAX_DISTANCE,
  maxCount = LABEL_MAX_COUNT,
): CityNode[] {
  return folders
    .map((node) => ({ node, distance: distanceBetween(camera, nodeCenter(node)) }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxCount)
    .map((entry) => entry.node);
}
