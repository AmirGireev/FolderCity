// A sidebar section with a title that can be folded in and out.
"use client";

import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  grow?: boolean;
  defaultOpen?: boolean;
}

export function Collapsible({ title, children, grow = false, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`collapsible${open ? " open" : ""}${grow ? " grow" : ""}`} data-testid={`section-${title.toLowerCase()}`}>
      <button type="button" className="collapsible-header" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden>{open ? "▾" : "▸"}</span> {title}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
