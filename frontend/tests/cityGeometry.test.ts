// Tests camera poses, outlines, level of detail, colors and number formatting.
import { describe, expect, it } from "vitest";
import { colorForExtension, hashedColor } from "../src/city/colors";
import { cameraPoseFor, distanceBetween, nodeCenter, outlineSegments } from "../src/city/geometry";
import { formatBytes } from "../src/city/format";
import { nearbyFolderLabels } from "../src/city/lod";
import type { CityNode } from "../src/types/cityModel";

function node(id: string, x: number, z: number, w = 10, d = 10, h = 5, y = 0): CityNode {
  return {
    id, path: id, name: id, type: "folder", parentId: null,
    dimensions: { position: { x, y, z }, width: w, depth: d, height: h },
    metrics: {},
  }; // prettier-ignore
}

describe("geometry", () => {
  it("finds the center of a node", () => {
    expect(nodeCenter(node("a", 10, 20, 4, 6, 8, 2))).toEqual([12, 6, 23]);
  });

  it("looks at the node from a distance that grows with its size", () => {
    const small = cameraPoseFor(node("s", 0, 0, 2, 2, 1));
    const big = cameraPoseFor(node("b", 0, 0, 200, 200, 1));
    expect(small.target).toEqual(nodeCenter(node("s", 0, 0, 2, 2, 1)));
    expect(distanceBetween(small.position, small.target)).toBeGreaterThanOrEqual(12);
    expect(distanceBetween(big.position, big.target)).toBeGreaterThan(distanceBetween(small.position, small.target));
    expect(big.position[1]).toBeGreaterThan(big.target[1]);
  });

  it("draws four dashed edges around an empty folder", () => {
    const segments = outlineSegments(node("e", 1, 2, 3, 4, 0));
    expect(segments).toHaveLength(4 * 2 * 3);
    expect(segments.slice(0, 3)).toEqual([1, 0.05, 2]);
  });
});

describe("level of detail", () => {
  const folders = [node("near", 0, 0), node("mid", 40, 0), node("far", 500, 0)];

  it("keeps only close folders, nearest first", () => {
    const result = nearbyFolderLabels(folders, [0, 0, 0], 100);
    expect(result.map((n) => n.id)).toEqual(["near", "mid"]);
  });

  it("limits the number of labels", () => {
    expect(nearbyFolderLabels(folders, [0, 0, 0], 1000, 1)).toHaveLength(1);
  });
});

describe("colors and formatting", () => {
  it("colors by extension with a stable fallback", () => {
    expect(colorForExtension(".py")).toBe(colorForExtension(".py"));
    expect(colorForExtension(".py")).not.toBe(colorForExtension(".js"));
    expect(colorForExtension(".weird")).toBe(hashedColor(".weird"));
    expect(colorForExtension(undefined)).toMatch(/^#/);
  });

  it("formats sizes", () => {
    expect(formatBytes(undefined)).toBe("–");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
