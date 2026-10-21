export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 해상도별로 저장되는 영역 (해상도가 바뀌면 다시 선택해야 함) */
export interface SavedRegion extends Rect {
  frameW: number;
  frameH: number;
}

export function regionValidFor(r: SavedRegion | null | undefined, frameW: number, frameH: number): r is SavedRegion {
  return !!r && r.frameW === frameW && r.frameH === frameH;
}
