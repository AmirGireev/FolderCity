// Makes buildings and collapsed blocks with findings pulse red; worse findings pulse stronger.
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh, MeshBasicMaterial, Object3D } from "three";
import { PULSE, pulseOpacity, severityByFile, severityUnder } from "../../src/city/findings";
import { useCityStore } from "../../src/city/store";
import type { CityNode, Severity } from "../../src/types/cityModel";

const GROW = 0.14;
const SEVERITIES: Severity[] = ["low", "medium", "high"];
const helper = new Object3D();

function PulseMesh({ nodes, severity }: { nodes: CityNode[]; severity: Severity }) {
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    nodes.forEach((node, index) => {
      const { position, width, depth, height } = node.dimensions;
      helper.position.set(position.x + width / 2, position.y + height / 2, position.z + depth / 2);
      helper.scale.set(width + GROW, height + GROW, depth + GROW);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [nodes, invalidate]);

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.opacity = pulseOpacity(severity, clock.elapsedTime);
    invalidate();
  });

  return (
    <instancedMesh key={nodes.length} ref={meshRef} args={[undefined, undefined, nodes.length]} raycast={() => null} renderOrder={5}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial ref={materialRef} color="#ff3b3b" transparent opacity={PULSE[severity].base} depthWrite={false} />
    </instancedMesh>
  );
}

export function ErrorPulse({ files, clusters }: { files: CityNode[]; clusters: CityNode[] }) {
  const findings = useCityStore((state) => state.city?.findings);
  const collapseIndex = useCityStore((state) => state.collapseIndex);

  const groups = useMemo(() => {
    const bySeverity = severityByFile(findings ?? []);
    const result: Record<Severity, CityNode[]> = { low: [], medium: [], high: [] };
    for (const file of files) {
      const severity = bySeverity.get(file.id);
      if (severity) result[severity].push(file);
    }
    if (collapseIndex) {
      for (const cluster of clusters) {
        const severity = severityUnder(cluster.id, collapseIndex.children, bySeverity);
        if (severity) result[severity].push(cluster);
      }
    }
    return result;
  }, [findings, files, clusters, collapseIndex]);

  return (
    <>
      {SEVERITIES.map((severity) => (groups[severity].length > 0 ? <PulseMesh key={severity} nodes={groups[severity]} severity={severity} /> : null))}
    </>
  );
}
