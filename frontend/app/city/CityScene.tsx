// The 3D scene: platforms, buildings, edge lines, shadows, ground grid and labels.
"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, Stats } from "@react-three/drei";
import { useMemo } from "react";
import { colorForExtension, platformColor } from "../../src/city/colors";
import { EMPTY_FOLDER_PLATE_HEIGHT } from "../../src/city/geometry";
import { useCityStore } from "../../src/city/store";
import type { CityNode } from "../../src/types/cityModel";
import { BoxEdges } from "./BoxEdges";
import { CameraRig } from "./CameraRig";
import { EmptyFolderOutlines } from "./EmptyFolderOutlines";
import { InstancedBoxes } from "./InstancedBoxes";
import { Labels } from "./Labels";
import { Sun } from "./Sun";

const buildingColor = (node: CityNode) => colorForExtension(node.metrics.extension);
const emptyFolderColor = () => "#8b949e";

export default function CityScene({ showStats }: { showStats: boolean }) {
  const city = useCityStore((state) => state.city);
  const layers = useCityStore((state) => state.layers);

  const scene = useMemo(() => {
    const nodes = city?.nodes ?? [];
    const root = nodes.find((n) => n.id === city?.rootId);
    const { position, width = 20, depth = 20 } = root?.dimensions ?? {};
    return {
      folders: nodes.filter((n) => n.type === "folder"),
      files: nodes.filter((n) => n.type === "file"),
      emptyFiles: nodes.filter((n) => n.type === "empty_file"),
      emptyFolders: nodes.filter((n) => n.type === "empty_folder"),
      center: [(position?.x ?? 0) + width / 2, 0, (position?.z ?? 0) + depth / 2] as [number, number, number],
      extent: Math.max(width, depth, 20),
    };
  }, [city]);

  if (!city) return null;

  return (
    <Canvas
      shadows
      frameloop="demand"
      camera={{ fov: 50, near: 0.1, far: 6000 }}
      onPointerMissed={() => useCityStore.getState().select(null)}
    >
      <color attach="background" args={["#0d1117"]} />
      <ambientLight intensity={0.7} />
      <Sun center={scene.center} extent={scene.extent} />
      <Grid
        position={[scene.center[0], -0.05, scene.center[2]]}
        args={[10, 10]}
        infiniteGrid
        cellSize={5}
        cellThickness={0.6}
        cellColor="#2d333b"
        sectionSize={25}
        sectionThickness={1.2}
        sectionColor="#4b5563"
        fadeDistance={scene.extent * 3}
        fadeStrength={1.5}
      />
      <CameraRig />
      <InstancedBoxes nodes={scene.folders} colorOf={platformColor} shadows />
      <InstancedBoxes nodes={scene.files} colorOf={buildingColor} shadows />
      <BoxEdges nodes={scene.folders} color="#9da7b3" opacity={0.45} />
      <BoxEdges nodes={scene.files} color="#05070a" opacity={0.55} />
      {layers.emptyFiles && <InstancedBoxes nodes={scene.emptyFiles} colorOf={buildingColor} opacity={0.35} />}
      {layers.emptyFolders && (
        <>
          <InstancedBoxes
            nodes={scene.emptyFolders}
            colorOf={emptyFolderColor}
            minHeight={EMPTY_FOLDER_PLATE_HEIGHT}
            opacity={0.15}
          />
          <EmptyFolderOutlines nodes={scene.emptyFolders} />
        </>
      )}
      <Labels folders={scene.folders} />
      {showStats && <Stats />}
    </Canvas>
  );
}
