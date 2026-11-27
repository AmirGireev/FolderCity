// Draws many boxes with one draw call and reports hover, click and double-click per box.
"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Color, InstancedMesh, Object3D } from "three";
import { HOVER_COLOR, SELECTED_COLOR } from "../../src/city/colors";
import { useCityStore } from "../../src/city/store";
import type { CityNode } from "../../src/types/cityModel";

const CLICK_DRAG_LIMIT = 4;
const helper = new Object3D();
const tint = new Color();

interface Props {
  nodes: CityNode[];
  colorOf: (node: CityNode) => string;
  minHeight?: number;
  opacity?: number;
  shadows?: boolean;
}

export function InstancedBoxes({ nodes, colorOf, minHeight = 0, opacity = 1, shadows = false }: Props) {
  const meshRef = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const hoverId = useCityStore((state) => state.hoverId);
  const selectedId = useCityStore((state) => state.selectedId);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    nodes.forEach((node, index) => {
      const { position, width, depth, height } = node.dimensions;
      const boxHeight = Math.max(height, minHeight);
      helper.position.set(position.x + width / 2, position.y + boxHeight / 2, position.z + depth / 2);
      helper.scale.set(width, boxHeight, depth);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [nodes, minHeight, invalidate]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    nodes.forEach((node, index) => {
      const base = node.id === selectedId ? SELECTED_COLOR : node.id === hoverId ? HOVER_COLOR : colorOf(node);
      mesh.setColorAt(index, tint.set(base));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [nodes, colorOf, hoverId, selectedId, invalidate]);

  const nodeAt = (event: ThreeEvent<MouseEvent | PointerEvent>) =>
    event.instanceId === undefined ? undefined : nodes[event.instanceId];

  if (nodes.length === 0) return null;

  return (
    <instancedMesh
      key={nodes.length}
      ref={meshRef}
      args={[undefined, undefined, nodes.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      onPointerMove={(event) => {
        const node = nodeAt(event);
        if (!node) return;
        event.stopPropagation();
        useCityStore.getState().hover(node.id);
      }}
      onPointerOut={() => useCityStore.getState().hover(null)}
      onClick={(event) => {
        const node = nodeAt(event);
        if (!node || event.delta > CLICK_DRAG_LIMIT) return;
        event.stopPropagation();
        useCityStore.getState().select(node.id);
      }}
      onDoubleClick={(event) => {
        const node = nodeAt(event);
        if (!node) return;
        event.stopPropagation();
        useCityStore.getState().flyTo(node.id);
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </instancedMesh>
  );
}
