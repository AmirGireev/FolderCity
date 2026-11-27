// Moves the camera smoothly to the node of the latest flyTo request.
"use client";

import { CameraControls } from "@react-three/drei";
import { useEffect, useRef, type ComponentRef } from "react";
import { cameraPoseFor } from "../../src/city/geometry";
import { useCityStore } from "../../src/city/store";

export function CameraRig() {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const request = useCityStore((state) => state.cameraRequest);

  useEffect(() => {
    const rig = controls.current;
    const node = request ? useCityStore.getState().nodesById.get(request.nodeId) : undefined;
    if (!rig || !request || !node) return;
    const { position, target } = cameraPoseFor(node);
    void rig.setLookAt(...position, ...target, !request.instant);
  }, [request]);

  return <CameraControls ref={controls} makeDefault smoothTime={0.35} maxDistance={3000} />;
}
