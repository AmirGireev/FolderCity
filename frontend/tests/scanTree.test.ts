// Tests scanning in the browser code.
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "../src/scan/rules";
import { decodeText, scanTree } from "../src/scan/scanTree";
import { EXPECTED, EXPECTED_TEXT, FIXTURE, memoryDir, type Tree } from "./fakes";

const scan = (tree: Tree, limits = DEFAULT_LIMITS) => scanTree(memoryDir("r", tree), limits);

describe("scanTree: test tree", () => {
  it("gives exactly the expected JSON (the same the backend gives)", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    expect(result).toEqual(EXPECTED);
  });

  it("is also identical character by character as text to the backend file", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    expect(JSON.stringify(result, null, 2) + "\n").toBe(EXPECTED_TEXT);
  });

  it("leaves out secrets and ignored folders", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    const parts = [...result.files.map((f) => f.path), ...result.directories].flatMap((p) => p.split("/"));
    for (const bad of [".env", ".env.local", "prod.env", "node_modules", ".git", "__pycache__"]) {
      expect(parts).not.toContain(bad);
    }
  });

  it("detects an empty folder and an empty file", async () => {
    const result = await scanTree(memoryDir(FIXTURE.name, FIXTURE.tree));
    expect(result.emptyDirectories).toContain("emptyDir");
    expect(result.emptyDirectories).toContain("onlyEmptyChildren");
    expect(result.emptyDirectories).not.toContain("withEmptyFile");
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["empty.txt"].isEmpty).toBe(true);
    expect(byPath["blank.txt"].isEmpty).toBe(true);
    expect(byPath["README.md"].isEmpty).toBe(false);
  });
});

describe("scanTree: special cases", () => {
  it("empty root", async () => {
    const result = await scan({});
    expect([result.directories, result.emptyDirectories, result.files, result.truncated]).toEqual([[], [], [], false]);
  });

  it("a binary file by extension is not read", async () => {
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

  it("invalid UTF-8 counts as binary", async () => {
    const root = memoryDir("r", { "x.txt": { $bytes: [0xff, 0xfe, 0xfa] } });
    const result = await scanTree(root);
    expect(result.files[0]).toMatchObject({ omitted: "binary", content: null });
  });

  it("too large file: no content, not empty", async () => {
    const result = await scan({ "big.txt": "a".repeat(50), "small.txt": "b".repeat(5) }, { ...DEFAULT_LIMITS, maxFileBytes: 10 });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["big.txt"]).toEqual({ path: "big.txt", size: 50, content: null, omitted: "too_large", isEmpty: false });
    expect(byPath["small.txt"].content).toBe("bbbbb");
  });

  it("default limit is 1 MB per file", async () => {
    const result = await scan({ "ok.txt": "a".repeat(1_048_576), "big.txt": "a".repeat(1_048_577) });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["ok.txt"].omitted).toBeNull();
    expect(byPath["big.txt"].omitted).toBe("too_large");
  });

  it("the file limit always cuts at the same place", async () => {
    const result = await scan({ "a.txt": "a", "b.txt": "b", "c.txt": "c", "d.txt": "d" }, { ...DEFAULT_LIMITS, maxFiles: 2 });
    expect(result.files.map((f) => f.path)).toEqual(["a.txt", "b.txt"]);
    expect(result.truncated).toBe(true);
  });

  it("exactly at the limit is not truncated", async () => {
    const result = await scan({ "a.txt": "a", "b.txt": "b" }, { ...DEFAULT_LIMITS, maxFiles: 2 });
    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it("when truncated, a folder is never claimed to be empty", async () => {
    const result = await scan({ a: { "one.txt": "1", "two.txt": "2" } }, { ...DEFAULT_LIMITS, maxFiles: 1 });
    expect(result.truncated).toBe(true);
    expect(result.emptyDirectories).not.toContain("a");
  });

  it("depth limit", async () => {
    const result = await scan({ a: { b: { c: { "f.txt": "x" } } } }, { ...DEFAULT_LIMITS, maxDepth: 2 });
    expect(result.directories).toEqual(["a", "a/b"]);
    expect(result.truncated).toBe(true);
    expect(result.emptyDirectories).not.toContain("a/b");
  });

  it("line endings and BOM are kept", async () => {
    const result = await scan({ "w.txt": "a\r\nb\r\n", "bom.txt": "﻿x" });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath["w.txt"].content).toBe("a\r\nb\r\n");
    expect(byPath["bom.txt"].content).toBe("﻿x");
  });

  it("key order is the same as in the backend", async () => {
    const result = await scan({ "a.txt": "a" });
    expect(Object.keys(result)).toEqual(["schemaVersion", "rootName", "directories", "emptyDirectories", "files", "truncated"]);
    expect(Object.keys(result.files[0])).toEqual(["path", "size", "content", "omitted", "isEmpty"]);
  });
});

describe("decodeText", () => {
  it("NUL byte → binary", () => expect(decodeText(Uint8Array.from([97, 0, 98]))).toBeNull());
  it("invalid UTF-8 → binary", () => expect(decodeText(Uint8Array.from([0xff]))).toBeNull());
  it("BOM is kept", () => expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 104]))).toBe("﻿h"));
  it("empty → empty text", () => expect(decodeText(new Uint8Array(0))).toBe(""));
});
