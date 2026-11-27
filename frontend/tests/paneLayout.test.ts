// Tests the rules of the resizable 3D pane.
import { describe, expect, it } from "vitest";
import {
  MAX_PANE_HEIGHT,
  MIN_CODE_WIDTH,
  MIN_PANE_HEIGHT,
  MIN_PANE_WIDTH,
  PANE_GAP,
  clampHeight,
  clampWidth,
  codeBesidePane,
  effectiveWidth,
} from "../src/city/paneLayout";

describe("pane size limits", () => {
  it("keeps the height in range", () => {
    expect(clampHeight(10)).toBe(MIN_PANE_HEIGHT);
    expect(clampHeight(99999)).toBe(MAX_PANE_HEIGHT);
    expect(clampHeight(432.6)).toBe(433);
  });

  it("keeps the width in range and snaps to full width near the edge", () => {
    expect(clampWidth(50, 1000)).toBe(MIN_PANE_WIDTH);
    expect(clampWidth(600, 1000)).toBe(600);
    expect(clampWidth(990, 1000)).toBeNull();
    expect(clampWidth(1500, 1000)).toBeNull();
    expect(clampWidth(500, 0)).toBeNull();
  });

  it("never gives a minimum wider than the container", () => {
    expect(clampWidth(10, 200)).toBe(200);
  });

  it("fills the container when no width is set and never exceeds it", () => {
    expect(effectiveWidth(null, 800)).toBe(800);
    expect(effectiveWidth(500, 800)).toBe(500);
    expect(effectiveWidth(900, 800)).toBe(800);
  });
});

describe("code viewer position", () => {
  it("is below when the pane fills the width", () => {
    expect(codeBesidePane(null, 1200)).toBe(false);
  });

  it("is below while the free space is too small", () => {
    expect(codeBesidePane(1200 - MIN_CODE_WIDTH - PANE_GAP + 1, 1200)).toBe(false);
  });

  it("moves beside the pane once there is room for it", () => {
    expect(codeBesidePane(1200 - MIN_CODE_WIDTH - PANE_GAP, 1200)).toBe(true);
    expect(codeBesidePane(MIN_PANE_WIDTH, 1200)).toBe(true);
  });

  it("goes back below when the pane is made wider again", () => {
    expect(codeBesidePane(500, 1200)).toBe(true);
    expect(codeBesidePane(1100, 1200)).toBe(false);
  });
});
