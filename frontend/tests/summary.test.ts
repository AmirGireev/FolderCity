import { expect, it } from "vitest";
import { summarize } from "../src/scan/summary";
import type { ScanResult } from "../src/types/scan";
import { EXPECTED } from "./fakes";

it("zählt Ordner, Dateien, leere und ohne Inhalt", () => {
  expect(summarize(EXPECTED as ScanResult)).toEqual({
    folders: 10,
    emptyFolders: 7,
    files: 8,
    emptyFiles: 3,
    withoutContent: 2,
    truncated: false,
  });
});
