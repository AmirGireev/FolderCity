// Checks that the frontend rules match scan-rules.json.
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

describe("rules match schema/scan-rules.json", () => {
  it("folders, files, extensions", () => {
    expect([...SKIP_DIRECTORIES].sort()).toEqual([...RULES.skipDirectories].sort());
    expect(SKIP_FILE_EXACT).toEqual(RULES.skipFiles.exact);
    expect(SKIP_FILE_PREFIXES).toEqual(RULES.skipFiles.prefixes);
    expect(SKIP_FILE_SUFFIXES).toEqual(RULES.skipFiles.suffixes);
    expect([...BINARY_EXTENSIONS].sort()).toEqual([...RULES.binaryExtensions].sort());
  });

  it("limits and whitespace", () => {
    expect(DEFAULT_LIMITS).toEqual(RULES.limits);
    expect(WHITESPACE).toBe(RULES.whitespace);
  });
});

describe("Filter", () => {
  it.each([".env", ".env.local", ".env.production", "prod.env", "a.env"])("%s is skipped", (n) =>
    expect(shouldSkipFile(n)).toBe(true));
  it.each(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock", "poetry.lock", "bun.lockb"])(
    "%s is skipped as a lock file",
    (n) => expect(shouldSkipFile(n)).toBe(true),
  );
  it.each(["package.json", "lock.py", "lockfile.md", "block.txt"])("%s is kept although it looks like a lock file", (n) =>
    expect(shouldSkipFile(n)).toBe(false));
  it.each(["environment.py", "env.py", "README.md", "my.environment"])("%s is kept", (n) =>
    expect(shouldSkipFile(n)).toBe(false));
  it.each(["node_modules", ".git", "venv", ".venv", "dist", "build", ".next", "__pycache__"])("folder %s is skipped", (n) =>
    expect(shouldSkipDirectory(n)).toBe(true));
  it("extensions are case-insensitive", () => {
    expect(hasBinaryExtension("PHOTO.JPG")).toBe(true);
    expect(hasBinaryExtension(".png")).toBe(false);
    expect(hasBinaryExtension("readme")).toBe(false);
  });
  it("empty detection", () => {
    expect(isBlankText("")).toBe(true);
    expect(isBlankText(" \t\r\n\f\v")).toBe(true);
    expect(isBlankText(" a ")).toBe(false);
    expect(isBlankText(" ")).toBe(false);
  });
});

describe("types match schema/scan.schema.json", () => {
  it("required fields and allowed values", () => {
    expect([...SCAN_SCHEMA.required]).toEqual(["schemaVersion", "rootName", "directories", "emptyDirectories", "files", "truncated"]);
    expect([...SCAN_SCHEMA.$defs.ScanFile.required]).toEqual(["path", "size", "content", "omitted", "isEmpty"]);
    expect(SCAN_SCHEMA.$defs.ScanFile.properties.omitted.enum).toEqual(["binary", "too_large", null]);
  });
});
