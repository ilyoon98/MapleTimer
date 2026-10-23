import { isTextYellow } from "./digits";
import { toGray, type Gray, type Pixels } from "./image";

/** 화면에서 직접 잘라 저장한 아이콘 템플릿 (localStorage 에 저장할 수 있게 숫자 배열) */
export interface StoredTemplate {
  width: number;
  height: number;
  /** RGBA */
  rgba: number[];
  /** 아이콘 테두리만 비교할지 (버프 아이콘 가운데 남은시간 숫자 무시) */
  ringOnly: boolean;
  /**
   * 비교 방식 (없으면 ringOnly 를 따름)
   * - ring: 테두리 띠만
   * - noText: 아이콘 전체에서 저장할 때 찍혀 있던 숫자(밝은 글자) 부분만 빼고
   * - full: 아이콘 전체
   */
  matchMode?: "ring" | "noText" | "full";
}

export function templateMode(t: StoredTemplate): "ring" | "noText" | "full" {
  return t.matchMode ?? (t.ringOnly ? "ring" : "full");
}

export interface PreparedTemplate {
  gray: Gray;
  mask: Uint8Array;
  maskIdx: Int32Array;
  mean: number;
  std: number;
  meanRgb: [number, number, number];
  /** 마스크 픽셀의 (템플릿 값 - 평균): 한 번에 상관계수를 구하려고 미리 계산 */
  tc: Float32Array;
  /** 마스크 픽셀의 템플릿 안 좌표 */
  mx: Int32Array;
  my: Int32Array;
  /** 절반 크기 템플릿 (큰 영역을 빠르게 훑는 1차 탐색용) */
  half?: PreparedTemplate;
  /** 이미지 너비별 마스크 픽셀 오프셋 캐시 */
  offCache?: Map<number, Int32Array>;
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

/** 흰색·노란색 글자 픽셀과 그 주변 1px (글자 테두리 번짐) */
function textPixelsDilated(px: Pixels): Uint8Array {
  const W = px.width,
    H = px.height;
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const r = px.data[p],
        g = px.data[p + 1],
        b = px.data[p + 2];
      const text = (r >= 185 && g >= 185 && b >= 185) || isTextYellow(r, g, b);
      if (!text) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) m[ny * W + nx] = 1;
        }
    }
  return m;
}

/**
 * 아이콘을 여백 있게 잡은 템플릿을 검은 테두리 사각형까지만 남기고 자른다.
 * 실제 게임: 야누스 아이콘을 61×62 로 잡아 바깥 배경이 들어가서, 맵을 옮기니(보라 → 하늘색)
 * 색 차이가 81 로 기준(60)을 넘어 아이콘이 있는데도 '없음'이 됐다.
 * 테두리 = 가로·세로로 절반 넘게 이어진 어두운 줄 중 가장 바깥 것. 못 찾으면 그대로 둔다.
 */
export function trimToIconBorder(t: StoredTemplate): StoredTemplate {
  const W = t.width,
    H = t.height,
    d = t.rgba;
  if (W < 30 || H < 30) return t;
  const dark = (x: number, y: number) => {
    const p = (y * W + x) * 4;
    return 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2] < 60;
  };
  const longestRun = (n: number, at: (i: number) => boolean) => {
    let best = 0,
      cur = 0;
    for (let i = 0; i < n; i++) best = Math.max(best, (cur = at(i) ? cur + 1 : 0));
    return best;
  };
  const rows: number[] = [],
    cols: number[] = [];
  for (let y = 0; y < H; y++) if (longestRun(W, (x) => dark(x, y)) >= W * 0.5) rows.push(y);
  for (let x = 0; x < W; x++) if (longestRun(H, (y) => dark(x, y)) >= H * 0.5) cols.push(x);
  if (!rows.length || !cols.length) return t;
  const top = rows[0],
    bottom = rows[rows.length - 1],
    left = cols[0],
    right = cols[cols.length - 1];
  const w = right - left + 1,
    h = bottom - top + 1;
  if (w < Math.max(24, W * 0.6) || h < Math.max(24, H * 0.6) || (w === W && h === H)) return t;
  const rgba: number[] = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) rgba.push(...d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
  return { ...t, width: w, height: h, rgba };
}

