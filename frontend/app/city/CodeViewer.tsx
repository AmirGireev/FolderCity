// Shows the code of the selected file with syntax colors, a function list and line highlighting.
"use client";

import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { clampRange, highlightField, languageExtension, languageNameFor, setHighlight } from "../../src/city/codeHighlight";
import { useCityStore } from "../../src/city/store";

function CodeEditor({ path, content }: { path: string; content: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const highlight = useCityStore((state) => (state.highlight?.fileId === path ? state.highlight : null));

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          oneDark,
          languageExtension(path),
          highlightField,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [path, content]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const range = highlight ? clampRange(highlight.startLine, highlight.endLine, editor.state.doc.lines) : null;
    editor.dispatch({
      effects: [setHighlight.of(range), ...(range ? [EditorView.scrollIntoView(editor.state.doc.line(range.startLine).from, { y: "center" })] : [])],
    });
  }, [highlight, path, content]);

  return <div className="code-editor" ref={host} data-testid="code-editor" />;
}

export function CodeViewer({ height, style }: { height?: number; style?: CSSProperties }) {
  const node = useCityStore((state) => (state.selectedId ? state.nodesById.get(state.selectedId) : undefined));
  const symbols = useCityStore((state) => state.city?.symbols);
  const contents = useCityStore((state) => state.contents);
  const highlightLines = useCityStore((state) => state.highlightLines);
  const select = useCityStore((state) => state.select);

  const fileSymbols = useMemo(
    () => (node && symbols ? symbols.filter((symbol) => symbol.fileId === node.id) : []),
    [node, symbols],
  );

  if (!node || (node.type !== "file" && node.type !== "empty_file")) return null;
  const content = contents.get(node.id);

  return (
    <section className="code-viewer" data-testid="code-viewer" style={{ ...style, height }}>
      <header>
        <strong>{node.path}</strong>
        <small>{languageNameFor(node.path)}</small>
        {fileSymbols.length > 0 && (
          <select
            aria-label="Jump to function or class"
            value=""
            onChange={(event) => {
              const symbol = fileSymbols.find((item) => item.id === event.target.value);
              if (symbol) highlightLines(node.id, symbol.startLine, symbol.endLine);
            }}
          >
            <option value="">Jump to… ({fileSymbols.length})</option>
            {fileSymbols.map((symbol) => (
              <option key={symbol.id} value={symbol.id}>
                {symbol.kind} {symbol.name} (lines {symbol.startLine}–{symbol.endLine})
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => select(null)}>
          Close
        </button>
      </header>
      {typeof content === "string" ? (
        <CodeEditor path={node.path} content={content} />
      ) : (
        <p className="code-empty">No preview available (binary file, too large, or content not loaded).</p>
      )}
    </section>
  );
}
