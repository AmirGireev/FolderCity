// Shows the 3D city, the sidebar and the code viewer once a city has been built.
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCityStore } from "../../src/city/store";
import { CodeViewer } from "./CodeViewer";
import { Sidebar } from "./Sidebar";

const CityScene = dynamic(() => import("./CityScene"), { ssr: false });

export function CityView() {
  const hasCity = useCityStore((state) => state.city !== null);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => setShowStats(new URLSearchParams(window.location.search).has("stats")), []);

  if (!hasCity) return null;

  return (
    <div className="city-layout">
      <section className="city-view" data-testid="city-view">
        <div className="city-canvas">
          <CityScene showStats={showStats} />
        </div>
        <Sidebar />
      </section>
      <CodeViewer />
    </div>
  );
}
