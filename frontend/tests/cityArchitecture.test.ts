// Tests placing architecture elements, finding presumed data paths and selecting elements.
import { beforeEach, describe, expect, it } from "vitest";
import { ARCH_LAYER, GATE, architectureByFile, nearestEdge, placeArchitecture } from "../src/city/architecture";
import { architectureColor } from "../src/city/colors";
import { MAX_PATHS, findDataPaths } from "../src/city/dataPaths";
import { LAYER_DEFINITIONS } from "../src/city/layers";
import { useCityStore } from "../src/city/store";
import type { ArchitectureNode, CityModel, CityNode, NodeType } from "../src/types/cityModel";

function node(id: string, type: NodeType, parentId: string | null, x: number, z: number, w: number, d: number, y: number, h: number): CityNode {
  return {
    id, path: id === "root" ? "" : id, name: id.split("/").pop() ?? id, type, parentId,
    dimensions: { position: { x, y, z }, width: w, depth: d, height: h }, metrics: {},
  }; // prettier-ignore
}

const arch = (kind: ArchitectureNode["kind"], label: string, fileId: string, line = 1): ArchitectureNode => ({
  id: `${kind}:${label}@${fileId}`, kind, label, fileId, line,
}); // prettier-ignore

const nodes: CityNode[] = [
  node("root", "folder", null, 0, 0, 100, 100, 0, 1),
  node("src", "folder", "root", 2, 2, 60, 60, 1, 1),
  node("src/main.py", "file", "src", 10, 5, 4, 4, 2, 6),
  node("src/other.py", "file", "src", 30, 6, 4, 4, 2, 6),
  node("src/service.py", "file", "src", 30, 40, 4, 4, 2, 6),
  node("src/db.py", "file", "src", 10, 50, 6, 4, 2, 6),
  node("Dockerfile", "file", "root", 80, 80, 4, 4, 1, 3),
];

const architecture: ArchitectureNode[] = [
  arch("api", "GET /a", "src/main.py", 3),
  arch("api", "POST /a", "src/main.py", 9),
  arch("api", "GET /b", "src/other.py"),
  arch("database", "SQL: users", "src/db.py", 7),
  arch("external", "requests: api.x.com", "src/service.py", 5),
  arch("server", "Dockerfile: python", "Dockerfile"),
  arch("database", "SQLAlchemy", "src/service.py", 2),
];

const city: CityModel = {
  schemaVersion: "1.0",
  rootId: "root",
  nodes,
  edges: [
    { source: "src/main.py", target: "src/service.py", line: 1 },
    { source: "src/service.py", target: "src/db.py", line: 2 },
    { source: "src/main.py", target: "src/db.py", line: 3 },
    { source: "src/db.py", target: "src/main.py", line: 1 },
  ],
  architecture,
  symbols: [],
};
const nodesById = new Map(nodes.map((n) => [n.id, n]));

describe("placing architecture elements", () => {
  it("finds the nearest edge of a folder", () => {
    const folder = nodesById.get("src")!;
    expect(nearestEdge(folder, 20, 3)).toBe("north");
    expect(nearestEdge(folder, 20, 60)).toBe("south");
    expect(nearestEdge(folder, 3, 30)).toBe("west");
    expect(nearestEdge(folder, 60, 30)).toBe("east");
  });

  it("builds every gate from two posts and a lintel inside its folder", () => {
    const placement = placeArchitecture(city, nodesById);
    const gate = placement.shapes.filter((s) => s.archId === "api:GET /b@src/other.py");
    expect(gate).toHaveLength(3);
    expect(gate.every((s) => s.shape === "box" && s.kind === "api")).toBe(true);
    const folder = nodesById.get("src")!.dimensions;
    for (const shape of placement.shapes.filter((s) => s.kind === "api")) {
      expect(shape.position[0]).toBeGreaterThanOrEqual(folder.position.x);
      expect(shape.position[0]).toBeLessThanOrEqual(folder.position.x + folder.width);
      expect(shape.position[2]).toBeGreaterThanOrEqual(folder.position.z);
      expect(shape.position[2]).toBeLessThanOrEqual(folder.position.z + folder.depth);
      expect(shape.position[1]).toBeGreaterThan(folder.position.y + folder.height);
    }
  });

  it("puts a gate at the edge nearest to its file", () => {
    const placement = placeArchitecture(city, nodesById);
    const anchor = placement.anchors.get("api:GET /b@src/other.py")!;
    expect(anchor[2]).toBeCloseTo(2 + GATE.inset + GATE.depth / 2);
    expect(anchor[0]).toBeCloseTo(32);
  });

  it("spaces gates on the same edge so they do not overlap", () => {
    const placement = placeArchitecture(city, nodesById);
    const a = placement.anchors.get("api:GET /a@src/main.py")!;
    const b = placement.anchors.get("api:POST /a@src/main.py")!;
    expect(Math.abs(a[0] - b[0])).toBeGreaterThanOrEqual(GATE.width + GATE.gap - 1e-9);
  });

  it("stands databases and servers on the roof and floats satellites above", () => {
    const placement = placeArchitecture(city, nodesById);
    const db = placement.shapes.find((s) => s.archId === "database:SQL: users@src/db.py")!;
    expect(db.shape).toBe("cylinder");
    expect(db.position[1] - db.scale[1] / 2).toBeCloseTo(2 + 6);
    const server = placement.shapes.find((s) => s.archId === "server:Dockerfile: python@Dockerfile")!;
    expect(server.shape).toBe("box");
    expect(server.position[1] - server.scale[1] / 2).toBeCloseTo(1 + 3);
    const satellite = placement.shapes.filter((s) => s.archId === "external:requests: api.x.com@src/service.py");
    expect(satellite.map((s) => s.shape).sort()).toEqual(["box", "sphere"]);
  });

  it("lines up several roof items of one file side by side", () => {
    const placement = placeArchitecture(city, nodesById);
    const mine = placement.shapes.filter((s) => s.archId.endsWith("@src/service.py"));
    const xs = [...new Set(mine.map((s) => s.position[0]))];
    expect(xs.length).toBe(2);
    for (const x of xs) {
      expect(x).toBeGreaterThan(30);
      expect(x).toBeLessThan(34);
    }
  });

  it("gives every element an anchor and skips hidden files", () => {
    const all = placeArchitecture(city, nodesById);
    for (const item of architecture) expect(all.anchors.has(item.id)).toBe(true);
    const some = placeArchitecture(city, nodesById, new Set(["src/db.py", "src/main.py"]));
    expect(some.anchors.has("database:SQL: users@src/db.py")).toBe(false);
    expect(some.anchors.has("api:GET /a@src/main.py")).toBe(false);
    expect(some.anchors.has("api:GET /b@src/other.py")).toBe(true);
  });

  it("uses one color per kind and one layer per kind", () => {
    const colors = new Set(["api", "database", "external", "server"].map((k) => architectureColor(k as "api")));
    expect(colors.size).toBe(4);
    expect(ARCH_LAYER).toEqual({ api: "apiGates", database: "databases", external: "externalServices", server: "servers" });
  });

  it("groups elements by file", () => {
    expect(architectureByFile(city).get("src/main.py")).toHaveLength(2);
  });
});

