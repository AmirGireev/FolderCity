// Draws the outline of many boxes as thin lines in one draw call.
"use client";

import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from "three";
import { boxEdgeSegments } from "../../src/city/geometry";
import type { CityNode } from "../../src/types/cityModel";

interface Props {
  nodes: CityNode[];
  color: string;
  opacity?: number;
}

export function BoxEdges({ nodes, color, opacity = 0.5 }: Props) {
  const lines = useMemo(() => {
    if (nodes.length === 0) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(nodes.flatMap((n) => boxEdgeSegments(n)), 3));
    const material = new LineBasicMaterial({ color, transparent: true, opacity });
    const segments = new LineSegments(geometry, material);
    segments.raycast = () => {};
    return segments;
  }, [nodes, color, opacity]);

  return lines ? <primitive object={lines} /> : null;
}
