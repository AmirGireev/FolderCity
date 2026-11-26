import { describe, expect, it } from "vitest";
import {
  BINARY_EXTENSIONS,
  DEFAULT_LIMITS,
  SKIP_DIRECTORIES,
  SKIP_FILE_EXACT,
  SKIP_FILE_PREFIXES,
  SKIP_FILE_SUFFIXES,
  WHITESPACE,
  hasBinaryExtension,
  isBlankText,
  shouldSkipDirectory,
  shouldSkipFile,
} from "../src/scan/rules";
import { RULES, SCAN_SCHEMA } from "./fakes";

describe("Regeln entsprechen schema/scan-rules.json", () => {
  it("Ordner, Dateien, Endungen", () => {
    expect([...SKIP_DIRECTORIES].sort()).toEqual([...RULES.skipDirectories].sort());
    expect(SKIP_FILE_EXACT).toEqual(RULES.skipFiles.exact);
    expect(SKIP_FILE_PREFIXES).toEqual(RULES.skipFiles.prefixes);
    expect(SKIP_FILE_SUFFIXES).toEqual(RULES.skipFiles.suffixes);
    expect([...BINARY_EXTENSIONS].sort()).toEqual([...RULES.binaryExtensions].sort());
  });

  it("Limits und Leerzeichen", () => {
    expect(DEFAULT_LIMITS).toEqual(RULES.limits);
    expect(WHITESPACE).toBe(RULES.whitespace);
  });
});

describe("Filter", () => {
  it.each([".env", ".env.local", ".env.production", "prod.env", "a.env"])("%s wird übersprungen", (n) =>
    expect(shouldSkipFile(n)).toBe(true));
  it.each(["environment.py", "env.py", "README.md", "my.environment"])("%s bleibt", (n) =>
    expect(shouldSkipFile(n)).toBe(false));
  it.each(["node_modules", ".git", "venv", ".venv", "dist", "build", ".next", "__pycache__"])("Ordner %s wird übersprungen", (n) =>
    expect(shouldSkipDirectory(n)).toBe(true));
  it("Endungen ohne Beachtung der Groß-/Kleinschreibung", () => {
    expect(hasBinaryExtension("PHOTO.JPG")).toBe(true);
    expect(hasBinaryExtension(".png")).toBe(false);
    expect(hasBinaryExtension("readme")).toBe(false);
  });
  it("Leer-Erkennung", () => {
    expect(isBlankText("")).toBe(true);
    expect(isBlankText(" \t\r\n\f\v")).toBe(true);
    expect(isBlankText(" a ")).toBe(false);
    expect(isBlankText(" ")).toBe(false); // wie im Backend
  });
});

describe("Typen entsprechen schema/scan.schema.json", () => {
  it("Pflichtfelder und erlaubte Werte", () => {
    expect([...SCAN_SCHEMA.required]).toEqual(["schemaVersion", "rootName", "directories", "emptyDirectories", "files", "truncated"]);
    expect([...SCAN_SCHEMA.$defs.ScanFile.required]).toEqual(["path", "size", "content", "omitted", "isEmpty"]);
    expect(SCAN_SCHEMA.$defs.ScanFile.properties.omitted.enum).toEqual(["binary", "too_large", null]);
  });
});
