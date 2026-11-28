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
  symbols: [], findings: [],
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

  it("spreads several roof items of one file over the roof", () => {
    const placement = placeArchitecture(city, nodesById);
    const mine = placement.shapes.filter((s) => s.archId.endsWith("@src/service.py"));
    const spots = new Set(mine.map((s) => `${s.position[0].toFixed(3)},${s.position[2].toFixed(3)}`));
    expect(spots.size).toBe(2);
    for (const s of mine) {
      expect(s.position[0]).toBeGreaterThan(30);
      expect(s.position[0]).toBeLessThan(34);
      expect(s.position[2]).toBeGreaterThan(40);
      expect(s.position[2]).toBeLessThan(44);
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
    expect(definition("complexity").isAvailable(city)).toBe(true);
    expect(definition("errors").isAvailable(city)).toBe(true);
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

describe("gates never overlap", () => {
  function cityWithGates(folderSize: number, gates: { file: string; label: string }[]): CityModel {
    const folder = node("src", "folder", "root", 2, 2, folderSize, folderSize, 1, 1);
    const files = [
      node("src/a.py", "file", "src", 10, 10, 4, 4, 2, 6),
      node("src/b.py", "file", "src", 20, 20, 4, 4, 2, 6),
    ];
    return {
      ...city,
      nodes: [node("root", "folder", null, 0, 0, 200, 200, 0, 1), folder, ...files],
      edges: [],
      architecture: gates.map((g) => arch("api", g.label, g.file)),
    };
  }

  function boxes(placement: ReturnType<typeof placeArchitecture>) {
    const byGate = new Map<string, { x0: number; x1: number; z0: number; z1: number }>();
    for (const s of placement.shapes) {
      const box = { x0: s.position[0] - s.scale[0] / 2, x1: s.position[0] + s.scale[0] / 2, z0: s.position[2] - s.scale[2] / 2, z1: s.position[2] + s.scale[2] / 2 };
      const old = byGate.get(s.archId);
      byGate.set(s.archId, old ? { x0: Math.min(old.x0, box.x0), x1: Math.max(old.x1, box.x1), z0: Math.min(old.z0, box.z0), z1: Math.max(old.z1, box.z1) } : box);
    }
    return [...byGate.entries()];
  }

  function expectNoOverlap(placement: ReturnType<typeof placeArchitecture>, count: number) {
    const all = boxes(placement);
    expect(all).toHaveLength(count);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i][1];
        const b = all[j][1];
        const overlap = a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;
        expect(overlap, `${all[i][0]} overlaps ${all[j][0]}`).toBe(false);
      }
    }
  }

  function expectInsideFolder(placement: ReturnType<typeof placeArchitecture>, folder: CityNode) {
    const { position, width, depth } = folder.dimensions;
    for (const [id, box] of boxes(placement)) {
      expect(box.x0, id).toBeGreaterThanOrEqual(position.x - 1e-9);
      expect(box.x1, id).toBeLessThanOrEqual(position.x + width + 1e-9);
      expect(box.z0, id).toBeGreaterThanOrEqual(position.z - 1e-9);
      expect(box.z1, id).toBeLessThanOrEqual(position.z + depth + 1e-9);
    }
  }

  it("keeps twelve routes of one file apart", () => {
    const gates = Array.from({ length: 12 }, (_, i) => ({ file: "src/a.py", label: `GET /r${i}` }));
    const model = cityWithGates(40, gates);
    const placement = placeArchitecture(model, new Map(model.nodes.map((n) => [n.id, n])));
    expectNoOverlap(placement, 12);
    expectInsideFolder(placement, model.nodes[1]);
  });

  it("spreads more routes than one edge can hold over several edges", () => {
    const gates = Array.from({ length: 30 }, (_, i) => ({ file: i % 2 ? "src/a.py" : "src/b.py", label: `POST /r${i}` }));
    const model = cityWithGates(40, gates);
    const placement = placeArchitecture(model, new Map(model.nodes.map((n) => [n.id, n])));
    expectNoOverlap(placement, 30);
    expectInsideFolder(placement, model.nodes[1]);
  });

  it("makes gates narrower instead of overlapping when an edge is crowded", () => {
    const gates = Array.from({ length: 14 }, (_, i) => ({ file: "src/a.py", label: `GET /n${i}` }));
    const model = cityWithGates(40, gates);
    const placement = placeArchitecture(model, new Map(model.nodes.map((n) => [n.id, n])));
    const widths = boxes(placement).map(([, b]) => Math.max(b.x1 - b.x0, b.z1 - b.z0));
    expect(Math.min(...widths)).toBeLessThan(GATE.width);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(GATE.minWidth - 1e-9);
  });

  it("keeps gates of neighbouring edges out of the corners", () => {
    const gates = [
      { file: "src/a.py", label: "GET /north" },
      ...Array.from({ length: 16 }, (_, i) => ({ file: "src/a.py", label: `GET /more${i}` })),
    ];
    const model = cityWithGates(40, gates);
    const placement = placeArchitecture(model, new Map(model.nodes.map((n) => [n.id, n])));
    expectNoOverlap(placement, 17);
  });

  it("handles a tiny folder with one gate per edge at most", () => {
    const model = cityWithGates(8, [
      { file: "src/a.py", label: "GET /a" },
      { file: "src/a.py", label: "GET /b" },
      { file: "src/b.py", label: "GET /c" },
    ]);
    const placement = placeArchitecture(model, new Map(model.nodes.map((n) => [n.id, n])));
    expectNoOverlap(placement, 3);
    for (const shape of placement.shapes) expect(shape.position.every(Number.isFinite)).toBe(true);
  });

  it("places gates in a stable order", () => {
    const gates = Array.from({ length: 8 }, (_, i) => ({ file: "src/a.py", label: `GET /s${i}` }));
    const model = cityWithGates(40, gates);
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    const reversed = { ...model, architecture: [...model.architecture].reverse() };
    expect(placeArchitecture(reversed, byId).shapes.map((s) => s.position)).toEqual(placeArchitecture(model, byId).shapes.map((s) => s.position));
  });
});

