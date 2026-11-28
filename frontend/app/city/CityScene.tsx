// The 3D scene: platforms, buildings, collapsed folder blocks, architecture and finding layers, edge lines, shadows, grid and labels.
"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, Stats } from "@react-three/drei";
import { useCallback, useMemo } from "react";
import { clusterNode, hiddenIds } from "../../src/city/collapse";
import { colorForExtension, complexityColor, platformColor } from "../../src/city/colors";
import { EMPTY_FOLDER_PLATE_HEIGHT } from "../../src/city/geometry";
import { useCityStore } from "../../src/city/store";
import type { CityNode } from "../../src/types/cityModel";
import { ArchitectureLayer } from "./ArchitectureLayer";
import { BoxEdges } from "./BoxEdges";
import { CameraRig } from "./CameraRig";
import { CollapseController } from "./CollapseController";
import { EmptyFolderOutlines } from "./EmptyFolderOutlines";
import { ErrorPulse } from "./ErrorPulse";
import { InstancedBoxes } from "./InstancedBoxes";
import { Labels } from "./Labels";
import { Sun } from "./Sun";

const buildingColor = (node: CityNode) => colorForExtension(node.metrics.extension);
const emptyFolderColor = () => "#8b949e";

export default function CityScene({ showStats }: { showStats: boolean }) {
  const city = useCityStore((state) => state.city);
  const layers = useCityStore((state) => state.layers);
  const collapsedIds = useCityStore((state) => state.collapsedIds);
  const collapseIndex = useCityStore((state) => state.collapseIndex);

  const frame = useMemo(() => {
    const root = city?.nodes.find((n) => n.id === city.rootId);
    const { position, width = 20, depth = 20 } = root?.dimensions ?? {};
    return {
      center: [(position?.x ?? 0) + width / 2, 0, (position?.z ?? 0) + depth / 2] as [number, number, number],
      extent: Math.max(width, depth, 20),
    };
  }, [city]);

  const scene = useMemo(() => {
    const hidden = collapseIndex ? hiddenIds(collapsedIds, collapseIndex) : new Set<string>();
    const nodes = (city?.nodes ?? []).filter((n) => !hidden.has(n.id));
    const clusters = collapseIndex
      ? nodes.flatMap((n) => {
          const info = collapsedIds.has(n.id) ? collapseIndex.info.get(n.id) : undefined;
          return info ? [clusterNode(n, info)] : [];
        })
      : [];
    return {
      folders: nodes.filter((n) => n.type === "folder"),
      files: nodes.filter((n) => n.type === "file"),
      emptyFiles: nodes.filter((n) => n.type === "empty_file"),
      emptyFolders: nodes.filter((n) => n.type === "empty_folder"),
      clusters,
      hidden,
      openFolders: nodes.filter((n) => n.type === "folder" && !collapsedIds.has(n.id)),
    };
  }, [city, collapsedIds, collapseIndex]);

  const fileColor = layers.complexity ? complexityColor : buildingColor;

  const clusterColor = useCallback(
    (node: CityNode) => {
      const info = collapseIndex?.info.get(node.id);
      if (layers.complexity) {
        return complexityColor({ ...node, metrics: { complexity: info?.maxComplexity, cycle: info?.hasCycle ? 1 : undefined } });
      }
      return colorForExtension(info?.dominantExtension);
    },
    [collapseIndex, layers.complexity],
  );

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
      <Sun center={frame.center} extent={frame.extent} />
      <Grid
        position={[frame.center[0], -0.05, frame.center[2]]}
        args={[10, 10]}
        infiniteGrid
        cellSize={5}
        cellThickness={0.6}
        cellColor="#2d333b"
        sectionSize={25}
        sectionThickness={1.2}
        sectionColor="#4b5563"
        fadeDistance={frame.extent * 3}
        fadeStrength={1.5}
      />
      <CameraRig />
      <CollapseController />
      <InstancedBoxes nodes={scene.folders} colorOf={platformColor} shadows />
      <InstancedBoxes nodes={scene.files} colorOf={fileColor} shadows />
      <BoxEdges nodes={scene.folders} color="#9da7b3" opacity={0.45} />
      <InstancedBoxes nodes={scene.clusters} colorOf={clusterColor} shadows />
      <BoxEdges nodes={scene.files} color="#05070a" opacity={0.55} />
      <BoxEdges nodes={scene.clusters} color="#05070a" opacity={0.55} />
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
      {layers.errors && <ErrorPulse files={scene.files} clusters={scene.clusters} />}
      <ArchitectureLayer hidden={scene.hidden} />
      <Labels folders={scene.openFolders} clusters={scene.clusters} />
      {showStats && <Stats />}
    </Canvas>
  );
}
