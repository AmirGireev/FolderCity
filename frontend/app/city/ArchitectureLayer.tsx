// Shows the architecture layers (gates, databases, satellites, servers), the selected label and the presumed data paths.
"use client";

import { Html, QuadraticBezierLine } from "@react-three/drei";
import { useMemo } from "react";
import { ARCH_LAYER, placeArchitecture, type ArchShape } from "../../src/city/architecture";
import { DATA_PATH_COLOR } from "../../src/city/colors";
import { findDataPaths } from "../../src/city/dataPaths";
import { distanceBetween, nodeCenter, type Vec3 } from "../../src/city/geometry";
import { useCityStore } from "../../src/city/store";
import { InstancedShapes } from "./InstancedShapes";

export function ArchitectureLayer({ hidden }: { hidden: ReadonlySet<string> }) {
  const city = useCityStore((state) => state.city);
  const nodesById = useCityStore((state) => state.nodesById);
  const layers = useCityStore((state) => state.layers);
  const selectedArchId = useCityStore((state) => state.selectedArchId);
  const archById = useCityStore((state) => state.archById);

  const placement = useMemo(
    () => (city ? placeArchitecture(city, nodesById, hidden) : { shapes: [], anchors: new Map<string, Vec3>() }),
    [city, nodesById, hidden],
  );

  const visible = useMemo(() => placement.shapes.filter((shape) => layers[ARCH_LAYER[shape.kind]]), [placement, layers]);
  const byGeometry = (geometry: ArchShape["shape"]) => visible.filter((shape) => shape.shape === geometry);

  const segments = useMemo(() => {
    const selected = selectedArchId ? archById.get(selectedArchId) : undefined;
    if (!city || !layers.dataPaths || !selected || selected.kind !== "api") return [];
    const gate = placement.anchors.get(selected.id);
    const unique = new Map<string, [Vec3, Vec3]>();
    for (const path of findDataPaths(city, selected.id)) {
      const points: Vec3[] = [];
      if (gate) points.push(gate);
      for (const fileId of path.files) {
        const file = nodesById.get(fileId);
        if (!file || hidden.has(fileId)) continue;
        const [x, , z] = nodeCenter(file);
        points.push([x, file.dimensions.position.y + file.dimensions.height + 0.4, z]);
      }
      const target = placement.anchors.get(path.database.id);
      if (target) points.push(target);
      for (let i = 0; i + 1 < points.length; i++) {
        unique.set(`${points[i].join(",")}>${points[i + 1].join(",")}`, [points[i], points[i + 1]]);
      }
    }
    return [...unique.values()];
  }, [city, layers.dataPaths, selectedArchId, archById, placement, nodesById, hidden]);

  const selectedAnchor = selectedArchId ? placement.anchors.get(selectedArchId) : undefined;
  const selectedItem = selectedArchId ? archById.get(selectedArchId) : undefined;

  return (
    <>
      <InstancedShapes shapes={byGeometry("box")} geometry="box" />
      <InstancedShapes shapes={byGeometry("cylinder")} geometry="cylinder" />
      <InstancedShapes shapes={byGeometry("sphere")} geometry="sphere" />
      {segments.map(([start, end]) => {
        const lift = distanceBetween(start, end) * 0.25 + 3;
        const mid: Vec3 = [(start[0] + end[0]) / 2, Math.max(start[1], end[1]) + lift, (start[2] + end[2]) / 2];
        return (
          <QuadraticBezierLine
            key={`${start.join(",")}>${end.join(",")}`}
            start={start}
            end={end}
            mid={mid}
            color={DATA_PATH_COLOR}
            lineWidth={3}
          />
        );
      })}
      {selectedAnchor && selectedItem && layers[ARCH_LAYER[selectedItem.kind]] && (
        <Html position={[selectedAnchor[0], selectedAnchor[1] + 1, selectedAnchor[2]]} center style={{ pointerEvents: "none" }}>
          <span className="city-label arch">{selectedItem.label}</span>
        </Html>
      )}
    </>
  );
}
