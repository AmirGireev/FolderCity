// Turns a unified diff text into lines that the screen can color.
export type DiffKind = "header" | "hunk" | "add" | "remove" | "context";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export function parseDiff(diff: string): DiffLine[] {
  if (diff === "") return [];
  return diff.split("\n").map((text) => {
    if (text.startsWith("+++") || text.startsWith("---")) return { kind: "header", text };
    if (text.startsWith("@@")) return { kind: "hunk", text };
    if (text.startsWith("+")) return { kind: "add", text };
    if (text.startsWith("-")) return { kind: "remove", text };
    return { kind: "context", text };
  });
}
