// The right sidebar: details, assistant, layer switches and folder tree, each foldable, and the whole bar can be hidden.
"use client";

import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { Collapsible } from "./Collapsible";
import { FolderTree } from "./FolderTree";
import { Inspector } from "./Inspector";
import { LayerPanel } from "./LayerPanel";

export function Sidebar() {
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <aside className="sidebar hidden" data-testid="sidebar">
        <button type="button" className="sidebar-toggle" aria-label="Show sidebar" onClick={() => setHidden(false)}>
          «
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar" data-testid="sidebar">
      <button type="button" className="sidebar-toggle" aria-label="Hide sidebar" onClick={() => setHidden(true)}>
        »
      </button>
      <Collapsible title="Details">
        <Inspector />
      </Collapsible>
      <Collapsible title="Assistant">
        <ChatPanel />
      </Collapsible>
      <Collapsible title="Layers">
        <LayerPanel />
      </Collapsible>
      <Collapsible title="Folders" grow>
        <FolderTree />
      </Collapsible>
    </aside>
  );
}
