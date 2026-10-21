import { toGray, type Gray, type Pixels } from "./image";

/** 화면에서 직접 잘라 저장한 아이콘 템플릿 (localStorage 에 저장할 수 있게 숫자 배열) */
export interface StoredTemplate {
  width: number;
  height: number;
  /** RGBA */
  rgba: number[];
  /** 아이콘 테두리만 비교할지 (버프 아이콘 가운데 남은시간 숫자 무시) */
  ringOnly: boolean;
}

export interface PreparedTemplate {
  gray: Gray;
  mask: Uint8Array;
  maskIdx: Int32Array;
  mean: number;
  std: number;
  meanRgb: [number, number, number];
}

export function storeTemplate(img: Pixels, ringOnly: boolean): StoredTemplate {
  return { width: img.width, height: img.height, rgba: Array.from(img.data), ringOnly };
}

/** 테두리 마스크: 위 12%, 아래 15%, 좌우 4% 띠 */
export function ringMask(w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const top = Math.max(2, Math.round(h * 0.12));
  const bottom = Math.max(2, Math.round(h * 0.15));
  const side = Math.max(1, Math.round(w * 0.04));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (y < top || y >= h - bottom || x < side || x >= w - side) m[y * w + x] = 1;
  return m;
}

export function prepareTemplate(t: StoredTemplate): PreparedTemplate {
  const px: Pixels = { data: Uint8ClampedArray.from(t.rgba), width: t.width, height: t.height };
  const gray = toGray(px);
  const mask = t.ringOnly ? ringMask(t.width, t.height) : new Uint8Array(t.width * t.height).fill(1);
  const idx: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const maskIdx = Int32Array.from(idx);
  let mean = 0;
  const rgb: [number, number, number] = [0, 0, 0];
  for (const i of maskIdx) {
    mean += gray.data[i];
    rgb[0] += px.data[i * 4];
    rgb[1] += px.data[i * 4 + 1];
    rgb[2] += px.data[i * 4 + 2];
  }
  mean /= maskIdx.length;
  rgb[0] /= maskIdx.length;
  rgb[1] /= maskIdx.length;
  rgb[2] /= maskIdx.length;
  let v = 0;
  for (const i of maskIdx) v += (gray.data[i] - mean) ** 2;
  return { gray, mask, maskIdx, mean, std: Math.sqrt(v), meanRgb: rgb };
}

/** (ox, oy) 위치에서 마스크 영역만으로 정규화 상호상관 */
function nccAt(img: Gray, t: PreparedTemplate, ox: number, oy: number): number {
  const tw = t.gray.width;
  let mean = 0;
  for (let k = 0; k < t.maskIdx.length; k++) {
    const i = t.maskIdx[k];
    mean += img.data[(oy + ((i / tw) | 0)) * img.width + ox + (i % tw)];
  }
  mean /= t.maskIdx.length;
  let num = 0,
    v = 0;
  for (let k = 0; k < t.maskIdx.length; k++) {
    const i = t.maskIdx[k];
    const a = img.data[(oy + ((i / tw) | 0)) * img.width + ox + (i % tw)] - mean;
    num += a * (t.gray.data[i] - t.mean);
    v += a * a;
  }
  const den = Math.sqrt(v) * t.std;
  return den < 1e-6 ? 0 : num / den;
}

function colorDistAt(img: Pixels, t: PreparedTemplate, ox: number, oy: number): number {
  const tw = t.gray.width;
  let r = 0,
    g = 0,
    b = 0;
  for (let k = 0; k < t.maskIdx.length; k++) {
    const i = t.maskIdx[k];
    const p = ((oy + ((i / tw) | 0)) * img.width + ox + (i % tw)) * 4;
    r += img.data[p];
    g += img.data[p + 1];
    b += img.data[p + 2];
  }
  const n = t.maskIdx.length;
  return Math.hypot(r / n - t.meanRgb[0], g / n - t.meanRgb[1], b / n - t.meanRgb[2]);
}

export interface MatchResult {
  x: number;
  y: number;
  score: number;
  colorDist: number;
}

/**
 * 영역 안에서 템플릿을 찾는다. 2픽셀 간격으로 훑어 상위 후보 몇 개를 고른 뒤 주변을 1픽셀 단위로 다듬는다.
 * 여러 개가 있을 수 있는 경우를 위해 점수 순으로 maxResults 개까지 돌려준다.
 */
export function findTemplate(img: Pixels, imgGray: Gray, t: PreparedTemplate, maxResults = 1): MatchResult[] {
  const tw = t.gray.width,
    th = t.gray.height;
  const maxX = imgGray.width - tw,
    maxY = imgGray.height - th;
  if (maxX < 0 || maxY < 0) return [];
  const step = tw >= 12 && th >= 12 ? 2 : 1;
  const coarse: Array<{ x: number; y: number; s: number }> = [];
  for (let y = 0; y <= maxY; y += step)
    for (let x = 0; x <= maxX; x += step) coarse.push({ x, y, s: nccAt(imgGray, t, x, y) });
  coarse.sort((a, b) => b.s - a.s);

  const picked: MatchResult[] = [];
  const minSep = Math.min(tw, th) * 0.6;
  for (const c of coarse) {
    if (picked.length >= maxResults) break;
    if (c.s < 0.4) break;
    if (picked.some((p) => Math.abs(p.x - c.x) < minSep && Math.abs(p.y - c.y) < minSep)) continue;
    let best = { x: c.x, y: c.y, s: c.s };
    for (let y = Math.max(0, c.y - step + 1); y <= Math.min(maxY, c.y + step - 1); y++)
      for (let x = Math.max(0, c.x - step + 1); x <= Math.min(maxX, c.x + step - 1); x++) {
        const s = nccAt(imgGray, t, x, y);
        if (s > best.s) best = { x, y, s };
      }
    picked.push({ x: best.x, y: best.y, score: best.s, colorDist: colorDistAt(img, t, best.x, best.y) });
  }
  return picked;
}
