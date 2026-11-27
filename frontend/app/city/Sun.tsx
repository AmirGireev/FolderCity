// A directional light whose shadow area follows the size of the city.
"use client";

import { useLayoutEffect, useRef } from "react";
import type { DirectionalLight } from "three";

interface Props {
  center: [number, number, number];
  extent: number;
}

export function Sun({ center, extent }: Props) {
  const light = useRef<DirectionalLight>(null);

  useLayoutEffect(() => {
    if (!light.current) return;
    light.current.target.position.set(...center);
    light.current.target.updateMatrixWorld();
  }, [center]);

  const reach = extent * 0.8;
  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={1.5}
      position={[center[0] + extent * 0.6, extent * 1.1, center[2] + extent * 0.4]}
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-reach}
      shadow-camera-right={reach}
      shadow-camera-top={reach}
      shadow-camera-bottom={-reach}
      shadow-camera-near={1}
      shadow-camera-far={extent * 4}
      shadow-bias={-0.0005}
    />
  );
}
