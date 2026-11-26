// Checks that the CityModel types match the schema.
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

describe("CityModel types match the JSON schema", () => {
  it("NodeType values match", () => {
    expect([...NODE_TYPES].sort()).toEqual([...schema.$defs.NodeType.enum].sort());
  });

  it("ArchitectureKind values match", () => {
    expect([...ARCHITECTURE_KINDS].sort()).toEqual(
      [...schema.$defs.ArchitectureKind.enum].sort(),
    );
  });

  it("source kinds match", () => {
    expect([...SOURCE_KINDS].sort()).toEqual([...schema.properties.source.properties.kind.enum].sort());
  });

  it("required fields of the root object match", () => {
    const tsRequired = ["schemaVersion", "rootId", "nodes", "edges", "architecture"];
    expect(tsRequired.sort()).toEqual([...schema.required].sort());
  });

  it("the example only uses known values", () => {
    for (const n of typedExample.nodes) expect(NODE_TYPES).toContain(n.type);
    for (const a of typedExample.architecture) expect(ARCHITECTURE_KINDS).toContain(a.kind);
    expect(typedExample.nodes.some((n) => n.id === typedExample.rootId)).toBe(true);
  });
});
