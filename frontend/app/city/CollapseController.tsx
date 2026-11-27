// Updates which folders are collapsed into single blocks while the camera moves.
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { computeCollapsed, forcedOpenIds, sameSet } from "../../src/city/collapse";
import { useCityStore } from "../../src/city/store";

const UPDATE_SECONDS = 0.2;

export function CollapseController() {
  const camera = useThree((state) => state.camera);
  const city = useCityStore((state) => state.city);
  const selectedId = useCityStore((state) => state.selectedId);
  const mergeFolders = useCityStore((state) => state.layers.mergeFolders);
  const lastUpdate = useRef(-1);

  const update = useCallback(() => {
    const { collapseIndex, collapsedIds, nodesById, selectedId: selected, layers, setCollapsed } = useCityStore.getState();
    if (!collapseIndex) return;
    const { x, y, z } = camera.position;
    const next = layers.mergeFolders
      ? computeCollapsed(collapseIndex, [x, y, z], collapsedIds, forcedOpenIds(selected, nodesById))
      : new Set<string>();
    if (!sameSet(next, collapsedIds)) setCollapsed(next);
  }, [camera]);

  useEffect(update, [update, city, selectedId, mergeFolders]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdate.current < UPDATE_SECONDS) return;
    lastUpdate.current = state.clock.elapsedTime;
    update();
  });

  return null;
}
