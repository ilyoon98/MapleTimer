import { stallRegion } from "../capture/detectionRegions";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor, type Rect, type SavedRegion } from "../capture/types";
import type { Profile } from "../state/profile";
import { buffRegion, preciseSkillBuffs } from "./buffs";

/**
 * 진단용 최근 30초 녹화. 화면 전체가 아니라 지금 감지에 쓰는 영역만 0.25초마다 기억해 둔다 (최대 32 MiB).
 * 진단 파일에 같이 넣어 두면, 그 30초를 개발 모드에서 다시 재생해 실제 게임 문제를 그대로 재현할 수 있다.
 */
export const CLIP_MS = 30_000;
export const CLIP_MAX_BYTES = 32 * 1024 * 1024;
/** 엔진처럼 0.25초마다 (tick 이 조금 늦어도 건너뛰지 않게 여유를 둔다) */
const STEP_MS = 250;
/** 동시에 압축 중인 그림 수 상한 (밀리면 압축하지 않고 그대로 보관) */
const MAX_PENDING_ENCODES = 8;

type Crop = ImageData | Blob;
interface ClipFrame {
  t: number;
  /** 화면 전체 평균 밝기 (재생할 때 바탕 밝기로 써서 맵 이동 암전도 재현) */
  mean: number;
  rects: Record<string, Rect>;
  crops: Record<string, Crop>;
  bytes: number;
  dropped: boolean;
}
const frames: ClipFrame[] = [];
let last = 0;
let retainedBytes = 0;
let pendingEncodes = 0;
const cropBytes = (c: Crop) => (c instanceof Blob ? c.size : c.data.byteLength);
export const clipUsage = () => ({ bytes: retainedBytes, frames: frames.length, maxBytes: CLIP_MAX_BYTES, pendingEncodes });

const contains = (a: Rect, b: Rect) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

/**
 * 지금 켜진 기능이 실제로 보는 영역. 자동으로 계산하는 영역(위쪽 버프칸·즐겨찾기·경험치 줄)도 넣는다.
 * 다른 영역 안에 완전히 들어가는 영역은 빼서 같은 픽셀을 두 번 보관하지 않는다 (재생 때는 큰 영역이 그 자리를 그린다).
 */
export function activeClipRegions(p: Profile, w: number, h: number): Record<string, SavedRegion> {
  const list: Array<[string, SavedRegion | undefined]> = [];
  if (p.rune.enabled) list.push(["minimap", p.regions.minimap]);
  if (p.booster.enabled) list.push(["booster", p.regions.booster]);
  if (p.stall.enabled) list.push(["stall", stallRegion(p, w, h)]);
  for (const b of [...p.buffs, ...preciseSkillBuffs(p, w, h)]) {
    if (!b.enabled) continue;
    list.push([b.slot ? `slot:${b.id}` : "buffbar", buffRegion(p, b)]);
  }
  for (const s of p.skills) if (s.enabled) list.push([`skill:${s.id}`, p.regions[`skill:${s.id}`]]);
  const valid = list.filter((e): e is [string, SavedRegion] => regionValidFor(e[1], w, h));
  valid.sort((a, b) => b[1].w * b[1].h - a[1].w * a[1].h);
  const out: Record<string, SavedRegion> = {};
  for (const [key, r] of valid) {
    if (out[key] || Object.values(out).some((o) => contains(o, r))) continue;
    out[key] = r;
  }
  return out;
}

/** 브라우저가 화면 밖에서 PNG 로 줄여 둔다 (그림 한 장 1 MB → 보통 수십 KB). 안 되는 환경이면 그대로 둔다 */
function encodeLater(frame: ClipFrame, key: string, img: ImageData) {
  if (typeof OffscreenCanvas === "undefined" || pendingEncodes >= MAX_PENDING_ENCODES) return;
  pendingEncodes++;
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(img, 0, 0);
  c.convertToBlob({ type: "image/png" })
    .then((blob) => {
      if (frame.dropped || frame.crops[key] !== img) return;
      const diff = blob.size - img.data.byteLength;
      frame.crops[key] = blob;
      frame.bytes += diff;
      retainedBytes += diff;
    })
    .catch(() => {})
    .finally(() => pendingEncodes--);
}

function dropOldest() {
  const f = frames.shift()!;
  f.dropped = true;
  retainedBytes -= f.bytes;
}

export function recordClip(p: Profile, now: number, live: boolean, mean: number | null) {
  if (!live) {
    for (const f of frames) f.dropped = true;
    frames.length = 0; // 공유가 끊기면 이어 붙이지 않는다
    retainedBytes = 0;
    return;
  }
  if (now - last < STEP_MS - 60) return;
  last = now;
  const crops: Record<string, Crop> = {};
  const rects: Record<string, Rect> = {};
  let bytes = 0;
  for (const [key, r] of Object.entries(activeClipRegions(p, screenCapture.width, screenCapture.height))) {
    if (bytes + r.w * r.h * 4 > CLIP_MAX_BYTES) continue;
    const img = screenCapture.crop(r);
    if (!img) continue;
    crops[key] = img;
    rects[key] = { x: r.x, y: r.y, w: r.w, h: r.h };
    bytes += cropBytes(img);
  }
  const frame: ClipFrame = { t: now, mean: mean ?? 0, rects, crops, bytes, dropped: false };
  frames.push(frame);
  retainedBytes += bytes;
  for (const [key, img] of Object.entries(crops)) encodeLater(frame, key, img as ImageData);
  while (frames.length && (now - frames[0].t > CLIP_MS || retainedBytes > CLIP_MAX_BYTES)) dropOldest();
}

/** 진단 파일에 넣는 형식: 영역 위치 + 0.25초마다의 영역 그림(PNG) */
export interface ClipData {
  width: number;
  height: number;
  /** 영역마다 마지막 위치 */
  regions: Record<string, Rect>;
  /** rects: 그 장면에서의 영역 위치 (녹화 도중 영역이 바뀌어도 제자리에 그리게. 예전 파일에는 없음) */
  frames: Array<{ t: number; mean: number; crops: Record<string, string>; rects?: Record<string, Rect> }>;
}

const blobUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export async function clipSnapshot(): Promise<ClipData | null> {
  if (!frames.length) return null;
  const list = frames.slice();
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const png = async (img: Crop) => {
    if (img instanceof Blob) return blobUrl(img);
    c.width = img.width;
    c.height = img.height;
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  };
  const regions: Record<string, Rect> = {};
  const out: ClipData["frames"] = [];
  for (const f of list) {
    Object.assign(regions, f.rects);
    const crops: Record<string, string> = {};
    for (const [k, img] of Object.entries(f.crops)) crops[k] = await png(img);
    out.push({ t: f.t, mean: Math.round(f.mean), crops, rects: f.rects });
    // 오래 걸리는 변환 중에도 화면·타이머가 멈추지 않게 틈틈이 양보한다
    await new Promise((r) => setTimeout(r, 0));
  }
  return { width: screenCapture.width, height: screenCapture.height, regions, frames: out };
}
