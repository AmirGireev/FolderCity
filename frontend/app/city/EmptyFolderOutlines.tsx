// Draws empty folders as dashed outlines.
"use client";

import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, LineDashedMaterial, LineSegments } from "three";
import { outlineSegments } from "../../src/city/geometry";
import type { CityNode } from "../../src/types/cityModel";

export function EmptyFolderOutlines({ nodes }: { nodes: CityNode[] }) {
  const lines = useMemo(() => {
    if (nodes.length === 0) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(nodes.flatMap(outlineSegments), 3));
    const material = new LineDashedMaterial({ color: "#c9d1d9", dashSize: 0.6, gapSize: 0.4 });
    const segments = new LineSegments(geometry, material);
    segments.computeLineDistances();
    segments.raycast = () => {};
    return segments;
  }, [nodes]);

  return lines ? <primitive object={lines} /> : null;
}
