// Pure rules for the resizable 3D pane: sizes stay in range and the code viewer moves beside the pane when there is room.
export const MIN_PANE_WIDTH = 280;
export const MIN_PANE_HEIGHT = 200;
export const MAX_PANE_HEIGHT = 2000;
export const MIN_CODE_WIDTH = 380;
export const PANE_GAP = 12;
const FILL_SNAP = 16;

export function clampHeight(height: number): number {
  return Math.min(MAX_PANE_HEIGHT, Math.max(MIN_PANE_HEIGHT, Math.round(height)));
}

export function clampWidth(width: number, containerWidth: number): number | null {
  if (containerWidth <= 0) return null;
  if (width >= containerWidth - FILL_SNAP) return null;
  return Math.max(Math.min(MIN_PANE_WIDTH, containerWidth), Math.round(width));
}

export function effectiveWidth(width: number | null, containerWidth: number): number {
  if (width === null) return containerWidth;
  return Math.min(width, containerWidth);
}

export function codeBesidePane(width: number | null, containerWidth: number): boolean {
  if (width === null) return false;
  return containerWidth - effectiveWidth(width, containerWidth) - PANE_GAP >= MIN_CODE_WIDTH;
}
