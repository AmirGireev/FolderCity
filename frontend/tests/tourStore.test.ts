// Tests the tour store: editing, saving, playing with layer changes, calm mode and the AI notes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/chat/api";
import { useCityStore } from "../src/city/store";
import { readSaved, removeSaved, writeSaved } from "../src/tour/storage";
import { repoKey, serializeTour } from "../src/tour/tour";
import { useTourStore } from "../src/tour/tourStore";
import { MAX_STATIONS, type Tour } from "../src/tour/types";
import type { ArchitectureNode, CityModel, CityNode, NodeType } from "../src/types/cityModel";

vi.mock("../src/tour/api", () => ({ fetchStationTexts: vi.fn() }));
import { fetchStationTexts } from "../src/tour/api";

function node(id: string, type: NodeType, parentId: string | null, metrics: CityNode["metrics"] = {}): CityNode {
  return {
    id, path: id === "root" ? "" : id, name: id.split("/").pop() ?? id, type, parentId,
    dimensions: { position: { x: 0, y: 0, z: 0 }, width: 1, depth: 1, height: 1 }, metrics,
  }; // prettier-ignore
}

const arch = (kind: ArchitectureNode["kind"], label: string, fileId: string): ArchitectureNode => ({ id: `${kind}:${label}@${fileId}`, kind, label, fileId, line: 1 });

function makeCity(extra: CityNode[] = []): CityModel {
  return {
    schemaVersion: "1.0",
    rootId: "root",
    nodes: [
      node("root", "folder", null, { fileCount: 3 }),
      node("api", "folder", "root", { fileCount: 2 }),
      node("api/routes.py", "file", "api", { extension: ".py", lines: 10 }),
      node("api/db.py", "file", "api", { extension: ".py", lines: 5 }),
      node("README.md", "file", "root", { extension: ".md" }),
      ...extra,
    ],
    edges: [],
    architecture: [arch("api", "GET /a", "api/routes.py"), arch("database", "SQL: users", "api/db.py")],
    symbols: [], findings: [],
  };
}

const tour = () => useTourStore.getState();
const layers = () => useCityStore.getState().layers;

function loadCity(city = makeCity()) {
  removeSaved(repoKey(city));
  useCityStore.getState().setCity(city);
  tour().loadForCity();
  return city;
}

beforeEach(() => {
  vi.resetAllMocks();
  loadCity();
  for (const key of ["apiGates", "databases", "externalServices", "servers", "dataPaths"] as const) useCityStore.getState().setLayer(key, false);
});

