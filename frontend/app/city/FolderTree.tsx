// The clickable folder tree with folder and file icons, kept in sync with the selection in the city.
"use client";

import { useEffect, useMemo, useRef } from "react";
import { colorForExtension } from "../../src/city/colors";
import { revealInContainer } from "../../src/city/scroll";
import { childrenByParent, visibleRows } from "../../src/city/tree";
import { useCityStore } from "../../src/city/store";
import type { CityNode } from "../../src/types/cityModel";

function Icon({ node }: { node: CityNode }) {
  if (node.type === "folder" || node.type === "empty_folder") {
    const empty = node.type === "empty_folder";
    return (
      <svg className={`tree-icon folder${empty ? " empty" : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.2l1.3 1.5h6.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
          fill={empty ? "none" : "currentColor"}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray={empty ? "2 1.5" : undefined}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const color = colorForExtension(node.metrics.extension);
  return (
    <svg className={`tree-icon file${node.type === "empty_file" ? " empty" : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M4 1.5h5l3.5 3.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1z" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 1.5V5h3.5" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.5 8.5h5M5.5 11h5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function FolderTree() {
  const city = useCityStore((state) => state.city);
  const nodesById = useCityStore((state) => state.nodesById);
  const expandedIds = useCityStore((state) => state.expandedIds);
  const selectedId = useCityStore((state) => state.selectedId);
  const hoverId = useCityStore((state) => state.hoverId);
  const selectedRow = useRef<HTMLLIElement>(null);

  const children = useMemo(() => childrenByParent(city?.nodes ?? []), [city]);
  const rows = useMemo(
    () => (city ? visibleRows(city.rootId, nodesById, children, expandedIds) : []),
    [city, nodesById, children, expandedIds],
  );

  useEffect(() => {
    revealInContainer(selectedRow.current);
  }, [selectedId, rows.length]);

  if (!city) return null;

  return (
    <div className="folder-tree" aria-label="Folder tree">
      <ul role="tree">
        {rows.map(({ node, level, isFolder, hasChildren, expanded }) => {
          const classes = ["tree-row", isFolder ? "is-folder" : "is-file"];
          if (node.id === selectedId) classes.push("selected");
          else if (node.id === hoverId) classes.push("hovered");
          if (node.type === "empty_file" || node.type === "empty_folder") classes.push("empty");
          return (
            <li
              key={node.id}
              role="treeitem"
              aria-selected={node.id === selectedId}
              aria-expanded={isFolder && hasChildren ? expanded : undefined}
              ref={node.id === selectedId ? selectedRow : undefined}
              className={classes.join(" ")}
              style={{ paddingLeft: `${level * 0.9}rem` }}
              onMouseEnter={() => useCityStore.getState().hover(node.id)}
              onMouseLeave={() => useCityStore.getState().hover(null)}
            >
              <button
                type="button"
                className="tree-toggle"
                aria-label={expanded ? "Collapse" : "Expand"}
                disabled={!hasChildren}
                onClick={() => useCityStore.getState().toggleExpanded(node.id)}
              >
                {hasChildren ? (expanded ? "▾" : "▸") : ""}
              </button>
              <Icon node={node} />
              <button type="button" className="tree-name" onClick={() => useCityStore.getState().selectAndFly(node.id)}>
                {node.path === "" ? `${node.name} (root)` : node.name}
              </button>
              {isFolder && node.type === "folder" && <span className="tree-count">{node.metrics.fileCount ?? 0}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
