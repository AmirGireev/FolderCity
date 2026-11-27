// Panel with name, path, size and line count of the selected node.
"use client";

import { formatBytes } from "../../src/city/format";
import { useCityStore } from "../../src/city/store";

export function Inspector() {
  const node = useCityStore((state) => (state.selectedId ? state.nodesById.get(state.selectedId) : undefined));
  const flyTo = useCityStore((state) => state.flyTo);

  if (!node) {
    return (
      <section className="inspector" data-testid="inspector">
        <p>Click a building or platform to see details. Double-click to fly there.</p>
      </section>
    );
  }

  const isFolder = node.type === "folder" || node.type === "empty_folder";
  return (
    <section className="inspector" data-testid="inspector">
      <h3>{node.name}</h3>
      <dl>
        <dt>Path</dt>
        <dd>{node.path === "" ? "/ (root)" : node.path}</dd>
        <dt>Type</dt>
        <dd>{node.type.replace("_", " ")}</dd>
        <dt>Depth</dt>
        <dd>{node.metrics.depth === undefined ? "–" : `${node.metrics.depth} ${node.metrics.depth === 1 ? "level" : "levels"} below the root`}</dd>
        <dt>Size</dt>
        <dd>{formatBytes(node.metrics.sizeBytes)}</dd>
        {isFolder ? (
          <>
            <dt>Files</dt>
            <dd>{node.metrics.fileCount ?? 0}</dd>
          </>
        ) : (
          <>
            <dt>Lines</dt>
            <dd>{node.metrics.lines ?? "–"}</dd>
          </>
        )}
      </dl>
      <button type="button" onClick={() => flyTo(node.id)}>
        Fly to
      </button>
    </section>
  );
}
