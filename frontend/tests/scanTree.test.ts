import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "../src/scan/rules";
import { decodeText, scanTree } from "../src/scan/scanTree";
import { EXPECTED, EXPECTED_TEXT, FIXTURE, memoryDir, type Tree } from "./fakes";

const scan = (tree: Tree, limits = DEFAULT_LIMITS) => scanTree(memoryDir("r", tree), limits);

describe("scanTree: Testbaum", () => {
  it("liefert genau das erwartete JSON (dasselbe, das das Backend liefert)", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    expect(result).toEqual(EXPECTED);
  });

  it("ist auch als Text Zeichen für Zeichen gleich wie die Backend-Datei", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    expect(JSON.stringify(result, null, 2) + "\n").toBe(EXPECTED_TEXT);
  });

  it("nimmt keine Geheimnisse oder Ignorier-Ordner mit", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    const parts = [...result.files.map((f) => f.path), ...result.directories].flatMap((p) => p.split("/"));
    for (const bad of [".env", ".env.local", "prod.env", "node_modules", ".git", "__pycache__"]) {
      expect(parts).not.toContain(bad);
    }
  });

  it("erkennt leeren Ordner und leere Datei", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    expect(result.emptyDirectories).toContain("emptyDir");
    expect(result.emptyDirectories).toContain("onlyEmptyChildren"); // nur leere Unterordner
    expect(result.emptyDirectories).not.toContain("withEmptyFile"); // enthält eine (leere) Datei
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["empty.txt"].isEmpty).toBe(true);
    expect(byPath["blank.txt"].isEmpty).toBe(true); // nur Leerzeichen
    expect(byPath["README.md"].isEmpty).toBe(false);
  });
});

describe("scanTree: Sonderfälle", () => {
  it("leere Wurzel", async () => {
    const result = await scan({});
    expect([result.directories, result.emptyDirectories, result.files, result.truncated]).toEqual([[], [], [], false]);
  });

  it("Binärdatei nach Endung wird nicht gelesen", async () => {
    let reads = 0;
    const root = {
      kind: "directory" as const,
      name: "r",
      list: async () => [
        { kind: "file" as const, name: "a.PNG", size: 40, read: async () => (reads++, new Uint8Array(40)) },
        { kind: "file" as const, name: "e.png", size: 0, read: async () => (reads++, new Uint8Array(0)) },
      ],
    };
    const result = await scanTree(root);
    expect(reads).toBe(0);
    expect(result.files).toEqual([
      { path: "a.PNG", size: 40, content: null, omitted: "binary", isEmpty: false },
      { path: "e.png", size: 0, content: null, omitted: "binary", isEmpty: true },
    ]);
  });

  it("ungültiges UTF-8 zählt als Binärdatei", async () => {
    const root = memoryDir("r", { "x.txt": { $bytes: [0xff, 0xfe, 0xfa] } });
    const result = await scanTree(root);
    expect(result.files[0]).toMatchObject({ omitted: "binary", content: null });
  });

  it("zu große Datei: kein Inhalt, nicht leer", async () => {
    const result = await scan({ "big.txt": "a".repeat(50), "small.txt": "b".repeat(5) }, { ...DEFAULT_LIMITS, maxFileBytes: 10 });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["big.txt"]).toEqual({ path: "big.txt", size: 50, content: null, omitted: "too_large", isEmpty: false });
    expect(byPath["small.txt"].content).toBe("bbbbb");
  });

  it("Standard-Limit ist 1 MB pro Datei", async () => {
    const result = await scan({ "ok.txt": "a".repeat(1_048_576), "big.txt": "a".repeat(1_048_577) });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["ok.txt"].omitted).toBeNull();
    expect(byPath["big.txt"].omitted).toBe("too_large");
  });

  it("Datei-Limit schneidet immer an derselben Stelle ab", async () => {
    const result = await scan({ "a.txt": "a", "b.txt": "b", "c.txt": "c", "d.txt": "d" }, { ...DEFAULT_LIMITS, maxFiles: 2 });
    expect(result.files.map((f) => f.path)).toEqual(["a.txt", "b.txt"]);
    expect(result.truncated).toBe(true);
  });

  it("genau am Limit ist nicht abgeschnitten", async () => {
    const result = await scan({ "a.txt": "a", "b.txt": "b" }, { ...DEFAULT_LIMITS, maxFiles: 2 });
    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it("bei Abschneiden wird nie 'leerer Ordner' behauptet", async () => {
    const result = await scan({ a: { "one.txt": "1", "two.txt": "2" } }, { ...DEFAULT_LIMITS, maxFiles: 1 });
    expect(result.truncated).toBe(true);
    expect(result.emptyDirectories).not.toContain("a");
  });

  it("Tiefen-Limit", async () => {
    const result = await scan({ a: { b: { c: { "f.txt": "x" } } } }, { ...DEFAULT_LIMITS, maxDepth: 2 });
    expect(result.directories).toEqual(["a", "a/b"]);
    expect(result.truncated).toBe(true);
    expect(result.emptyDirectories).not.toContain("a/b");
  });

  it("Zeilenenden und BOM bleiben erhalten", async () => {
    const result = await scan({ "w.txt": "a\r\nb\r\n", "bom.txt": "﻿x" });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["w.txt"].content).toBe("a\r\nb\r\n");
    expect(byPath["bom.txt"].content).toBe("﻿x");
  });

  it("Schlüsselreihenfolge wie im Backend", async () => {
    const result = await scan({ "a.txt": "a" });
    expect(Object.keys(result)).toEqual(["schemaVersion", "rootName", "directories", "emptyDirectories", "files", "truncated"]);
    expect(Object.keys(result.files[0])).toEqual(["path", "size", "content", "omitted", "isEmpty"]);
  });
});

describe("decodeText", () => {
  it("NUL-Byte → Binärdatei", () => expect(decodeText(Uint8Array.from([97, 0, 98]))).toBeNull());
  it("ungültiges UTF-8 → Binärdatei", () => expect(decodeText(Uint8Array.from([0xff]))).toBeNull());
  it("BOM bleibt", () => expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 104]))).toBe("﻿h"));
  it("leer → leerer Text", () => expect(decodeText(new Uint8Array(0))).toBe(""));
});
