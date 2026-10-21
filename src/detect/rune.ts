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

export const DEFAULT_RUNE_COLOR: RuneColorRange = {
  hueMin: 265,
  hueMax: 330,
  satMin: 0.4,
  valMin: 0.55,
  minArea: 6,
  maxSide: 24,
};

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
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, score: Math.min(1, b.area / (b.w * b.h)) }));
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
