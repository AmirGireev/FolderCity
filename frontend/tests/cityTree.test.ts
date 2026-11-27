// Tests the folder tree rows and the layer definitions.
import { describe, expect, it } from "vitest";
import { LAYER_DEFINITIONS, defaultLayers } from "../src/city/layers";
import { ancestorIds, childrenByParent, visibleRows } from "../src/city/tree";
import type { CityModel } from "../src/types/cityModel";
import minimal from "../../schema/examples/minimal.city.json";

const city = minimal as unknown as CityModel;
const nodesById = new Map(city.nodes.map((n) => [n.id, n]));
const children = childrenByParent(city.nodes);

describe("folder tree", () => {
  it("lists folders before files, then by name", () => {
    expect(children.get("root")?.map((n) => n.id)).toEqual(["assets", "src"]);
    expect(children.get("src")?.map((n) => n.id)).toEqual(["src/__init__.py", "src/db.py", "src/main.py"]);
  });

  it("shows only the root when nothing is expanded", () => {
    const rows = visibleRows("root", nodesById, children, new Set());
    expect(rows.map((r) => r.node.id)).toEqual(["root"]);
    expect(rows[0]).toMatchObject({ level: 0, hasChildren: true, expanded: false });
  });

  it("shows children of expanded folders with their level", () => {
    const rows = visibleRows("root", nodesById, children, new Set(["root", "src"]));
    expect(rows.map((r) => [r.node.id, r.level])).toEqual([
      ["root", 0],
      ["assets", 1],
      ["src", 1],
      ["src/__init__.py", 2],
      ["src/db.py", 2],
      ["src/main.py", 2],
    ]);
  });

  it("finds the ancestors of a node, nearest first", () => {
    expect(ancestorIds("src/main.py", nodesById)).toEqual(["src", "root"]);
    expect(ancestorIds("root", nodesById)).toEqual([]);
  });
});

describe("layers", () => {
  it("starts with the simple city: only empty files, empty folders and block merging are on", () => {
    const on = Object.entries(defaultLayers()).filter(([, value]) => value).map(([key]) => key);
    expect(on.sort()).toEqual(["emptyFiles", "emptyFolders", "mergeFolders"]);
  });

  it("offers ten switches", () => {
    expect(LAYER_DEFINITIONS).toHaveLength(10);
  });

  it("marks layers without data as unavailable", () => {
    const available = (key: string) => LAYER_DEFINITIONS.find((l) => l.key === key)!.isAvailable(city);
    expect(available("emptyFiles")).toBe(true);
    expect(available("apiGates")).toBe(true);
    expect(available("databases")).toBe(true);
    expect(available("dataPaths")).toBe(false);
    expect(available("externalServices")).toBe(false);
    expect(available("servers")).toBe(false);
    expect(available("complexity")).toBe(false);
    expect(available("errors")).toBe(false);
    expect(LAYER_DEFINITIONS.find((l) => l.key === "apiGates")!.isAvailable(null)).toBe(false);
  });
});
