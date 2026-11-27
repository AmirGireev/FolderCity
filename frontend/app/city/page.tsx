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
        <Link href="/" className="brand">
          Folder<span>City</span>
        </Link>
        {city && <strong className="root-name">{city.nodes.find((node) => node.id === city.rootId)?.name}</strong>}
        <Link href="/" className="back">
          ← Scan another folder
        </Link>
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
