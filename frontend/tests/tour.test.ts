// Tests the tour helpers: suggestion, layers per station, saving, loading and keys.
import { describe, expect, it } from "vitest";
import { suggestTour } from "../src/tour/suggest";
import {
  allTouchedLayers,
  emptyTour,
  foldLayers,
  keyToAction,
  moveStation,
  newStation,
  parseTour,
  repoKey,
  serializeTour,
} from "../src/tour/tour";
import { readSaved, removeSaved, writeSaved } from "../src/tour/storage";
import { MAX_STATIONS, MAX_TEXT, MAX_TITLE, type Station } from "../src/tour/types";
import type { ArchitectureNode, CityModel, CityNode, NodeType } from "../src/types/cityModel";

function node(id: string, type: NodeType, parentId: string | null, metrics: CityNode["metrics"] = {}): CityNode {
  return {
    id, path: id === "root" ? "" : id, name: id.split("/").pop() ?? id, type, parentId,
    dimensions: { position: { x: 0, y: 0, z: 0 }, width: 1, depth: 1, height: 1 }, metrics,
  }; // prettier-ignore
}

const file = (id: string, parent: string, extension = ".py") => node(id, "file", parent, { extension });
const arch = (kind: ArchitectureNode["kind"], label: string, fileId: string): ArchitectureNode => ({ id: `${kind}:${label}@${fileId}`, kind, label, fileId, line: 1 });

const nodes: CityNode[] = [
  node("root", "folder", null, { fileCount: 9 }),
  node("api", "folder", "root", { fileCount: 4 }),
  file("api/routes.py", "api"), file("api/more.py", "api"), file("api/db.py", "api"), file("api/x.ts", "api", ".ts"),
  node("web", "folder", "root", { fileCount: 2 }),
  file("web/a.ts", "web", ".ts"), file("web/b.ts", "web", ".ts"),
  node("docs", "folder", "root", { fileCount: 1 }),
  file("docs/readme.md", "docs", ".md"),
  node("empty", "empty_folder", "root", { fileCount: 0 }),
  file("Dockerfile", "root", ""),
];
const city: CityModel = {
  schemaVersion: "1.0", rootId: "root", nodes, edges: [],
  architecture: [
    arch("api", "GET /a", "api/routes.py"), arch("api", "POST /a", "api/routes.py"), arch("api", "GET /b", "api/more.py"),
    arch("database", "SQL: users", "api/db.py"), arch("external", "requests: x.io", "api/more.py"), arch("server", "Dockerfile: python", "Dockerfile"),
  ],
  symbols: [], findings: [],
};
const ids = new Set(nodes.map((n) => n.id));

describe("suggested tour", () => {
  const tour = suggestTour(city);
  const titles = tour.stations.map((s) => s.title);

  it("starts with an overview of the simple city and ends with a closing station", () => {
    expect(tour.stations[0]).toMatchObject({ nodeId: "root", title: "Welcome to root" });
    expect(tour.stations[0].layers).toEqual({ apiGates: false, databases: false, externalServices: false, servers: false, dataPaths: false });
    expect(tour.stations[0].text).toContain("8 files in 4 folders");
    expect(tour.stations.at(-1)).toMatchObject({ nodeId: "root", title: "That was the tour" });
  });

  it("shows the biggest folders first", () => {
    expect(titles.slice(1, 4)).toEqual(["api", "web", "docs"]);
    expect(tour.stations[1].text).toContain(".py (3)");
  });

  it("turns the architecture layers on one after another", () => {
    expect(titles.slice(4, 8)).toEqual(["API gates", "Databases", "External services", "Servers and containers"]);
    const [api, db, external, server] = tour.stations.slice(4, 8);
    expect(api).toMatchObject({ nodeId: "api/routes.py", layers: { apiGates: true } });
    expect(api.text).toContain("3 API routes");
    expect(api.text).toContain("GET /a, POST /a");
    expect(db).toMatchObject({ nodeId: "api/db.py", layers: { databases: true, dataPaths: true } });
    expect(external.layers).toEqual({ externalServices: true });
    expect(server).toMatchObject({ nodeId: "Dockerfile", layers: { servers: true } });
  });

  it("only mentions architecture that exists", () => {
    const plain = suggestTour({ ...city, architecture: [] });
    expect(plain.stations.map((s) => s.title)).toEqual(["Welcome to root", "api", "web", "docs", "That was the tour"]);
    const noApi = suggestTour({ ...city, architecture: [arch("database", "SQL: u", "api/db.py")] });
    expect(noApi.stations.find((s) => s.title === "Databases")?.layers.dataPaths).toBe(false);
  });

  it("uses only real places, unique ids and facts for the AI", () => {
    expect(tour.stations.every((s) => ids.has(s.nodeId))).toBe(true);
    expect(new Set(tour.stations.map((s) => s.id)).size).toBe(tour.stations.length);
    expect(tour.stations.every((s) => (s.facts ?? "").length > 0)).toBe(true);
    expect(tour.stations.length).toBeLessThanOrEqual(10);
  });

  it("lists at most five routes and says how many are left", () => {
    const many = Array.from({ length: 9 }, (_, i) => arch("api", `GET /r${i}`, "api/routes.py"));
    const text = suggestTour({ ...city, architecture: many }).stations.find((s) => s.title === "API gates")!.text;
    expect(text).toContain("and 4 more");
  });

  it("gives an empty tour for a city without a root", () => {
    expect(suggestTour({ ...city, nodes: [] }).stations).toEqual([]);
  });

  it("is the same every time", () => {
    const ignore = (t: typeof tour) => t.stations.map((s) => ({ ...s, id: "x" }));
    expect(ignore(suggestTour(city))).toEqual(ignore(tour));
  });
});

