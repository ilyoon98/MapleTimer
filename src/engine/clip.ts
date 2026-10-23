import { screenCapture } from "../capture/screenCapture";
import { regionValidFor, type Rect } from "../capture/types";
import type { Profile } from "../state/profile";

/**
 * 진단용 최근 30초 녹화. 화면 전체가 아니라 선택한 영역만 0.25초마다 기억해 둔다 (메모리 몇십 MB 이내).
 * 진단 파일에 같이 넣어 두면, 그 30초를 개발 모드에서 다시 재생해 실제 게임 문제를 그대로 재현할 수 있다.
 */
export const CLIP_MS = 30_000;
/** 엔진처럼 0.25초마다 (tick 이 조금 늦어도 건너뛰지 않게 여유를 둔다) */
const STEP_MS = 250;

interface ClipFrame {
  t: number;
  /** 화면 전체 평균 밝기 (재생할 때 바탕 밝기로 써서 맵 이동 암전도 재현) */
  mean: number;
  crops: Record<string, ImageData>;
}
const frames: ClipFrame[] = [];
let last = 0;

export function recordClip(p: Profile, now: number, live: boolean, mean: number | null) {
  if (!live) {
    frames.length = 0; // 공유가 끊기면 이어 붙이지 않는다
    return;
  }
  if (now - last < STEP_MS - 60) return;
  last = now;
  const crops: Record<string, ImageData> = {};
  for (const [key, r] of Object.entries(p.regions)) {
    if (!regionValidFor(r, screenCapture.width, screenCapture.height)) continue;
    const img = screenCapture.crop(r);
    if (img) crops[key] = img;
  }
  frames.push({ t: now, mean: mean ?? 0, crops });
  while (frames.length && now - frames[0].t > CLIP_MS) frames.shift();
}

/** 진단 파일에 넣는 형식: 영역 위치 + 0.25초마다의 영역 그림(PNG) */
export interface ClipData {
  width: number;
  height: number;
  regions: Record<string, Rect>;
  frames: Array<{ t: number; mean: number; crops: Record<string, string> }>;
}

export function clipSnapshot(p: Profile): ClipData | null {
  if (!frames.length) return null;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const png = (img: ImageData) => {
    c.width = img.width;
    c.height = img.height;
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  };
  const regions: Record<string, Rect> = {};
  for (const [key, r] of Object.entries(p.regions)) if (r) regions[key] = { x: r.x, y: r.y, w: r.w, h: r.h };
  return {
    width: screenCapture.width,
    height: screenCapture.height,
    regions,
    frames: frames.map((f) => ({ t: f.t, mean: Math.round(f.mean), crops: Object.fromEntries(Object.entries(f.crops).map(([k, img]) => [k, png(img)])) })),
  };
}
