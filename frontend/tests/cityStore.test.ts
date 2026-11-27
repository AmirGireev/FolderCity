// Tests the city store: selection, layer switches and flyTo requests.
import { beforeEach, describe, expect, it } from "vitest";
import { defaultLayers } from "../src/city/layers";
import { useCityStore } from "../src/city/store";
import type { CityModel } from "../src/types/cityModel";
import minimal from "../../schema/examples/minimal.city.json";

const city = minimal as unknown as CityModel;

beforeEach(() => {
  useCityStore.getState().setCity(null);
});

describe("city store", () => {
  it("starts empty and shows empty files and folders by default", () => {
    const state = useCityStore.getState();
    expect(state.city).toBeNull();
    expect(state.layers).toEqual(defaultLayers());
  });

  it("loading a city indexes the nodes and requests an instant view of the root", () => {
    useCityStore.getState().setCity(city);
    const state = useCityStore.getState();
    expect(state.nodesById.size).toBe(city.nodes.length);
    expect(state.cameraRequest).toMatchObject({ nodeId: city.rootId, instant: true });
  });

  it("selects known nodes and ignores unknown ones", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().select("src/main.py");
    expect(useCityStore.getState().selectedId).toBe("src/main.py");
    useCityStore.getState().select("nope");
    expect(useCityStore.getState().selectedId).toBeNull();
  });

  it("flyTo creates a new smooth request each time and ignores unknown ids", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().flyTo("src");
    const first = useCityStore.getState().cameraRequest;
    expect(first).toMatchObject({ nodeId: "src", instant: false });
    useCityStore.getState().flyTo("src");
    expect(useCityStore.getState().cameraRequest?.seq).toBe((first?.seq ?? 0) + 1);
    useCityStore.getState().flyTo("nope");
    expect(useCityStore.getState().cameraRequest?.nodeId).toBe("src");
  });

  it("layer switches change only their own layer", () => {
    useCityStore.getState().setLayer("emptyFiles", false);
    expect(useCityStore.getState().layers).toEqual({ ...defaultLayers(), emptyFiles: false });
  });

  it("loading a new city clears selection and hover", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().select("src");
    useCityStore.getState().hover("src");
    useCityStore.getState().setCity(city);
    expect(useCityStore.getState().selectedId).toBeNull();
    expect(useCityStore.getState().hoverId).toBeNull();
  });

  it("selecting a node expands all folders on its path", () => {
    useCityStore.getState().setCity(city);
    expect(useCityStore.getState().expandedIds.has("src")).toBe(false);
    useCityStore.getState().select("src/main.py");
    expect(useCityStore.getState().expandedIds.has("src")).toBe(true);
    expect(useCityStore.getState().expandedIds.has(city.rootId)).toBe(true);
  });

  it("toggleExpanded opens and closes a folder", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().toggleExpanded("src");
    expect(useCityStore.getState().expandedIds.has("src")).toBe(true);
    useCityStore.getState().toggleExpanded("src");
    expect(useCityStore.getState().expandedIds.has("src")).toBe(false);
  });

  it("selectAndFly selects the node and moves the camera", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().selectAndFly("src/db.py");
    expect(useCityStore.getState().selectedId).toBe("src/db.py");
    expect(useCityStore.getState().cameraRequest).toMatchObject({ nodeId: "src/db.py", instant: false });
  });
});