describe("layers per station", () => {
  const stations: Station[] = [
    { id: "1", nodeId: "root", title: "", text: "", layers: { apiGates: false, databases: false } },
    { id: "2", nodeId: "root", title: "", text: "", layers: {} },
    { id: "3", nodeId: "root", title: "", text: "", layers: { apiGates: true } },
    { id: "4", nodeId: "root", title: "", text: "", layers: { databases: true, apiGates: false } },
  ];

  it("adds up the changes of all stations until the current one", () => {
    expect(foldLayers(stations, 0)).toEqual({ apiGates: false, databases: false });
    expect(foldLayers(stations, 1)).toEqual({ apiGates: false, databases: false });
    expect(foldLayers(stations, 2)).toEqual({ apiGates: true, databases: false });
    expect(foldLayers(stations, 3)).toEqual({ apiGates: false, databases: true });
  });

  it("gives the same layers when going back", () => {
    expect(foldLayers(stations, 1)).toEqual(foldLayers(stations.slice(0, 2), 1));
  });

  it("lists every layer any station touches", () => {
    expect(allTouchedLayers(stations).sort()).toEqual(["apiGates", "databases"]);
    expect(allTouchedLayers([])).toEqual([]);
  });
});

describe("editing", () => {
  const three = ["a", "b", "c"].map((t) => newStation("root", t));

  it("creates stations with unique ids and cut texts", () => {
    expect(new Set(three.map((s) => s.id)).size).toBe(3);
    const long = newStation("root", "t".repeat(500), "x".repeat(5000));
    expect(long.title).toHaveLength(MAX_TITLE);
    expect(long.text).toHaveLength(MAX_TEXT);
  });

  it("moves stations and ignores impossible moves", () => {
    expect(moveStation(three, 0, 2).map((s) => s.title)).toEqual(["b", "c", "a"]);
    expect(moveStation(three, 2, 0).map((s) => s.title)).toEqual(["c", "a", "b"]);
    expect(moveStation(three, 1, 1)).toBe(three);
    expect(moveStation(three, 0, 5)).toBe(three);
    expect(moveStation(three, -1, 1)).toBe(three);
  });

  it("keeps the original list unchanged", () => {
    moveStation(three, 0, 2);
    expect(three.map((s) => s.title)).toEqual(["a", "b", "c"]);
  });
});

describe("saving and loading", () => {
  it("round-trips a tour", () => {
    const tour = suggestTour(city);
    const loaded = parseTour(serializeTour(tour), ids)!;
    expect(loaded.name).toBe(tour.name);
    expect(loaded.stations.map((s) => [s.id, s.nodeId, s.title, s.text, s.layers])).toEqual(
      tour.stations.map((s) => [s.id, s.nodeId, s.title, s.text, s.layers]),
    );
  });

  it("drops stations that point to places that do not exist", () => {
    const text = JSON.stringify({ name: "x", stations: [{ nodeId: "nope", title: "a" }, { nodeId: "web", title: "b" }] });
    expect(parseTour(text, ids)?.stations.map((s) => s.title)).toEqual(["b"]);
  });

  it.each(["", "not json", "[]", "null", '{"stations": 5}', '"text"'])("rejects %j", (text) => {
    expect(parseTour(text, ids)).toBeNull();
  });

  it("cleans odd values and unknown layers", () => {
    const text = JSON.stringify({
      name: 5,
      stations: [{ nodeId: "web", title: 7, text: "t".repeat(9999), layers: { apiGates: true, bogus: true, databases: "yes" }, id: "same" }, { nodeId: "web", id: "same" }],
    });
    const tour = parseTour(text, ids)!;
    expect(tour.name).toBe("Tour");
    expect(tour.stations[0]).toMatchObject({ title: "", layers: { apiGates: true } });
    expect(tour.stations[0].text).toHaveLength(MAX_TEXT);
    expect(new Set(tour.stations.map((s) => s.id)).size).toBe(2);
  });

  it("limits the number of stations", () => {
    const stations = Array.from({ length: MAX_STATIONS + 10 }, () => ({ nodeId: "web" }));
    expect(parseTour(JSON.stringify({ stations }), ids)?.stations).toHaveLength(MAX_STATIONS);
  });

  it("makes a key per repo that changes with its files", () => {
    expect(repoKey(city)).toBe(repoKey({ ...city }));
    expect(repoKey(city)).not.toBe(repoKey({ ...city, nodes: nodes.slice(0, -1) }));
    expect(repoKey(city).startsWith("foldercity.tour.")).toBe(true);
  });

  it("stores text in the browser or in memory", () => {
    expect(readSaved("k1")).toBeNull();
    writeSaved("k1", "value");
    expect(readSaved("k1")).toBe("value");
    removeSaved("k1");
    expect(readSaved("k1")).toBeNull();
  });

  it("starts with an empty tour", () => {
    expect(emptyTour("A")).toEqual({ version: 1, name: "A", stations: [] });
  });
});

describe("keyboard", () => {
  it.each([
    ["ArrowRight", "next"], [" ", "next"], ["PageDown", "next"], ["Enter", "next"],
    ["ArrowLeft", "previous"], ["PageUp", "previous"], ["Backspace", "previous"],
    ["Home", "first"], ["End", "last"], ["Escape", "exit"],
  ])("%j does %s", (key, action) => {
    expect(keyToAction(key)).toBe(action);
  }); // prettier-ignore

  it("ignores other keys", () => {
    expect(keyToAction("a")).toBeNull();
    expect(keyToAction("Shift")).toBeNull();
  });
});