describe("suggesting and editing", () => {
  it("starts without a tour and suggests one that is saved", () => {
    expect(tour().tour).toBeNull();
    tour().suggest();
    const titles = tour().tour!.stations.map((s) => s.title);
    expect(titles[0]).toBe("Welcome to root");
    expect(titles).toContain("API gates");
    expect(readSaved(repoKey(useCityStore.getState().city!))).toContain("Welcome to root");
    expect(tour().editing).toBe(tour().tour!.stations[0].id);
  });

  it("adds a station at the selected place, or at the root when nothing is selected", () => {
    tour().createEmpty();
    tour().addStation();
    useCityStore.getState().select("api/db.py");
    tour().addStation();
    expect(tour().tour!.stations.map((s) => [s.nodeId, s.title])).toEqual([["root", "root"], ["api/db.py", "db.py"]]);
    expect(tour().editing).toBe(tour().tour!.stations[1].id);
  });

  it("limits the number of stations", () => {
    tour().createEmpty();
    for (let i = 0; i < MAX_STATIONS + 3; i++) tour().addStation();
    expect(tour().tour!.stations).toHaveLength(MAX_STATIONS);
    expect(tour().message).toContain("at most");
  });

  it("changes title, text and place and cuts long values", () => {
    tour().suggest();
    const id = tour().tour!.stations[1].id;
    tour().updateStation(id, { title: "New title", text: "x".repeat(2000) });
    useCityStore.getState().select("README.md");
    tour().useSelection(id);
    const station = tour().tour!.stations[1];
    expect(station.title).toBe("New title");
    expect(station.text).toHaveLength(500);
    expect(station.nodeId).toBe("README.md");
  });

  it("does nothing for use-selection without a selection", () => {
    tour().suggest();
    useCityStore.getState().select(null);
    const before = tour().tour!.stations[1].nodeId;
    tour().useSelection(tour().tour!.stations[1].id);
    expect(tour().tour!.stations[1].nodeId).toBe(before);
  });

  it("sets layers per station as keep, on or off", () => {
    tour().suggest();
    const id = tour().tour!.stations[1].id;
    tour().setLayerChoice(id, "servers", "on");
    tour().setLayerChoice(id, "databases", "off");
    expect(tour().tour!.stations[1].layers).toMatchObject({ servers: true, databases: false });
    tour().setLayerChoice(id, "servers", "keep");
    expect(tour().tour!.stations[1].layers).not.toHaveProperty("servers");
  });

  it("moves, deletes and renames", () => {
    tour().suggest();
    const [first, second] = tour().tour!.stations;
    tour().moveStationBy(second.id, -1);
    expect(tour().tour!.stations.slice(0, 2).map((s) => s.id)).toEqual([second.id, first.id]);
    tour().moveStationBy(second.id, -1);
    expect(tour().tour!.stations[0].id).toBe(second.id);
    tour().edit(second.id);
    tour().removeStation(second.id);
    expect(tour().tour!.stations.some((s) => s.id === second.id)).toBe(false);
    expect(tour().editing).toBe(first.id);
    tour().rename("My demo");
    expect(tour().tour!.name).toBe("My demo");
    tour().rename("");
    expect(tour().tour!.name).toBe("My demo");
  });

  it("forgets the saved tour when the last station is deleted", () => {
    tour().createEmpty();
    tour().addStation();
    expect(readSaved(repoKey(useCityStore.getState().city!))).not.toBeNull();
    tour().removeStation(tour().tour!.stations[0].id);
    expect(readSaved(repoKey(useCityStore.getState().city!))).toBeNull();
  });

  it("opens the editor with an empty tour when there is none", () => {
    tour().openEditor();
    expect(tour().editorOpen).toBe(true);
    expect(tour().tour?.stations).toEqual([]);
    tour().closeEditor();
    expect(tour().editorOpen).toBe(false);
  });
});

describe("saving, loading and sharing", () => {
  it("loads the saved tour again for the same repo", () => {
    tour().suggest();
    const saved = tour().tour!;
    useCityStore.getState().setCity({ ...makeCity() });
    tour().loadForCity();
    expect(tour().tour!.stations.map((s) => s.id)).toEqual(saved.stations.map((s) => s.id));
  });

  it("starts empty for a different repo", () => {
    tour().suggest();
    loadCity(makeCity([node("other.py", "file", "root", { extension: ".py" })]));
    expect(tour().tour).toBeNull();
  });

  it("exports and imports a tour and refuses bad files", () => {
    tour().suggest();
    const text = tour().exportJson();
    tour().removeStation(tour().tour!.stations[0].id);
    expect(tour().importJson(text)).toBe(true);
    expect(tour().tour!.stations[0].title).toBe("Welcome to root");
    expect(tour().importJson("nonsense")).toBe(false);
    expect(tour().message).toContain("not a tour");
    expect(tour().importJson(JSON.stringify({ stations: [{ nodeId: "missing" }] }))).toBe(false);
  });

  it("ignores a saved tour whose places no longer exist", () => {
    const city = loadCity();
    const broken: Tour = { version: 1, name: "x", stations: [{ id: "a", nodeId: "gone", title: "t", text: "", layers: {} }] };
    writeSaved(repoKey(city), serializeTour(broken));
    tour().loadForCity();
    expect(tour().tour).toBeNull();
  });

  it("is reset when another city is loaded", () => {
    tour().suggest();
    tour().start();
    useCityStore.getState().setCity(makeCity([node("zzz", "file", "root")]));
    expect(tour().playing).toBe(false);
    expect(tour().calm).toBe(false);
  });
});

