import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_KINDS,
  NODE_TYPES,
  SOURCE_KINDS,
  type CityModel,
} from "../src/types/cityModel";
import example from "../../schema/examples/minimal.city.json";

const schemaDir = join(__dirname, "..", "..", "schema");
const schema = JSON.parse(readFileSync(join(schemaDir, "citymodel.schema.json"), "utf-8"));

const typedExample: CityModel = example as CityModel;

describe("CityModel-Typen passen zum JSON-Schema", () => {
  it("NodeType-Werte stimmen überein", () => {
    expect([...NODE_TYPES].sort()).toEqual([...schema.$defs.NodeType.enum].sort());
  });

  it("ArchitectureKind-Werte stimmen überein", () => {
    expect([...ARCHITECTURE_KINDS].sort()).toEqual(
      [...schema.$defs.ArchitectureKind.enum].sort(),
    );
  });

  it("Source-Arten stimmen überein", () => {
    expect([...SOURCE_KINDS].sort()).toEqual([...schema.properties.source.properties.kind.enum].sort());
  });

  it("Pflichtfelder des Wurzelobjekts stimmen überein", () => {
    const tsRequired = ["schemaVersion", "rootId", "nodes", "edges", "architecture"];
    expect(tsRequired.sort()).toEqual([...schema.required].sort());
  });

  it("Beispiel nutzt nur bekannte Werte", () => {
    for (const n of typedExample.nodes) expect(NODE_TYPES).toContain(n.type);
    for (const a of typedExample.architecture) expect(ARCHITECTURE_KINDS).toContain(a.kind);
    expect(typedExample.nodes.some((n) => n.id === typedExample.rootId)).toBe(true);
  });
});
