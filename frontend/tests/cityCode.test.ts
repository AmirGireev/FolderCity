// Tests import relations, line highlighting in the code viewer and the highlightLines action.
import { EditorState, Text } from "@codemirror/state";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clampRange,
  highlightField,
  highlightedLines,
  languageNameFor,
  lineDecorations,
  setHighlight,
} from "../src/city/codeHighlight";
import { buildRelations } from "../src/city/relations";
import { useCityStore } from "../src/city/store";
import type { CityModel } from "../src/types/cityModel";
import minimal from "../../schema/examples/minimal.city.json";

const city = minimal as unknown as CityModel;

beforeEach(() => {
  useCityStore.getState().setCity(null);
});

describe("import relations", () => {
  it("lists what a file imports and who imports it", () => {
    const relations = buildRelations(city.edges);
    expect(relations.imports.get("src/main.py")?.map((e) => e.target)).toEqual(["src/db.py"]);
    expect(relations.importedBy.get("src/db.py")?.map((e) => e.source)).toEqual(["src/main.py"]);
    expect(relations.imports.get("src/db.py")).toBeUndefined();
  });

  it("is available from the store after a city is loaded", () => {
    useCityStore.getState().setCity(city);
    expect(useCityStore.getState().relations.importedBy.get("src/db.py")).toHaveLength(1);
  });
});

describe("clampRange", () => {
  it("keeps valid ranges and clamps to the file", () => {
    expect(clampRange(2, 4, 10)).toEqual({ startLine: 2, endLine: 4 });
    expect(clampRange(0, 99, 10)).toEqual({ startLine: 1, endLine: 10 });
    expect(clampRange(5, 3, 10)).toEqual({ startLine: 3, endLine: 5 });
  });

  it("rejects ranges outside the file", () => {
    expect(clampRange(11, 12, 10)).toBeNull();
    expect(clampRange(-5, 0, 10)).toBeNull();
    expect(clampRange(1, 2, 0)).toBeNull();
    expect(clampRange(Number.NaN, 2, 10)).toBeNull();
  });
});

describe("line highlighting", () => {
  const doc = "one\ntwo\nthree\nfour\nfive";

  it("marks exactly the requested lines", () => {
    let state = EditorState.create({ doc, extensions: [highlightField] });
    expect(highlightedLines(state)).toEqual([]);
    state = state.update({ effects: setHighlight.of({ startLine: 2, endLine: 4 }) }).state;
    expect(highlightedLines(state)).toEqual([2, 3, 4]);
  });

  it("can be cleared and replaced", () => {
    let state = EditorState.create({ doc, extensions: [highlightField] });
    state = state.update({ effects: setHighlight.of({ startLine: 1, endLine: 1 }) }).state;
    state = state.update({ effects: setHighlight.of({ startLine: 5, endLine: 5 }) }).state;
    expect(highlightedLines(state)).toEqual([5]);
    state = state.update({ effects: setHighlight.of(null) }).state;
    expect(highlightedLines(state)).toEqual([]);
  });

  it("clamps to the document and survives edits above the range", () => {
    let state = EditorState.create({ doc, extensions: [highlightField] });
    state = state.update({ effects: setHighlight.of({ startLine: 4, endLine: 99 }) }).state;
    expect(highlightedLines(state)).toEqual([4, 5]);
    state = state.update({ changes: { from: 0, insert: "zero\n" } }).state;
    expect(highlightedLines(state)).toEqual([5, 6]);
  });

  it("gives no decorations for ranges outside the document", () => {
    expect(lineDecorations(Text.of(["a", "b"]), { startLine: 9, endLine: 10 }).size).toBe(0);
  });
});

describe("languages", () => {
  it.each([
    ["a.py", "python"], ["a.ts", "typescript"], ["a.tsx", "tsx"], ["a.js", "javascript"], ["a.jsx", "jsx"],
    ["a.json", "json"], ["README.md", "markdown"], ["a.css", "css"], ["a.html", "html"],
    ["Makefile", "text"], [".gitignore", "text"], ["dir.v2/file", "text"],
  ])("%s is %s", (path, expected) => {
    expect(languageNameFor(path)).toBe(expected);
  }); // prettier-ignore
});

describe("highlightLines action", () => {
  it("selects the file, opens its folders and stores the range", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().highlightLines("src/main.py", 5, 20);
    const state = useCityStore.getState();
    expect(state.selectedId).toBe("src/main.py");
    expect(state.expandedIds.has("src")).toBe(true);
    expect(state.highlight).toMatchObject({ fileId: "src/main.py", startLine: 5, endLine: 20 });
  });

  it("orders swapped ranges and keeps lines at 1 or more", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().highlightLines("src/main.py", 9, 3);
    expect(useCityStore.getState().highlight).toMatchObject({ startLine: 3, endLine: 9 });
    useCityStore.getState().highlightLines("src/main.py", -4, 2);
    expect(useCityStore.getState().highlight).toMatchObject({ startLine: 1, endLine: 2 });
  });

  it("ignores folders and unknown files", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().highlightLines("src", 1, 2);
    useCityStore.getState().highlightLines("nope.py", 1, 2);
    expect(useCityStore.getState().highlight).toBeNull();
    expect(useCityStore.getState().selectedId).toBeNull();
  });

  it("clears the marking when another file is selected", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().highlightLines("src/main.py", 1, 2);
    useCityStore.getState().select("src/db.py");
    expect(useCityStore.getState().highlight).toBeNull();
  });

  it("keeps the marking when the same file is selected again", () => {
    useCityStore.getState().setCity(city);
    useCityStore.getState().highlightLines("src/main.py", 1, 2);
    useCityStore.getState().select("src/main.py");
    expect(useCityStore.getState().highlight).not.toBeNull();
  });

  it("keeps the file contents given with the city", () => {
    useCityStore.getState().setCity(city, new Map([["src/main.py", "print(1)\n"]]));
    expect(useCityStore.getState().contents.get("src/main.py")).toBe("print(1)\n");
  });
});
