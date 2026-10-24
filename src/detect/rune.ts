import { connectedComponents, rgbToHsv, toGray, meanLuma, type Pixels } from "../cv/image";
import { findTemplate, type PreparedTemplate } from "../cv/match";

/**
 * 미니맵에서 룬 아이콘을 찾는다.
 * - 템플릿 모드: 룬이 떠 있을 때 사용자가 잘라 저장한 룬 아이콘으로 찾는다 (권장)
 * - 색상 모드: 템플릿이 없을 때, 지정한 색(기본 보라/자홍) 덩어리를 후보로 본다
 * 오탐을 줄이려고 짧은 시간 안에 두 번 이상 같은 자리에서 보여야 '룬'으로 확정한다.
 */
export interface RuneColorRange {
  hueMin: number;
  hueMax: number;
  satMin: number;
  valMin: number;
  minArea: number;
  maxSide: number;
}

/**
 * 실제 게임(카르시온 마을) 미니맵에서 잰 오탐: 연보라 나무 장식 H 266~274°, S 0.40~0.62, 3x3 px.
 * → 청보라는 빼고(275° 이상), 채도 0.5 이상, 20px 이상 덩어리만 후보로 본다.
 */
export const DEFAULT_RUNE_COLOR: RuneColorRange = {
  hueMin: 275,
  hueMax: 335,
  satMin: 0.5,
  valMin: 0.55,
  minArea: 20,
  maxSide: 24,
};

/** 예전 기본값 (저장된 설정이 이 값 그대로면 새 기본값으로 바꿔 준다) */
export const OLD_DEFAULT_RUNE_COLOR: RuneColorRange = { hueMin: 265, hueMax: 330, satMin: 0.4, valMin: 0.55, minArea: 6, maxSide: 24 };

export interface RuneBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export function detectRuneByColor(img: Pixels, c: RuneColorRange): RuneBox[] {
  const n = img.width * img.height;
  const mask = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const [h, s, v] = rgbToHsv(img.data[p], img.data[p + 1], img.data[p + 2]);
    const inHue = c.hueMin <= c.hueMax ? h >= c.hueMin && h <= c.hueMax : h >= c.hueMin || h <= c.hueMax;
    if (inHue && s >= c.satMin && v >= c.valMin) mask[i] = 1;
  }
  return connectedComponents(mask, img.width, img.height, c.minArea)
    .filter((b) => b.w <= c.maxSide && b.h <= c.maxSide && b.w / b.h >= 0.4 && b.w / b.h <= 2.5)
    .filter((b) => whiteRingFraction(img, mask, b) >= 0.5)
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, score: Math.min(1, b.area / (b.w * b.h)) }));
}

/**
 * 보라색 덩어리 가장자리 중 3픽셀 안에 흰 픽셀이 있는 비율.
 * 미니맵의 룬은 흰 테두리를 두른 보라 마름모라 0.95, 미니맵 그림 속 보라 꽃 장식은 0~0.04
 * (실제 게임 '어둠이 내리는 나무줄기 3' 맵에서 꽃 장식 3개를 룬으로 잘못 알리던 문제).
 */
function whiteRingFraction(img: Pixels, mask: Uint8Array, b: { x: number; y: number; w: number; h: number }): number {
  const W = img.width,
    H = img.height,
    d = img.data;
  const white = (x: number, y: number) => {
    const p = (y * W + x) * 4;
    const mn = Math.min(d[p], d[p + 1], d[p + 2]),
      mx = Math.max(d[p], d[p + 1], d[p + 2]);
    return mn >= 170 && mx - mn <= 50;
  };
  let edge = 0,
    ringed = 0;
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!mask[y * W + x]) continue;
      const onEdge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx,
          ny = y + dy;
        return nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx];
      });
      if (!onEdge) continue;
      edge++;
      search: for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && white(nx, ny)) {
            ringed++;
            break search;
          }
        }
    }
  return edge ? ringed / edge : 0;
}

/**
 * 사용자가 등록한 룬 아이콘에서 색상 범위를 뽑는다 (색상 방식도 실제 룬 색에 맞추기).
 * 채도·명도가 있는 픽셀의 색상(H)을 원형 평균 기준으로 펼쳐 5~95% 범위에 여유를 둔다.
 */
export function colorRangeFromTemplate(img: Pixels): RuneColorRange | null {
  const hs: number[] = [],
    ss: number[] = [],
    vs: number[] = [];
  for (let p = 0; p < img.data.length; p += 4) {
    const [h, s, v] = rgbToHsv(img.data[p], img.data[p + 1], img.data[p + 2]);
    if (s >= 0.35 && v >= 0.45) {
      hs.push(h);
      ss.push(s);
      vs.push(v);
    }
  }
  if (hs.length < 4) return null;
  let sx = 0,
    sy = 0;
  for (const h of hs) {
    sx += Math.cos((h * Math.PI) / 180);
    sy += Math.sin((h * Math.PI) / 180);
  }
  const mean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const d = hs.map((h) => ((h - mean + 540) % 360) - 180).sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  const sSorted = [...ss].sort((a, b) => a - b),
    vSorted = [...vs].sort((a, b) => a - b);
  return {
    hueMin: Math.round((mean + q(d, 0.05) - 10 + 360) % 360),
    hueMax: Math.round((mean + q(d, 0.95) + 10 + 360) % 360),
    satMin: Math.max(0.25, Math.round((q(sSorted, 0.1) - 0.08) * 100) / 100),
    valMin: Math.max(0.3, Math.round((q(vSorted, 0.1) - 0.08) * 100) / 100),
    minArea: Math.max(3, Math.floor(hs.length * 0.3)),
    maxSide: Math.max(img.width, img.height) + 6,
  };
}

