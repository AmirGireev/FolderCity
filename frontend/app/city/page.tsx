// The city page: opens after a scan and shows the 3D city with its tools.
"use client";

import Link from "next/link";
import { useCityStore } from "../../src/city/store";
import { CityView } from "./CityView";

export default function CityPage() {
  const city = useCityStore((state) => state.city);

  return (
    <div className="city-page">
      <header className="city-header">
        <Link href="/">← Scan another folder</Link>
        {city && <strong>{city.nodes.find((node) => node.id === city.rootId)?.name}</strong>}
      </header>
      {city ? (
        <CityView />
      ) : (
        <main className="home">
          <p>No city loaded yet.</p>
          <Link href="/">Scan a folder first</Link>
        </main>
      )}
    </div>
  );
}
