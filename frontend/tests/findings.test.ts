// Tests complexity colors, finding helpers, diff lines and the fix store.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/chat/api";
import { COMPLEXITY_HIGH, COMPLEXITY_LOW, COMPLEXITY_NONE_COLOR, CYCLE_COLOR, complexityColor } from "../src/city/colors";
import {
  PULSE,
  SEVERITY_COLOR,
  canSuggestFix,
  countBySeverity,
  findingsByFile,
  pulseOpacity,
  severityByFile,
  severityUnder,
  worseOf,
} from "../src/city/findings";
import { LAYER_DEFINITIONS } from "../src/city/layers";
import { useCityStore } from "../src/city/store";
import { childrenByParent } from "../src/city/tree";
import { parseDiff } from "../src/fix/diff";
import { useFixStore } from "../src/fix/fixStore";
import type { CityModel, CityNode, Finding, NodeType, Severity } from "../src/types/cityModel";

vi.mock("../src/fix/api", () => ({ requestFix: vi.fn() }));
import { requestFix } from "../src/fix/api";

function node(id: string, type: NodeType, parentId: string | null, metrics: CityNode["metrics"] = {}): CityNode {
  return {
    id, path: id === "root" ? "" : id, name: id.split("/").pop() ?? id, type, parentId,
    dimensions: { position: { x: 0, y: 0, z: 0 }, width: 1, depth: 1, height: 1 }, metrics,
  }; // prettier-ignore
}

const finding = (fileId: string, line: number, severity: Severity, rule = "S105"): Finding => ({
  id: `ruff:${rule}@${fileId}:${line}`, fileId, line, rule, message: "m", severity, source: "ruff",
}); // prettier-ignore

const findings = [finding("a/x.py", 9, "low", "F401"), finding("a/x.py", 3, "high"), finding("a/y.py", 2, "medium", "B006"), finding("b/z.ts", 1, "low", "FC002")];

const nodes: CityNode[] = [
  node("root", "folder", null),
  node("a", "folder", "root"),
  node("a/x.py", "file", "a", { complexity: 14 }),
  node("a/y.py", "file", "a", { complexity: 2 }),
  node("b", "folder", "root"),
  node("b/z.ts", "file", "b"),
  node("c", "folder", "root"),
];
const city: CityModel = { schemaVersion: "1.0", rootId: "root", nodes, edges: [], architecture: [], symbols: [], findings };