describe("presumed data paths", () => {
  it("finds the shortest import path from a gate to a file with database access", () => {
    const paths = findDataPaths(city, "api:GET /a@src/main.py");
    const toUsers = paths.find((p) => p.database.label === "SQL: users")!;
    expect(toUsers.files).toEqual(["src/main.py", "src/db.py"]);
    const viaService = paths.find((p) => p.database.label === "SQLAlchemy")!;
    expect(viaService.files).toEqual(["src/main.py", "src/service.py"]);
  });

  it("returns a path of length one when the gate file itself accesses the database", () => {
    const own = { ...city, architecture: [...architecture, arch("database", "SQL: own", "src/main.py")] };
    expect(findDataPaths(own, "api:GET /a@src/main.py").some((p) => p.files.length === 1 && p.database.label === "SQL: own")).toBe(true);
  });

  it("finds nothing when no database can be reached", () => {
    expect(findDataPaths(city, "api:GET /b@src/other.py")).toEqual([]);
  });

  it("ignores unknown ids and elements that are not gates", () => {
    expect(findDataPaths(city, "nope")).toEqual([]);
    expect(findDataPaths(city, "database:SQL: users@src/db.py")).toEqual([]);
  });

  it("survives import cycles", () => {
    expect(findDataPaths(city, "api:GET /a@src/main.py").length).toBeGreaterThan(0);
  });

  it("never returns more than the maximum number of paths", () => {
    const many: ArchitectureNode[] = [arch("api", "GET /x", "src/main.py")];
    for (let i = 0; i < MAX_PATHS + 5; i++) many.push(arch("database", `SQL: t${i}`, "src/db.py"));
    expect(findDataPaths({ ...city, architecture: many }, many[0].id)).toHaveLength(MAX_PATHS);
  });
});

describe("layers and selection of architecture elements", () => {
  beforeEach(() => {
    useCityStore.getState().setCity(null);
  });

  it("enables all architecture layers and reports whether they found something", () => {
    const definition = (key: string) => LAYER_DEFINITIONS.find((l) => l.key === key)!;
    for (const key of ["apiGates", "databases", "externalServices", "servers", "dataPaths"]) {
      expect(definition(key).isAvailable(city)).toBe(true);
      expect(definition(key).isAvailable(null)).toBe(true);
      expect(definition(key).hasData!(city)).toBe(true);
    }
    expect(definition("complexity").isAvailable(city)).toBe(false);
    expect(definition("errors").isAvailable(city)).toBe(false);
    const empty = { ...city, architecture: [] };
    expect(definition("apiGates").isAvailable(empty)).toBe(true);
    expect(definition("apiGates").hasData!(empty)).toBe(false);
    const noDb = { ...city, architecture: architecture.filter((a) => a.kind !== "database") };
    expect(definition("dataPaths").hasData!(noDb)).toBe(false);
  });

  it("starts with every architecture layer off", () => {
    const layers = useCityStore.getState().layers;
    for (const key of ["apiGates", "databases", "externalServices", "servers", "dataPaths"] as const) {
      expect(layers[key]).toBe(false);
    }
  });

  it("selecting an element selects its file and marks its line", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().selectArch("api:POST /a@src/main.py");
    const state = useCityStore.getState();
    expect(state.selectedArchId).toBe("api:POST /a@src/main.py");
    expect(state.selectedId).toBe("src/main.py");
    expect(state.highlight).toMatchObject({ fileId: "src/main.py", startLine: 9, endLine: 9 });
    expect(state.expandedIds.has("src")).toBe(true);
  });

  it("selecting another file clears the element, selecting the same file keeps it", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().selectArch("api:GET /a@src/main.py");
    useCityStore.getState().select("src/main.py");
    expect(useCityStore.getState().selectedArchId).toBe("api:GET /a@src/main.py");
    useCityStore.getState().select("src/db.py");
    expect(useCityStore.getState().selectedArchId).toBeNull();
  });

  it("ignores unknown elements and can be cleared", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().selectArch("nope");
    expect(useCityStore.getState().selectedArchId).toBeNull();
    useCityStore.getState().selectArch("api:GET /a@src/main.py");
    useCityStore.getState().selectArch(null);
    expect(useCityStore.getState().selectedArchId).toBeNull();
  });
});
