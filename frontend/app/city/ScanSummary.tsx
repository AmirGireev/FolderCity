// Shows how much was scanned, below the 3D view, until the first piece of code is opened.
"use client";

import type { CSSProperties } from "react";
import { summarize } from "../../src/scan/summary";
import { useCityStore } from "../../src/city/store";

export function ScanSummary({ style }: { style?: CSSProperties }) {
  const scan = useCityStore((state) => state.scan);
  const codeOpened = useCityStore((state) => state.codeOpened);

  if (!scan || codeOpened) return null;
  const summary = summarize(scan);

  return (
    <section className="scan-summary" data-testid="scan-summary" style={style}>
      <h3>
        “{scan.rootName}” scanned: <strong>{summary.files}</strong> {summary.files === 1 ? "file" : "files"} in{" "}
        <strong>{summary.folders}</strong> {summary.folders === 1 ? "folder" : "folders"}
      </h3>
      <ul>
        <li>
          {summary.emptyFolders} empty {summary.emptyFolders === 1 ? "folder" : "folders"}
        </li>
        <li>
          {summary.emptyFiles} empty {summary.emptyFiles === 1 ? "file" : "files"}
        </li>
        <li>{summary.withoutContent} without content (images, binary files, too large)</li>
      </ul>
      {summary.truncated && (
        <p className="warning">Not everything was scanned: the limit is 600 files (and 50 folder levels).</p>
      )}
      <p className="hint">Click a building or a file in the tree to see its code here.</p>
    </section>
  );
}