export function prepareTemplate(stored: StoredTemplate): PreparedTemplate {
  const t = trimToIconBorder(stored);
  const px: Pixels = { data: Uint8ClampedArray.from(t.rgba), width: t.width, height: t.height };
  const gray = toGray(px);
  const mode = templateMode(t);
  let mask: Uint8Array;
  if (mode === "ring") mask = ringMask(t.width, t.height);
  else if (mode === "noText") {
    const text = textPixelsDilated(px);
    mask = text.map((v) => (v ? 0 : 1));
    // 글자를 빼고 남은 픽셀이 너무 적으면 테두리 방식으로 되돌린다
    if (mask.reduce((a, b) => a + b, 0) < mask.length * 0.3) mask = ringMask(t.width, t.height);
  } else mask = new Uint8Array(t.width * t.height).fill(1);
  const prepared = prepareGray(gray, mask, px);
  // 큰 템플릿은 절반 크기 버전도 만들어 1차 탐색에 쓴다
  if (t.width >= 16 && t.height >= 16) {
    const hg = halfGray(gray);
    const hm = new Uint8Array(hg.width * hg.height);
    for (let y = 0; y < hg.height; y++)
      for (let x = 0; x < hg.width; x++) {
        const i = 2 * y * t.width + 2 * x;
        // 2x2 중 3칸 이상이 마스크면 절반 크기에서도 마스크
        if (mask[i] + mask[i + 1] + mask[i + t.width] + mask[i + t.width + 1] >= 3) hm[y * hg.width + x] = 1;
      }
    if (hm.reduce((a, b) => a + b, 0) >= 12) prepared.half = prepareGray(hg, hm, null);
  }
  return prepared;
}

function prepareGray(gray: Gray, mask: Uint8Array, px: Pixels | null): PreparedTemplate {
  const idx: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const maskIdx = Int32Array.from(idx);
  const n = maskIdx.length;
  let mean = 0;
  const rgb: [number, number, number] = [0, 0, 0];
  for (const i of maskIdx) {
    mean += gray.data[i];
    if (px) {
      rgb[0] += px.data[i * 4];
      rgb[1] += px.data[i * 4 + 1];
      rgb[2] += px.data[i * 4 + 2];
    }
  }
  mean /= n;
  rgb[0] /= n;
  rgb[1] /= n;
  rgb[2] /= n;
  const tc = new Float32Array(n);
  const mx = new Int32Array(n),
    my = new Int32Array(n);
  let v = 0;
  for (let k = 0; k < n; k++) {
    const i = maskIdx[k];
    tc[k] = gray.data[i] - mean;
    v += tc[k] * tc[k];
    mx[k] = i % gray.width;
    my[k] = (i / gray.width) | 0;
  }
  return { gray, mask, maskIdx, mean, std: Math.sqrt(v), meanRgb: rgb, tc, mx, my };
}

/** 2x2 평균으로 절반 크기 흑백 영상 */
export function halfGray(g: Gray): Gray {
  const w = g.width >> 1,
    h = g.height >> 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * g.width + 2 * x;
      out[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.width] + g.data[i + g.width + 1]) / 4;
    }
  return { data: out, width: w, height: h };
}

/** 이미지 너비에 맞춘 마스크 픽셀 오프셋 (위치마다 나눗셈을 하지 않으려고) */
function offsetsFor(t: PreparedTemplate, imgWidth: number): Int32Array {
  t.offCache ??= new Map();
  let o = t.offCache.get(imgWidth);
  if (!o) {
    o = new Int32Array(t.maskIdx.length);
    for (let k = 0; k < o.length; k++) o[k] = t.my[k] * imgWidth + t.mx[k];
    t.offCache.set(imgWidth, o);
  }
  return o;
}

/**
 * (ox, oy) 위치에서 마스크 영역만으로 정규화 상호상관.
 * Σ(I-Ī)(T-T̄) = Σ I·(T-T̄) 이므로 이미지 평균 없이 한 번에 계산한다.
 */