describe("playing the tour", () => {
  function playableTour() {
    tour().suggest();
    const stations = tour().tour!.stations;
    return stations;
  }

  it("starts in calm mode with the simple city and flies to the first station", () => {
    useCityStore.getState().setLayer("apiGates", true);
    playableTour();
    tour().start();
    expect(tour().playing && tour().calm).toBe(true);
    expect(tour().index).toBe(0);
    expect(layers().apiGates).toBe(false);
    expect(useCityStore.getState().selectedId).toBe("root");
    expect(useCityStore.getState().cameraRequest).toMatchObject({ nodeId: "root", instant: false });
  });

  it("turns layers on while going forward and off again when going back", () => {
    const stations = playableTour();
    tour().start();
    const apiIndex = stations.findIndex((s) => s.title === "API gates");
    const dbIndex = stations.findIndex((s) => s.title === "Databases");
    tour().goTo(apiIndex);
    expect(layers().apiGates).toBe(true);
    expect(layers().databases).toBe(false);
    expect(useCityStore.getState().selectedId).toBe("api/routes.py");
    tour().goTo(dbIndex);
    expect(layers().databases).toBe(true);
    expect(layers().apiGates).toBe(true);
    tour().goTo(apiIndex);
    expect(layers().databases).toBe(false);
    tour().goTo(0);
    expect(layers().apiGates).toBe(false);
  });

  it("goes next and back, and stays inside the tour", () => {
    const stations = playableTour();
    tour().start();
    tour().previous();
    expect(tour().index).toBe(0);
    tour().next();
    expect(tour().index).toBe(1);
    tour().goTo(999);
    expect(tour().index).toBe(stations.length - 1);
    tour().next();
    expect(tour().index).toBe(stations.length - 1);
    tour().goTo(-5);
    expect(tour().index).toBe(0);
  });

  it("restores the layers from before the tour when it ends", () => {
    useCityStore.getState().setLayer("servers", true);
    playableTour();
    tour().start();
    tour().goTo(tour().tour!.stations.length - 1);
    expect(layers().servers).toBe(false);
    tour().stop();
    expect(tour().playing).toBe(false);
    expect(tour().calm).toBe(false);
    expect(layers().servers).toBe(true);
    expect(layers().apiGates).toBe(false);
  });

  it("does not start without stations and ignores moves when not playing", () => {
    tour().start();
    expect(tour().playing).toBe(false);
    playableTour();
    tour().next();
    expect(tour().index).toBe(0);
    tour().stop();
    expect(tour().calm).toBe(false);
  });

  it("can show one station in the editor without starting the tour", () => {
    const stations = playableTour();
    tour().show(stations.findIndex((s) => s.title === "API gates"));
    expect(layers().apiGates).toBe(true);
    expect(tour().playing).toBe(false);
    expect(useCityStore.getState().selectedId).toBe("api/routes.py");
  });

  it("closes the editor when the tour starts", () => {
    playableTour();
    tour().openEditor();
    tour().start();
    expect(tour().editorOpen).toBe(false);
  });
});

describe("AI speaker notes", () => {
  const mocked = () => vi.mocked(fetchStationTexts);

  it("replaces title and text of the stations the AI answered", async () => {
    tour().suggest();
    const [first, second] = tour().tour!.stations;
    mocked().mockResolvedValue([{ id: first.id, title: "Hello", text: "A nice start." }]);
    await tour().improveWithAi();
    expect(tour().tour!.stations[0]).toMatchObject({ title: "Hello", text: "A nice start." });
    expect(tour().tour!.stations[1].title).toBe(second.title);
    expect(tour().message).toContain("Updated 1 of");
    expect(tour().aiBusy).toBe(false);
    const [repoName, sent] = mocked().mock.calls[0];
    expect(repoName).toBe("root");
    expect(sent[0]).toMatchObject({ id: first.id });
    expect(sent.every((s) => s.facts.length > 0)).toBe(true);
  });

  it("builds facts for stations the user added", async () => {
    tour().createEmpty();
    useCityStore.getState().select("api/routes.py");
    tour().addStation();
    mocked().mockResolvedValue([]);
    await tour().improveWithAi();
    expect(mocked().mock.calls[0][1][0].facts).toContain("File api/routes.py, 10 lines.");
    expect(mocked().mock.calls[0][1][0].facts).toContain("api: GET /a");
  });

  it("shows the server message when the AI is not available", async () => {
    tour().suggest();
    mocked().mockRejectedValue(new ApiError(503, "No AI model is set up on the server."));
    await tour().improveWithAi();
    expect(tour().message).toBe("No AI model is set up on the server.");
    expect(tour().aiBusy).toBe(false);
    expect(tour().tour!.stations[0].title).toBe("Welcome to root");
  });

  it("does nothing without stations or while busy", async () => {
    await tour().improveWithAi();
    expect(mocked()).not.toHaveBeenCalled();
  });

  it("sends at most twelve stations", async () => {
    tour().createEmpty();
    for (let i = 0; i < 20; i++) tour().addStation();
    mocked().mockResolvedValue([]);
    await tour().improveWithAi();
    expect(mocked().mock.calls[0][1]).toHaveLength(12);
  });
});
