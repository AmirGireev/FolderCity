// Shows folder names, only for folders near the camera.
"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { nodeCenter } from "../../src/city/geometry";
import { nearbyFolderLabels } from "../../src/city/lod";
import type { CityNode } from "../../src/types/cityModel";

const UPDATE_SECONDS = 0.25;

export function Labels({ folders }: { folders: CityNode[] }) {
  const [visible, setVisible] = useState<CityNode[]>([]);
  const lastUpdate = useRef(-1);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdate.current < UPDATE_SECONDS) return;
    lastUpdate.current = state.clock.elapsedTime;
    const { x, y, z } = state.camera.position;
    const next = nearbyFolderLabels(folders, [x, y, z]);
    setVisible((previous) =>
      previous.length === next.length && previous.every((node, i) => node === next[i]) ? previous : next,
    );
  });

  return (
    <>
      {visible.map((node) => {
        const [x, , z] = nodeCenter(node);
        const { position } = node.dimensions;
        return (
          <Html key={node.id} position={[x, position.y + 2, z]} center style={{ pointerEvents: "none" }}>
            <span className="city-label">{node.name}</span>
          </Html>
        );
      })}
    </>
  );
}
