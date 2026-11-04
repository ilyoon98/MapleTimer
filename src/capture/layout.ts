import type { Rect } from './types';

export const GAME_RESOLUTIONS = [[1024,768],[1280,720],[1366,768],[1920,1080],[1920,1200],[2560,1440]] as const;
/** Windows 창 테두리의 크기만 보정한다. 화면 안의 UI를 해상도 비율로 늘리지 않는다. */
export function inferGameViewport(width: number, height: number): Rect {
  for (const [w,h] of GAME_RESOLUTIONS) {
    if (width === w && height === h) return { x:0, y:0, w, h };
  }
  for (const [w,h] of GAME_RESOLUTIONS) {
    const dx = width - w, dy = height - h;
    if (dx >= 0 && dx <= 16 && dy >= 22 && dy <= 64 && dy > dx) {
      const x = Math.floor(dx / 2);
      return { x, y:dy-x, w, h };
    }
  }
  return { x:0, y:0, w:width, h:height };
}

export function validViewport(r: Rect | undefined, width: number, height: number): r is Rect {
  return !!r && [r.x,r.y,r.w,r.h].every(Number.isFinite) && r.x >= 0 && r.y >= 0
    && r.w >= 320 && r.h >= 240 && r.x+r.w <= width && r.y+r.h <= height;
}
