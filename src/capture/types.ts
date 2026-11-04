export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 게임 화면 해상도별 영역. 한 번 정한 크기는 자동 복원한다. */
export interface SavedRegion extends Rect {
  frameW: number;
  frameH: number;
  automatic?: boolean;
}

export function regionValidFor(r: SavedRegion | null | undefined, frameW: number, frameH: number): r is SavedRegion {
  return !!r && r.frameW === frameW && r.frameH === frameH
    && [r.x,r.y,r.w,r.h].every(Number.isFinite) && r.x>=0 && r.y>=0 && r.w>0 && r.h>0
    && r.x+r.w<=frameW && r.y+r.h<=frameH;
}
