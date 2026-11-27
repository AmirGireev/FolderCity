// CodeMirror extension that marks a range of lines, plus helpers for ranges and languages.
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface LineRange {
  startLine: number;
  endLine: number;
}

export const setHighlight = StateEffect.define<LineRange | null>();

export function clampRange(startLine: number, endLine: number, lineCount: number): LineRange | null {
  if (lineCount < 1 || !Number.isFinite(startLine) || !Number.isFinite(endLine)) return null;
  const low = Math.min(startLine, endLine);
  const high = Math.max(startLine, endLine);
  if (high < 1 || low > lineCount) return null;
  return { startLine: Math.max(1, Math.floor(low)), endLine: Math.min(lineCount, Math.floor(high)) };
}

export function lineDecorations(doc: Text, range: LineRange): DecorationSet {
  const clamped = clampRange(range.startLine, range.endLine, doc.lines);
  if (!clamped) return Decoration.none;
  const mark = Decoration.line({ class: "cm-highlighted-line" });
  const ranges = [];
  for (let line = clamped.startLine; line <= clamped.endLine; line++) ranges.push(mark.range(doc.line(line).from));
  return Decoration.set(ranges);
}

export const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setHighlight)) next = effect.value ? lineDecorations(transaction.state.doc, effect.value) : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function highlightedLines(state: { field: <T>(f: StateField<T>) => T; doc: Text }): number[] {
  const lines: number[] = [];
  state.field(highlightField).between(0, state.doc.length, (from) => {
    lines.push(state.doc.lineAt(from).number);
  });
  return lines;
}

export function languageNameFor(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  const names: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "jsx",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".json": "json", ".md": "markdown", ".css": "css", ".html": "html",
  }; // prettier-ignore
  return names[extension] ?? "text";
}

export function languageExtension(path: string): Extension {
  switch (languageNameFor(path)) {
    case "python": return python();
    case "javascript": return javascript();
    case "jsx": return javascript({ jsx: true });
    case "typescript": return javascript({ typescript: true });
    case "tsx": return javascript({ typescript: true, jsx: true });
    case "json": return json();
    case "markdown": return markdown();
    case "css": return css();
    case "html": return html();
    default: return [];
  }
}