export function detectRuneByTemplate(img: Pixels, t: PreparedTemplate, minScore: number): RuneBox[] {
  const g = toGray(img);
  return findTemplate(img, g, t, 3)
    .filter((m) => m.score >= minScore && m.colorDist <= 60)
    .map((m) => ({ x: m.x, y: m.y, w: t.gray.width, h: t.gray.height, score: m.score }));
}

interface Track {
  cx: number;
  cy: number;
  size: number;
  firstSeen: number;
  lastSeen: number;
  hits: number[];
  confirmed: boolean;
  alerted: boolean;
}

interface Tombstone {
  cx: number;
  cy: number;
  until: number;
}

export interface RuneObservation {
  boxes: RuneBox[];
  /** 확정된 룬이 지금 화면에 있음 */
  present: boolean;
  /** 이번 프레임에 새 룬이 확정됨 (알림 시작) */
  newRune: boolean;
  /** 맵 이동(화면 암전) 감지 */
  mapChange: boolean;
  dark: boolean;
}

const CONFIRM_WINDOW_MS = 3000;
const CONFIRM_MIN_GAP_MS = 500;
const BRIDGE_MS = 5000; // 캐릭터가 룬 위에 서 있어서 가려지는 경우 대비
const TOMBSTONE_MS = 120000; // 같은 자리 룬으로 다시 울리지 않기

export class RuneTracker {
  private tracks: Track[] = [];
  private tombstones: Tombstone[] = [];
  private prevLuma: number | null = null;
  private darkSince: number | null = null;
  private darkBaseline = 0;

  reset() {
    this.tracks = [];
    this.tombstones = [];
    this.prevLuma = null;
    this.darkSince = null;
  }

  /** 맵 이동 감지: 화면 밝기가 갑자기 55% 이하로 떨어지면 암전으로 본다 */
  private checkDark(img: Pixels, now: number): { mapChange: boolean; dark: boolean } {
    const luma = meanLuma(toGray(img));
    let mapChange = false;
    if (this.darkSince != null) {
      if (luma >= this.darkBaseline * 0.8 || now - this.darkSince > 2000) this.darkSince = null;
    } else if (this.prevLuma != null && this.prevLuma - luma >= 10 && luma <= this.prevLuma * 0.55) {
      this.darkSince = now;
      this.darkBaseline = this.prevLuma;
      mapChange = true;
      this.tracks = [];
      this.tombstones = [];
    }
    this.prevLuma = luma;
    return { mapChange, dark: this.darkSince != null };
  }

  observe(img: Pixels, boxes: RuneBox[], now: number): RuneObservation {
    const { mapChange, dark } = this.checkDark(img, now);
    if (dark) return { boxes: [], present: false, newRune: false, mapChange, dark };

    this.tombstones = this.tombstones.filter((t) => t.until > now);
    let newRune = false;
    for (const b of boxes) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2,
        size = Math.max(b.w, b.h);
      const radius = Math.max(4, 0.6 * size);
      let tr = this.tracks.find((t) => Math.hypot(t.cx - cx, t.cy - cy) <= Math.max(radius, 0.6 * t.size));
      if (!tr) {
        const inherited = this.tombstones.some((t) => Math.hypot(t.cx - cx, t.cy - cy) <= radius);
        tr = { cx, cy, size, firstSeen: now, lastSeen: now, hits: [], confirmed: false, alerted: inherited };
        if (this.tracks.length < 32) this.tracks.push(tr);
      }
      tr.cx = cx;
      tr.cy = cy;
      tr.size = size;
      tr.lastSeen = now;
      tr.hits = [...tr.hits.filter((h) => now - h <= CONFIRM_WINDOW_MS), now];
      if (!tr.confirmed && tr.hits.length >= 2 && tr.hits[tr.hits.length - 1] - tr.hits[0] >= CONFIRM_MIN_GAP_MS) {
        tr.confirmed = true;
      }
      if (tr.confirmed && !tr.alerted) {
        tr.alerted = true;
        newRune = true;
      }
    }
    // 오래 안 보인 트랙 정리 (알림했던 자리는 묘비로 남김)
    this.tracks = this.tracks.filter((t) => {
      if (now - t.lastSeen <= BRIDGE_MS) return true;
      if (t.alerted) this.tombstones.push({ cx: t.cx, cy: t.cy, until: now + TOMBSTONE_MS });
      return false;
    });
    const present = this.tracks.some((t) => t.confirmed);
    return { boxes, present, newRune, mapChange, dark };
  }
}