function nccAt(img: Gray, t: PreparedTemplate, ox: number, oy: number, offs = offsetsFor(t, img.width)): number {
  const base = oy * img.width + ox;
  const d = img.data,
    tc = t.tc;
  const n = offs.length;
  let s1 = 0,
    s2 = 0,
    sc = 0;
  for (let k = 0; k < n; k++) {
    const v = d[base + offs[k]];
    s1 += v;
    s2 += v * v;
    sc += v * tc[k];
  }
  const varI = s2 - (s1 * s1) / n;
  const den = Math.sqrt(varI > 0 ? varI : 0) * t.std;
  return den < 1e-6 ? 0 : sc / den;
}

/** 점수 높은 후보 K 개만 유지 (전체 정렬 대신) */
function pushTop(top: Array<{ x: number; y: number; s: number }>, k: number, x: number, y: number, s: number) {
  if (top.length >= k && s <= top[top.length - 1].s) return;
  let i = top.length;
  while (i > 0 && top[i - 1].s < s) i--;
  top.splice(i, 0, { x, y, s });
  if (top.length > k) top.pop();
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
 * 영역 안에서 템플릿을 찾는다.
 *  1) 큰 템플릿이면 절반 크기 영상에서 모든 위치를 훑어 후보를 고르고 (4배 이상 빠름)
 *     작은 템플릿이면 원본에서 2픽셀 간격으로 훑는다
 *  2) 후보 주변을 원본 해상도에서 1픽셀 단위로 다듬는다
 * 여러 개가 있을 수 있는 경우를 위해 점수 순으로 maxResults 개까지 돌려준다.
 */
export function findTemplate(img: Pixels, imgGray: Gray, t: PreparedTemplate, maxResults = 1): MatchResult[] {
  const tw = t.gray.width,
    th = t.gray.height;
  const maxX = imgGray.width - tw,
    maxY = imgGray.height - th;
  if (maxX < 0 || maxY < 0) return [];

  // 1차: 후보 고르기
  const K = 16 + maxResults * 8;
  const top: Array<{ x: number; y: number; s: number }> = [];
  let scale: number;
  let radius: number;
  const h = t.half;
  const hg = h ? halfGray(imgGray) : null;
  if (h && hg && hg.width >= h.gray.width && hg.height >= h.gray.height) {
    scale = 2;
    radius = 2;
    const offs = offsetsFor(h, hg.width);
    const hx = hg.width - h.gray.width,
      hy = hg.height - h.gray.height;
    for (let y = 0; y <= hy; y++) for (let x = 0; x <= hx; x++) pushTop(top, K, x, y, nccAt(hg, h, x, y, offs));
  } else {
    const step = tw >= 12 && th >= 12 ? 2 : 1;
    scale = 1;
    radius = step - 1;
    const offs = offsetsFor(t, imgGray.width);
    for (let y = 0; y <= maxY; y += step) for (let x = 0; x <= maxX; x += step) pushTop(top, K, x, y, nccAt(imgGray, t, x, y, offs));
  }

  // 2차: 원본 해상도에서 다듬기 + 겹치는 후보 정리
  const offs = offsetsFor(t, imgGray.width);
  const refined: Array<{ x: number; y: number; s: number }> = [];
  for (const c of top) {
    if (c.s < 0.3) break;
    const cx = c.x * scale,
      cy = c.y * scale;
    let best = { x: Math.min(cx, maxX), y: Math.min(cy, maxY), s: -2 };
    for (let y = Math.max(0, cy - radius); y <= Math.min(maxY, cy + radius); y++)
      for (let x = Math.max(0, cx - radius); x <= Math.min(maxX, cx + radius); x++) {
        const s = nccAt(imgGray, t, x, y, offs);
        if (s > best.s) best = { x, y, s };
      }
    refined.push(best);
  }
  refined.sort((a, b) => b.s - a.s);

  const picked: MatchResult[] = [];
  const minSep = Math.min(tw, th) * 0.6;
  for (const c of refined) {
    if (picked.length >= maxResults) break;
    if (c.s < 0.4) break;
    if (picked.some((p) => Math.abs(p.x - c.x) < minSep && Math.abs(p.y - c.y) < minSep)) continue;
    picked.push({ x: c.x, y: c.y, score: c.s, colorDist: colorDistAt(img, t, c.x, c.y) });
  }
  return picked;
}
