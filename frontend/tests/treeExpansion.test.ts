// Tests that folders opened by selecting something close again when another file is selected.
import { beforeEach, describe, expect, it } from "vitest";
import { useCityStore } from "../src/city/store";
import type { CityModel, CityNode, NodeType } from "../src/types/cityModel";

function node(id: string, type: NodeType, parentId: string | null): CityNode {
  return {
    id, path: id === "root" ? "" : id, name: id.split("/").pop() ?? id, type, parentId,
    dimensions: { position: { x: 0, y: 0, z: 0 }, width: 1, depth: 1, height: 1 }, metrics: {},
  }; // prettier-ignore
}

const city: CityModel = {
  schemaVersion: "1.0",
  rootId: "root",
  nodes: [
    node("root", "folder", null),
    node("a", "folder", "root"),
    node("a/b", "folder", "a"),
    node("a/b/one.py", "file", "a/b"),
    node("a/two.py", "file", "a"),
    node("c", "folder", "root"),
    node("c/d", "folder", "c"),
    node("c/d/three.py", "file", "c/d"),
    node("e", "folder", "root"),
    node("e/four.py", "file", "e"),
  ],
  edges: [],
  architecture: [],
  symbols: [], findings: [],
};

const open = () => [...useCityStore.getState().expandedIds].sort();

beforeEach(() => {
  useCityStore.getState().setCity({ ...city });
});

describe("folders opened by a selection", () => {
  it("open along the path and close again when another file is selected", () => {
    useCityStore.getState().select("a/b/one.py");
    expect(open()).toEqual(["a", "a/b", "root"]);
    useCityStore.getState().select("c/d/three.py");
    expect(open()).toEqual(["c", "c/d", "root"]);
  });

  it("stay open when the next file lies in the same folders", () => {
    useCityStore.getState().select("a/b/one.py");
    useCityStore.getState().select("a/two.py");
    expect(open()).toEqual(["a", "root"]);
  });

  it("close even when the next file is in the root", () => {
    useCityStore.getState().select("a/b/one.py");
    useCityStore.getState().select("e/four.py");
    expect(open()).toEqual(["e", "root"]);
  });

  it("keep the folder the user opened by hand", () => {
    useCityStore.getState().toggleExpanded("a");
    useCityStore.getState().select("a/b/one.py");
    useCityStore.getState().select("c/d/three.py");
    expect(open()).toEqual(["a", "c", "c/d", "root"]);
  });

  it("become manual once the user toggles them", () => {
    useCityStore.getState().select("a/b/one.py");
    useCityStore.getState().toggleExpanded("a");
    useCityStore.getState().toggleExpanded("a");
    useCityStore.getState().select("c/d/three.py");
    expect(open()).toEqual(["a", "c", "c/d", "root"]);
  });

  it("do not close a folder that is selected itself", () => {
    useCityStore.getState().select("a/b/one.py");
    useCityStore.getState().select("a");
    expect(open()).toEqual(["a", "root"]);
    useCityStore.getState().select("c/d/three.py");
    expect(open()).toEqual(["c", "c/d", "root"]);
  });

  it("keep the root open and forget everything for a new city", () => {
    useCityStore.getState().select("e/four.py");
    useCityStore.getState().select(null);
    expect(open()).toEqual(["e", "root"]);
    useCityStore.getState().setCity({ ...city });
    expect(open()).toEqual(["root"]);
    expect([...useCityStore.getState().autoExpandedIds]).toEqual([]);
  });

  it("open again when the file is selected a second time", () => {
    useCityStore.getState().select("a/b/one.py");
    useCityStore.getState().select("e/four.py");
    useCityStore.getState().select("a/b/one.py");
    expect(open()).toEqual(["a", "a/b", "root"]);
  });
});

describe("extended details", () => {
  it("are off by default, can be switched and are kept for a new city", () => {
    expect(useCityStore.getState().extendedDetails).toBe(false);
    useCityStore.getState().setExtendedDetails(true);
    expect(useCityStore.getState().extendedDetails).toBe(true);
    useCityStore.getState().setCity({ ...city });
    expect(useCityStore.getState().extendedDetails).toBe(true);
    useCityStore.getState().setExtendedDetails(false);
    expect(useCityStore.getState().extendedDetails).toBe(false);
  });
});
