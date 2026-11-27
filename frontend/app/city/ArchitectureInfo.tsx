// Inspector section for architecture elements of the selected file and the presumed data path of a selected gate.
"use client";

import { useMemo } from "react";
import { ARCH_KIND_LABEL, architectureByFile } from "../../src/city/architecture";
import { architectureColor } from "../../src/city/colors";
import { findDataPaths } from "../../src/city/dataPaths";
import { useCityStore } from "../../src/city/store";

export function ArchitectureInfo({ fileId, extended }: { fileId: string; extended: boolean }) {
  const city = useCityStore((state) => state.city);
  const selectedArchId = useCityStore((state) => state.selectedArchId);
  const archById = useCityStore((state) => state.archById);
  const showPaths = useCityStore((state) => state.layers.dataPaths);
  const selectArch = useCityStore((state) => state.selectArch);
  const selectAndFly = useCityStore((state) => state.selectAndFly);

  const inFile = useMemo(() => (city ? architectureByFile(city).get(fileId) ?? [] : []), [city, fileId]);
  const selected = selectedArchId ? archById.get(selectedArchId) : undefined;
  const paths = useMemo(
    () => (city && selected?.kind === "api" ? findDataPaths(city, selected.id) : []),
    [city, selected],
  );

  const showList = extended && inFile.length > 0;
  if (!showList && !selected) return null;

  return (
    <div className="arch-info" data-testid="arch-info">
      {showList && (
        <>
          <h4>Architecture in this file ({inFile.length})</h4>
          <ul>
            {inFile.map((item) => (
              <li key={item.id}>
                <span className="arch-badge" style={{ background: architectureColor(item.kind) }} />
                <button type="button" onClick={() => selectArch(item.id)}>
                  {item.label} (line {item.line})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {selected && (
        <div data-testid="arch-selected">
          <h4>{ARCH_KIND_LABEL[selected.kind]}</h4>
          <p className="path">{selected.label}</p>
          <p className="path">
            <button type="button" onClick={() => selectAndFly(selected.fileId)}>
              {selected.fileId}
            </button>{" "}
            (line {selected.line})
          </p>
          {selected.kind === "api" && (
            <>
              <h4>Presumed data path ({paths.length})</h4>
              <p className="note">Presumed: found through imports, not through real calls.</p>
              {!showPaths && <p className="note">Turn on “Data paths (presumed)” in the layers to see the arcs in the city.</p>}
              {paths.length === 0 ? (
                <p className="note">No path to a database found.</p>
              ) : (
                <ul>
                  {paths.map((path, index) => (
                    <li key={index} className="path" data-testid="data-path">
                      {[...path.files, path.database.label].join(" → ")}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
