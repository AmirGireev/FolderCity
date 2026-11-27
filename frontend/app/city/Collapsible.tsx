// A sidebar section with a title that can be folded in and out and an optional control next to the title.
"use client";

import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  grow?: boolean;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
}

export function Collapsible({ title, children, grow = false, defaultOpen = true, headerExtra }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`collapsible${open ? " open" : ""}${grow ? " grow" : ""}`} data-testid={`section-${title.toLowerCase()}`}>
      <div className="collapsible-head">
        <button type="button" className="collapsible-header" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden>{open ? "▾" : "▸"}</span> {title}
        </button>
        {headerExtra}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
