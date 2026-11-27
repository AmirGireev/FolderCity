// The clickable folder tree, kept in sync with the selection in the city.
"use client";

import { useEffect, useMemo, useRef } from "react";
import { childrenByParent, visibleRows } from "../../src/city/tree";
import { useCityStore } from "../../src/city/store";

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
    selectedRow.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId, rows.length]);

  if (!city) return null;

  return (
    <section className="folder-tree" aria-label="Folder tree">
      <h3>Folders</h3>
      <ul role="tree">
        {rows.map(({ node, level, isFolder, hasChildren, expanded }) => {
          const classes = ["tree-row"];
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
              <button
                type="button"
                className="tree-name"
                onClick={() => useCityStore.getState().selectAndFly(node.id)}
              >
                {node.path === "" ? `${node.name} (root)` : node.name}
                {isFolder ? "/" : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
