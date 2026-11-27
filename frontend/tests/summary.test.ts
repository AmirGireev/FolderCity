// Tests the counts for the display.
import { expect, it } from "vitest";
import { summarize } from "../src/scan/summary";
import type { ScanResult } from "../src/types/scan";
import { EXPECTED } from "./fakes";

it("counts folders, files, empty ones and ones without content", () => {
  expect(summarize(EXPECTED as ScanResult)).toEqual({
    folders: 10,
    emptyFolders: 7,
    files: 9,
    emptyFiles: 3,
    withoutContent: 2,
    truncated: false,
  });
});
