// The right sidebar: inspector, layer switches and folder tree.
"use client";

import { FolderTree } from "./FolderTree";
import { Inspector } from "./Inspector";
import { LayerPanel } from "./LayerPanel";

export function Sidebar() {
  return (
    <aside className="sidebar" data-testid="sidebar">
      <Inspector />
      <LayerPanel />
      <FolderTree />
    </aside>
  );
}