describe("roof items never overlap", () => {
  const kinds = ["database", "server", "external"] as const;

  function roofCity(count: number, width: number, depth: number): CityModel {
    const file = node("src/big.py", "file", "src", 10, 10, width, depth, 2, 6);
    return {
      ...city,
      nodes: [node("root", "folder", null, 0, 0, 200, 200, 0, 1), node("src", "folder", "root", 2, 2, 100, 100, 1, 1), file],
      edges: [],
      architecture: Array.from({ length: count }, (_, i) => arch(kinds[i % 3], `item ${i}`, "src/big.py")),
    };
  }

  function footprints(model: CityModel) {
    const placement = placeArchitecture(model, new Map(model.nodes.map((n) => [n.id, n])));
    const byItem = new Map<string, { x0: number; x1: number; z0: number; z1: number }>();
    for (const s of placement.shapes) {
      const box = { x0: s.position[0] - s.scale[0] / 2, x1: s.position[0] + s.scale[0] / 2, z0: s.position[2] - s.scale[2] / 2, z1: s.position[2] + s.scale[2] / 2 };
      const old = byItem.get(s.archId);
      byItem.set(s.archId, old ? { x0: Math.min(old.x0, box.x0), x1: Math.max(old.x1, box.x1), z0: Math.min(old.z0, box.z0), z1: Math.max(old.z1, box.z1) } : box);
    }
    return [...byItem.values()];
  }

  it.each([[2, 4, 4], [3, 4, 4], [6, 3, 6], [9, 4, 4], [20, 5, 5], [40, 2, 2], [7, 10, 2]])(
    "%i items on a %ix%i roof stay apart and inside",
    (count, width, depth) => {
      const boxes = footprints(roofCity(count, width, depth));
      expect(boxes).toHaveLength(count);
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(b.x1).toBeLessThanOrEqual(10 + width + 1e-9);
        expect(b.z0).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(b.z1).toBeLessThanOrEqual(10 + depth + 1e-9);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          expect(a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9, `${i} overlaps ${j}`).toBe(false);
        }
      }
    },
  );

  it("makes the items smaller when there are more of them", () => {
    const size = (count: number) => {
      const [first] = footprints(roofCity(count, 4, 4));
      return first.x1 - first.x0;
    };
    expect(size(30)).toBeLessThan(size(4));
    expect(size(4)).toBeLessThan(size(1) + 1e-9);
    expect(size(100)).toBeGreaterThan(0);
  });

  it("uses the full roof depth, not just one row", () => {
    const boxes = footprints(roofCity(4, 4, 4));
    expect(new Set(boxes.map((b) => b.z0.toFixed(3))).size).toBeGreaterThan(1);
  });

  it("keeps a single item at the middle of the roof", () => {
    const [box] = footprints(roofCity(1, 4, 4));
    expect((box.x0 + box.x1) / 2).toBeCloseTo(12);
    expect((box.z0 + box.z1) / 2).toBeCloseTo(12);
  });
});

describe("scrolling and first code view", () => {
  it("scrolls only as far as needed", async () => {
    const { scrollTopToCenter, scrollTopToReveal } = await import("../src/city/scroll");
    expect(scrollTopToReveal(100, 200, 150, 20)).toBe(100);
    expect(scrollTopToReveal(100, 200, 50, 20)).toBe(50);
    expect(scrollTopToReveal(100, 200, 330, 40)).toBe(170);
    expect(scrollTopToReveal(0, 200, -10, 20)).toBe(0);
    expect(scrollTopToCenter(200, 500, 20)).toBe(410);
    expect(scrollTopToCenter(200, 10, 20)).toBe(0);
  });

  it("remembers that code was opened and forgets it for a new city", () => {
    useCityStore.getState().setCity(city);
    expect(useCityStore.getState().codeOpened).toBe(false);
    useCityStore.getState().select("src");
    expect(useCityStore.getState().codeOpened).toBe(false);
    useCityStore.getState().select("src/main.py");
    expect(useCityStore.getState().codeOpened).toBe(true);
    useCityStore.getState().select(null);
    useCityStore.getState().select("src");
    expect(useCityStore.getState().codeOpened).toBe(true);
    useCityStore.getState().setCity({ ...city });
    expect(useCityStore.getState().codeOpened).toBe(false);
  });

  it("selecting an architecture element or highlighting lines opens code too", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().selectArch("api:GET /a@src/main.py");
    expect(useCityStore.getState().codeOpened).toBe(true);
    useCityStore.getState().setCity({ ...city });
    useCityStore.getState().highlightLines("src/db.py", 1, 2);
    expect(useCityStore.getState().codeOpened).toBe(true);
  });
});
