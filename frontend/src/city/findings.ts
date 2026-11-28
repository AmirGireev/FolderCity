// Helpers for lint and rule findings: worst severity per file or folder, pulse strength and which files can be fixed.
import type { CityNode, Finding, Severity } from "../types/cityModel";

export const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

export const SEVERITY_COLOR: Record<Severity, string> = { low: "#fbbf24", medium: "#fb923c", high: "#f87171" };

export const PULSE: Record<Severity, { base: number; amplitude: number; speed: number }> = {
  low: { base: 0.1, amplitude: 0.1, speed: 1.5 },
  medium: { base: 0.2, amplitude: 0.25, speed: 2.4 },
  high: { base: 0.3, amplitude: 0.5, speed: 3.6 },
};

export const FIXABLE_EXTENSIONS = [".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];

export function worseOf(a: Severity | null, b: Severity | null): Severity | null {
  if (a === null) return b;
  if (b === null) return a;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function severityByFile(findings: Finding[]): Map<string, Severity> {
  const result = new Map<string, Severity>();
  for (const finding of findings) result.set(finding.fileId, worseOf(result.get(finding.fileId) ?? null, finding.severity)!);
  return result;
}

export function findingsByFile(findings: Finding[]): Map<string, Finding[]> {
  const result = new Map<string, Finding[]>();
  for (const finding of findings) result.set(finding.fileId, [...(result.get(finding.fileId) ?? []), finding]);
  for (const list of result.values()) {
    list.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.line - b.line || a.rule.localeCompare(b.rule));
  }
  return result;
}

export function severityUnder(
  folderId: string,
  children: Map<string, CityNode[]>,
  bySeverity: Map<string, Severity>,
): Severity | null {
  let worst: Severity | null = null;
  const stack = [...(children.get(folderId) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    worst = worseOf(worst, bySeverity.get(node.id) ?? null);
    stack.push(...(children.get(node.id) ?? []));
  }
  return worst;
}

export function pulseOpacity(severity: Severity, seconds: number): number {
  const { base, amplitude, speed } = PULSE[severity];
  return base + amplitude * (0.5 + 0.5 * Math.sin(seconds * speed));
}

export function canSuggestFix(fileId: string): boolean {
  const name = fileId.toLowerCase();
  return FIXABLE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