describe("complexity colors", () => {
  const colorOf = (metrics: CityNode["metrics"]) => complexityColor(node("f", "file", null, metrics));

  it("goes from green over yellow to red", () => {
    const hue = (metrics: CityNode["metrics"]) => Number(/hsl\((\d+),/.exec(colorOf(metrics))?.[1]);
    expect(hue({ complexity: 1 })).toBe(130);
    expect(hue({ complexity: COMPLEXITY_LOW })).toBe(130);
    expect(hue({ complexity: 14 })).toBeLessThan(hue({ complexity: 5 }));
    expect(hue({ complexity: COMPLEXITY_HIGH })).toBe(0);
    expect(hue({ complexity: 500 })).toBe(0);
  });

  it("uses grey for files without functions and purple for circular imports", () => {
    expect(colorOf({})).toBe(COMPLEXITY_NONE_COLOR);
    expect(colorOf({ complexity: 40, cycle: 1, cycleSize: 2 })).toBe(CYCLE_COLOR);
  });
});

describe("finding helpers", () => {
  it("picks the worse of two severities", () => {
    expect(worseOf("low", "high")).toBe("high");
    expect(worseOf("medium", "low")).toBe("medium");
    expect(worseOf(null, "low")).toBe("low");
    expect(worseOf("high", null)).toBe("high");
    expect(worseOf(null, null)).toBeNull();
  });

  it("finds the worst severity per file", () => {
    expect(Object.fromEntries(severityByFile(findings))).toEqual({ "a/x.py": "high", "a/y.py": "medium", "b/z.ts": "low" });
  });

  it("lists findings of a file with the worst first", () => {
    expect(findingsByFile(findings).get("a/x.py")!.map((f) => f.line)).toEqual([3, 9]);
    expect(findingsByFile(findings).get("nope")).toBeUndefined();
  });

  it("finds the worst severity below a folder", () => {
    const children = childrenByParent(nodes);
    const bySeverity = severityByFile(findings);
    expect(severityUnder("a", children, bySeverity)).toBe("high");
    expect(severityUnder("root", children, bySeverity)).toBe("high");
    expect(severityUnder("b", children, bySeverity)).toBe("low");
    expect(severityUnder("c", children, bySeverity)).toBeNull();
  });

  it("makes the pulse stronger for worse findings and keeps it in range", () => {
    for (const severity of ["low", "medium", "high"] as const) {
      for (let t = 0; t < 10; t += 0.1) {
        const value = pulseOpacity(severity, t);
        expect(value).toBeGreaterThanOrEqual(PULSE[severity].base - 1e-9);
        expect(value).toBeLessThanOrEqual(PULSE[severity].base + PULSE[severity].amplitude + 1e-9);
      }
    }
    const peak = (severity: Severity) => Math.max(...Array.from({ length: 200 }, (_, i) => pulseOpacity(severity, i / 20)));
    expect(peak("high")).toBeGreaterThan(peak("medium"));
    expect(peak("medium")).toBeGreaterThan(peak("low"));
    expect(new Set(Object.values(SEVERITY_COLOR)).size).toBe(3);
  });

  it("counts findings per severity", () => {
    expect(countBySeverity(findings)).toEqual({ low: 2, medium: 1, high: 1 });
    expect(countBySeverity([])).toEqual({ low: 0, medium: 0, high: 0 });
  });

  it("knows which files can get a fix", () => {
    expect(["a.py", "a.ts", "A.TSX", "x/y.js", "m.mjs"].every(canSuggestFix)).toBe(true);
    expect(["A.cs", "a.java", "README.md", "a.c"].some(canSuggestFix)).toBe(false);
  });

  it("turns the complexity and findings layers on when there is data", () => {
    const definition = (key: string) => LAYER_DEFINITIONS.find((l) => l.key === key)!;
    expect(definition("complexity").hasData!(city)).toBe(true);
    expect(definition("errors").hasData!(city)).toBe(true);
    expect(definition("errors").hasData!({ ...city, findings: [] })).toBe(false);
    expect(definition("complexity").hasData!({ ...city, nodes: [node("root", "folder", null)] })).toBe(false);
    expect(definition("errors").isAvailable(null)).toBe(true);
  });
});

describe("diff lines", () => {
  it("tells headers, hunks, additions, removals and context apart", () => {
    const diff = "--- a/x.py\n+++ b/x.py\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c";
    expect(parseDiff(diff).map((l) => l.kind)).toEqual(["header", "header", "hunk", "context", "remove", "add", "context"]);
    expect(parseDiff("")).toEqual([]);
  });
});

describe("fix store", () => {
  const request = vi.mocked(requestFix);
  const target = finding("a/x.py", 3, "high");
  const ok = { ok: true, reason: "", startLine: 3, endLine: 3, explanation: "e", diff: "-a\n+b", before: "a", after: "b" };

  beforeEach(() => {
    vi.resetAllMocks();
    useCityStore.getState().setCity({ ...city }, new Map([["a/x.py", "password = 'x'\n"]]));
    useFixStore.getState().reset();
  });

  it("asks with the code of the file and keeps the verified result", async () => {
    request.mockResolvedValue(ok);
    const pending = useFixStore.getState().request(target);
    expect(useFixStore.getState().entries[target.id]).toEqual({ status: "loading" });
    await pending;
    expect(request).toHaveBeenCalledWith("a/x.py", "password = 'x'\n", "S105", 3);
    expect(useFixStore.getState().entries[target.id]).toEqual({ status: "done", result: ok });
  });

  it("keeps a refused patch with its reason", async () => {
    request.mockResolvedValue({ ...ok, ok: false, reason: "The finding is still there after the patch.", diff: "" });
    await useFixStore.getState().request(target);
    const entry = useFixStore.getState().entries[target.id];
    expect(entry.status === "done" && entry.result.ok === false && entry.result.reason).toContain("still there");
  });

  it("shows server errors such as a missing AI model", async () => {
    request.mockRejectedValue(new ApiError(503, "No AI model is set up on the server."));
    await useFixStore.getState().request(target);
    expect(useFixStore.getState().entries[target.id]).toEqual({ status: "error", message: "No AI model is set up on the server." });
  });

  it("explains when the code is not available", async () => {
    useCityStore.getState().setCity({ ...city });
    await useFixStore.getState().request(target);
    expect(useFixStore.getState().entries[target.id]).toMatchObject({ status: "error" });
    expect(request).not.toHaveBeenCalled();
  });

  it("does not ask twice while waiting and can be dismissed", async () => {
    let finish: (value: typeof ok) => void = () => undefined;
    request.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = useFixStore.getState().request(target);
    await useFixStore.getState().request(target);
    expect(request).toHaveBeenCalledTimes(1);
    finish(ok);
    await first;
    useFixStore.getState().dismiss(target.id);
    expect(useFixStore.getState().entries).toEqual({});
  });

  it("forgets everything for a new city", async () => {
    request.mockResolvedValue(ok);
    await useFixStore.getState().request(target);
    useCityStore.getState().setCity({ ...city });
    expect(useFixStore.getState().entries).toEqual({});
  });
});
