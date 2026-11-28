// Inspector section with complexity, blast radius and circular imports of a file.
"use client";

import { useMemo } from "react";
import { useCityStore } from "../../src/city/store";
import type { CityNode } from "../../src/types/cityModel";

const MAX_LISTED = 6;

export function MetricsInfo({ node }: { node: CityNode }) {
  const city = useCityStore((state) => state.city);
  const selectAndFly = useCityStore((state) => state.selectAndFly);
  const { complexity, blastRadius, cycle, cycleSize } = node.metrics;

  const members = useMemo(
    () => (cycle === undefined || !city ? [] : city.nodes.filter((n) => n.metrics.cycle === cycle && n.id !== node.id).map((n) => n.id)),
    [city, cycle, node.id],
  );

  if (complexity === undefined && blastRadius === undefined && cycle === undefined) return null;

  return (
    <div className="metrics-info" data-testid="metrics-info">
      <h4>Code metrics</h4>
      <dl>
        <dt>Complexity</dt>
        <dd>{complexity === undefined ? "–" : `${complexity} (most complex function)`}</dd>
        <dt>Blast radius</dt>
        <dd>
          {blastRadius === undefined ? "–" : `${blastRadius} ${blastRadius === 1 ? "file imports" : "files import"} this file, directly or indirectly`}
        </dd>
      </dl>
      {cycle !== undefined && (
        <div className="relations" data-testid="cycle-info">
          <h4>Circular imports</h4>
          <p className="note">This file is part of a cycle with {cycleSize} files:</p>
          <ul>
            {members.slice(0, MAX_LISTED).map((id) => (
              <li key={id}>
                <button type="button" onClick={() => selectAndFly(id)}>
                  {id}
                </button>
              </li>
            ))}
          </ul>
          {members.length > MAX_LISTED && <p className="note">and {members.length - MAX_LISTED} more</p>}
        </div>
      )}
    </div>
  );
}
