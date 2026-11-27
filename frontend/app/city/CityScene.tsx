// The 3D scene: platforms, buildings, empty-file plates, empty-folder outlines and labels.
"use client";

import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useMemo } from "react";
import { colorForExtension, platformColor } from "../../src/city/colors";
import { EMPTY_FOLDER_PLATE_HEIGHT } from "../../src/city/geometry";
import { useCityStore } from "../../src/city/store";
import type { CityNode } from "../../src/types/cityModel";
import { CameraRig } from "./CameraRig";
import { EmptyFolderOutlines } from "./EmptyFolderOutlines";
import { InstancedBoxes } from "./InstancedBoxes";
import { Labels } from "./Labels";

const buildingColor = (node: CityNode) => colorForExtension(node.metrics.extension);
const emptyFileColor = (node: CityNode) => colorForExtension(node.metrics.extension);
const emptyFolderColor = () => "#8b949e";

export default function CityScene({ showStats }: { showStats: boolean }) {
  const city = useCityStore((state) => state.city);
  const layers = useCityStore((state) => state.layers);

  const groups = useMemo(() => {
    const nodes = city?.nodes ?? [];
    return {
      folders: nodes.filter((n) => n.type === "folder"),
      files: nodes.filter((n) => n.type === "file"),
      emptyFiles: nodes.filter((n) => n.type === "empty_file"),
      emptyFolders: nodes.filter((n) => n.type === "empty_folder"),
    };
  }, [city]);

  if (!city) return null;

  return (
    <Canvas frameloop="demand" camera={{ fov: 50, near: 0.1, far: 6000 }} onPointerMissed={() => useCityStore.getState().select(null)}>
      <color attach="background" args={["#0d1117"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[60, 120, 40]} intensity={1.4} />
      <CameraRig />
      <InstancedBoxes nodes={groups.folders} colorOf={platformColor} />
      <InstancedBoxes nodes={groups.files} colorOf={buildingColor} />
      {layers.emptyFiles && <InstancedBoxes nodes={groups.emptyFiles} colorOf={emptyFileColor} opacity={0.35} />}
      {layers.emptyFolders && (
        <>
          <InstancedBoxes
            nodes={groups.emptyFolders}
            colorOf={emptyFolderColor}
            minHeight={EMPTY_FOLDER_PLATE_HEIGHT}
            opacity={0.15}
          />
          <EmptyFolderOutlines nodes={groups.emptyFolders} />
        </>
      )}
      <Labels folders={groups.folders} />
      {showStats && <Stats />}
    </Canvas>
  );
}
