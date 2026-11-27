// Draws many architecture shapes (boxes, cylinders or spheres) with one draw call and makes them clickable.
"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Color, InstancedMesh, Object3D } from "three";
import type { ArchShape, ShapeKind } from "../../src/city/architecture";
import { SELECTED_COLOR, architectureColor } from "../../src/city/colors";
import { useCityStore } from "../../src/city/store";

const helper = new Object3D();
const tint = new Color();
const CLICK_DRAG_LIMIT = 4;

export function InstancedShapes({ shapes, geometry }: { shapes: ArchShape[]; geometry: ShapeKind }) {
  const meshRef = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const selectedArchId = useCityStore((state) => state.selectedArchId);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    shapes.forEach((shape, index) => {
      helper.position.set(...shape.position);
      helper.scale.set(...shape.scale);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [shapes, invalidate]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    shapes.forEach((shape, index) => {
      mesh.setColorAt(index, tint.set(shape.archId === selectedArchId ? SELECTED_COLOR : architectureColor(shape.kind)));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [shapes, selectedArchId, invalidate]);

  if (shapes.length === 0) return null;

  const pick = (event: ThreeEvent<MouseEvent | PointerEvent>) =>
    event.instanceId === undefined ? undefined : shapes[event.instanceId];

  return (
    <instancedMesh
      key={`${geometry}-${shapes.length}`}
      ref={meshRef}
      args={[undefined, undefined, shapes.length]}
      castShadow
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
      onClick={(event) => {
        const shape = pick(event);
        if (!shape || event.delta > CLICK_DRAG_LIMIT) return;
        event.stopPropagation();
        useCityStore.getState().selectArch(shape.archId);
      }}
    >
      {geometry === "box" && <boxGeometry args={[1, 1, 1]} />}
      {geometry === "cylinder" && <cylinderGeometry args={[0.5, 0.5, 1, 24]} />}
      {geometry === "sphere" && <sphereGeometry args={[0.5, 24, 16]} />}
      <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.12} />
    </instancedMesh>
  );
}
