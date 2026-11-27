// Tests collapsing far-away folders and folders with many one-file subfolders.
import { describe, expect, it } from "vitest";
import {
  buildCollapseIndex,
  clusterNode,
  computeCollapsed,
  distanceToNode,
  forcedOpenIds,
  hiddenIds,
  sameSet,
} from "../src/city/collapse";
import type { CityModel, CityNode, NodeType } from "../src/types/cityModel";

function make(
  id: string, type: NodeType, parentId: string | null,
  box: [number, number, number, number, number], metrics: CityNode["metrics"] = {},
): CityNode {
  const [x, y, z, size, height] = box;
  return {
    id, path: id === "root" ? "" : id, name: id.split("/").pop() ?? id, type, parentId,
    dimensions: { position: { x, y, z }, width: size, depth: size, height }, metrics,
  }; // prettier-ignore
}

const file = (id: string, parent: string, x: number, z: number, ext = ".py", height = 5) =>
  make(id, "file", parent, [x, 2, z, 2, height], { extension: ext, lines: 10 });

const nodes: CityNode[] = [
  make("root", "folder", null, [0, 0, 0, 200, 1], { fileCount: 12 }),
  make("big", "folder", "root", [0, 1, 0, 40, 1], { fileCount: 5 }),
  ...[0, 1, 2, 3, 4].map((i) => file(`big/f${i}.ts`, "big", i * 3, 0, ".ts", 10 + i)),
  make("sparse", "folder", "root", [100, 1, 0, 20, 1], { fileCount: 4 }),
  ...[0, 1, 2, 3].flatMap((i) => [
    make(`sparse/d${i}`, "folder", "sparse", [100 + i * 4, 2, 0, 3, 1], { fileCount: 1 }),
    file(`sparse/d${i}/a.py`, `sparse/d${i}`, 100 + i * 4, 0),
  ]),
  make("small", "folder", "root", [150, 1, 0, 10, 1], { fileCount: 1 }),
  file("small/only.py", "small", 150, 0),
  make("empty", "empty_folder", "root", [170, 1, 0, 5, 0], { fileCount: 0 }),
];
const city = { schemaVersion: "1.0", rootId: "root", nodes, edges: [], architecture: [] } as CityModel;
const nodesById = new Map(nodes.map((n) => [n.id, n]));
const index = buildCollapseIndex(city);
const none = new Set<string>();

describe("collapse index", () => {
  it("makes folders with enough files candidates", () => {
    expect(index.info.get("big")).toMatchObject({ candidate: true, sparse: false, size: 40 });
  });

  it("detects folders with many one-file subfolders as sparse", () => {
    expect(index.info.get("sparse")).toMatchObject({ candidate: true, sparse: true });
  });

  it("never collapses the root, tiny folders or empty folders", () => {
    expect(index.info.get("root")?.candidate).toBe(false);
    expect(index.info.get("small")?.candidate).toBe(false);
    expect(index.info.get("empty")?.candidate).toBe(false);
  });

  it("is not sparse with fewer than four subfolders", () => {
    const fewer = { ...city, nodes: nodes.filter((n) => !n.id.startsWith("sparse/d3")) };
    expect(buildCollapseIndex(fewer).info.get("sparse")?.sparse).toBe(false);
  });

  it("remembers the most common file type and the block height", () => {
    expect(index.info.get("big")?.dominantExtension).toBe(".ts");
    const height = index.info.get("big")?.clusterHeight ?? 0;
    expect(height).toBeGreaterThanOrEqual(2);
    expect(height).toBeLessThanOrEqual(25);
  });
});

describe("computeCollapsed", () => {
  it("collapses folders that are far away and keeps near ones open", () => {
    const far = computeCollapsed(index, [20, 300, 20], none, none);
    expect(far.has("big")).toBe(true);
    const near = computeCollapsed(index, [20, 30, 20], none, none);
    expect(near.has("big")).toBe(false);
  });

  it("collapses sparse folders earlier than normal ones", () => {
    const camera: [number, number, number] = [110, 60, 10];
    const result = computeCollapsed(index, camera, none, none);
    expect(result.has("sparse")).toBe(true);
    expect(result.has("big")).toBe(false);
  });

  it("never collapses tiny or empty folders", () => {
    const far = computeCollapsed(index, [0, 5000, 0], none, none);
    expect(far.has("small")).toBe(false);
    expect(far.has("empty")).toBe(false);
    expect(far.has("root")).toBe(false);
  });

  it("keeps folders open that are on the path of the selection", () => {
    const forced = forcedOpenIds("big/f1.ts", nodesById);
    expect([...forced]).toEqual(["big", "root"]);
    expect(computeCollapsed(index, [20, 300, 20], none, forced).has("big")).toBe(false);
  });

  it("uses a margin so folders do not flicker at the limit", () => {
    const limit = 4 * 40;
    const camera = (distance: number): [number, number, number] => [20, 1 + distance, 20];
    const justFar = camera(limit * 1.05);
    expect(computeCollapsed(index, justFar, none, none).has("big")).toBe(false);
    expect(computeCollapsed(index, justFar, new Set(["big"]), none).has("big")).toBe(true);
    const justNear = camera(limit * 0.95);
    expect(computeCollapsed(index, justNear, new Set(["big"]), none).has("big")).toBe(true);
    expect(computeCollapsed(index, camera(limit * 0.8), new Set(["big"]), none).has("big")).toBe(false);
  });
});

describe("helpers", () => {
  it("measures the distance to the nearest point of a node", () => {
    const box = nodesById.get("big")!;
    expect(distanceToNode([20, 2, 20], box)).toBe(0);
    expect(distanceToNode([20, 12, 20], box)).toBe(10);
    expect(distanceToNode([-3, 1, -4], box)).toBe(5);
  });

  it("hides everything below collapsed folders", () => {
    const hidden = hiddenIds(new Set(["sparse"]), index);
    expect(hidden.has("sparse/d0")).toBe(true);
    expect(hidden.has("sparse/d3/a.py")).toBe(true);
    expect(hidden.has("sparse")).toBe(false);
    expect(hidden.has("big")).toBe(false);
  });

  it("builds a block that sits on top of the folder platform", () => {
    const folder = nodesById.get("big")!;
    const block = clusterNode(folder, index.info.get("big")!);
    expect(block.id).toBe("big");
    expect(block.dimensions.position.y).toBe(2);
    expect(block.dimensions.width).toBe(38);
    expect(block.dimensions.height).toBe(index.info.get("big")!.clusterHeight);
  });

  it("compares sets", () => {
    expect(sameSet(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameSet(new Set(["a"]), new Set(["b"]))).toBe(false);
    expect(sameSet(new Set(["a"]), new Set())).toBe(false);
  });
});
