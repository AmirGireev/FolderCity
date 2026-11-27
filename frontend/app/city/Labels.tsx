// Shows folder names: open folders only when near, collapsed blocks from further away.
"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { nodeCenter } from "../../src/city/geometry";
import { nearbyFolderLabels } from "../../src/city/lod";
import type { CityNode } from "../../src/types/cityModel";

const UPDATE_SECONDS = 0.25;
const CLUSTER_LABEL_DISTANCE = 500;
const CLUSTER_LABEL_COUNT = 15;

interface Props {
  folders: CityNode[];
  clusters: CityNode[];
}

const same = (a: CityNode[], b: CityNode[]) => a.length === b.length && a.every((node, i) => node === b[i]);

export function Labels({ folders, clusters }: Props) {
  const [visibleFolders, setVisibleFolders] = useState<CityNode[]>([]);
  const [visibleClusters, setVisibleClusters] = useState<CityNode[]>([]);
  const lastUpdate = useRef(-1);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdate.current < UPDATE_SECONDS) return;
    lastUpdate.current = state.clock.elapsedTime;
    const { x, y, z } = state.camera.position;
    const nextFolders = nearbyFolderLabels(folders, [x, y, z]);
    const nextClusters = nearbyFolderLabels(clusters, [x, y, z], CLUSTER_LABEL_DISTANCE, CLUSTER_LABEL_COUNT);
    setVisibleFolders((previous) => (same(previous, nextFolders) ? previous : nextFolders));
    setVisibleClusters((previous) => (same(previous, nextClusters) ? previous : nextClusters));
  });

  return (
    <>
      {visibleFolders.map((node) => {
        const [x, , z] = nodeCenter(node);
        return (
          <Html key={node.id} position={[x, node.dimensions.position.y + 2, z]} center style={{ pointerEvents: "none" }}>
            <span className="city-label">{node.name}</span>
          </Html>
        );
      })}
      {visibleClusters.map((node) => {
        const [x, , z] = nodeCenter(node);
        const { position, height } = node.dimensions;
        return (
          <Html key={node.id} position={[x, position.y + height + 1.5, z]} center style={{ pointerEvents: "none" }}>
            <span className="city-label cluster">{node.name}</span>
          </Html>
        );
      })}
    </>
  );
}
