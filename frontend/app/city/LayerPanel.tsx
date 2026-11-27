// The layer switches: simple layers on, complex layers off until their data exists.
"use client";

import { LAYER_DEFINITIONS } from "../../src/city/layers";
import { useCityStore } from "../../src/city/store";

export function LayerPanel() {
  const city = useCityStore((state) => state.city);
  const layers = useCityStore((state) => state.layers);
  const setLayer = useCityStore((state) => state.setLayer);

  return (
    <section className="layer-panel" aria-label="Layers">
      <h3>Layers</h3>
      <ul>
        {LAYER_DEFINITIONS.map((layer) => {
          const available = layer.isAvailable(city);
          return (
            <li key={layer.key}>
              <label className={available ? undefined : "disabled"}>
                <input
                  type="checkbox"
                  checked={available && layers[layer.key]}
                  disabled={!available}
                  onChange={(event) => setLayer(layer.key, event.target.checked)}
                />
                {layer.label}
                {!available && <small> (coming soon)</small>}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
