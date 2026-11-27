// Shows the 3D city in a resizable pane, the code viewer beside or below it, and the sidebar.
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampHeight,
  clampWidth,
  codeBesidePane,
  effectiveWidth,
} from "../../src/city/paneLayout";
import { useCityStore } from "../../src/city/store";
import { CodeViewer } from "./CodeViewer";
import { Sidebar } from "./Sidebar";

const CityScene = dynamic(() => import("./CityScene"), { ssr: false });

type DragMode = "x" | "y" | "xy";

export function CityView() {
  const hasCity = useCityStore((state) => state.city !== null);
  const workspace = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const [showStats, setShowStats] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const [height, setHeight] = useState(520);
  const [belowHeight, setBelowHeight] = useState(360);

  useEffect(() => {
    setShowStats(new URLSearchParams(window.location.search).has("stats"));
    setHeight(clampHeight(window.innerHeight * 0.6));
    setBelowHeight(Math.max(280, Math.round(window.innerHeight * 0.4)));
  }, []);

  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasCity]);

  function startDrag(mode: DragMode) {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = pane.current?.getBoundingClientRect().width ?? containerWidth;
      const startHeight = height;
      const available = workspace.current?.getBoundingClientRect().width ?? containerWidth;

      const move = (moveEvent: PointerEvent) => {
        if (mode !== "y") setWidth(clampWidth(startWidth + moveEvent.clientX - startX, available));
        if (mode !== "x") setHeight(clampHeight(startHeight + moveEvent.clientY - startY));
      };
      const stop = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", stop);
        target.removeEventListener("pointercancel", stop);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", stop);
      target.addEventListener("pointercancel", stop);
    };
  }

  if (!hasCity) return null;

  const beside = codeBesidePane(width, containerWidth);
  const paneWidth = width === null ? "100%" : `${effectiveWidth(width, containerWidth)}px`;

  return (
    <div className="city-layout" data-testid="city-view">
      <div className="city-main">
        <div className="city-workspace" ref={workspace}>
          <div className="city-pane" ref={pane} style={{ width: paneWidth, height }} data-testid="city-pane">
            <div className="city-canvas">
              <CityScene showStats={showStats} />
            </div>
            <div className="resize-handle right" role="separator" aria-label="Resize width" onPointerDown={startDrag("x")} />
            <div className="resize-handle bottom" role="separator" aria-label="Resize height" onPointerDown={startDrag("y")} />
            <div className="resize-handle corner" role="separator" aria-label="Resize" onPointerDown={startDrag("xy")} />
          </div>
          <CodeViewer
            height={beside ? height : belowHeight}
            style={beside ? { flex: "1 1 0", minWidth: 0 } : { flex: "1 1 100%" }}
          />
        </div>
      </div>
      <Sidebar />
    </div>
  );
}
