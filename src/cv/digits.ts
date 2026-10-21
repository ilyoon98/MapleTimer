import { type Pixels } from "./image";

/**
 * 아이콘 위에 찍힌 쿨타임/남은 시간 숫자 읽기.
 *  1) 글자색(흰색·노란색) 픽셀만 골라 마스크를 만들고
 *  2) 덩어리(연결 요소)로 글자를 나눈 뒤
 *  3) 글자마다 10×14 격자로 정규화해서 숫자 템플릿과 비교한다.
 * 템플릿은 실제 화면에서 자동 학습한 것(DigitLearner)을 우선 쓰고, 없으면 글꼴로 그린 기본 템플릿을 쓴다.
 */
export const GW = 10;
export const GH = 14;

export interface Glyph {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 정규화된 글자 모양 (GW×GH, 0~1) */
  v: Float32Array;
}

export interface Segmented {
  /** 숫자 후보와 콜론(':'), 소수점('.')을 왼쪽부터 */
  tokens: Array<Glyph | ":" | ".">;
  glyphs: Glyph[];
  hasColon: boolean;
}

export interface TextMaskOptions {
  /** 흰 글자: R,G,B 모두 이 값 이상 */
  whiteMin: number;
}
export const DEFAULT_TEXT_MASK: TextMaskOptions = { whiteMin: 185 };

/** 글자색 픽셀 마스크 (흰색 또는 노란색 숫자) */
export function textMask(img: Pixels, o: TextMaskOptions = DEFAULT_TEXT_MASK): Uint8Array {
  const n = img.width * img.height;
  const m = new Uint8Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p],
      g = d[p + 1],
      b = d[p + 2];
    const white = r >= o.whiteMin && g >= o.whiteMin && b >= o.whiteMin;
    const yellow = r >= 170 && g >= 150 && b <= 130 && r - b >= 70 && g - b >= 55;
    if (white || yellow) m[i] = 1;
  }
  return m;
}

interface Comp {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: number[];
}

function components8(mask: Uint8Array, W: number, H: number): Comp[] {
  const seen = new Uint8Array(mask.length);
  const out: Comp[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const pixels: number[] = [];
    let x0 = W,
      y0 = H,
      x1 = -1,
      y1 = -1;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      pixels.push(i);
      const x = i % W,
        y = (i / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels });
  }
  return out;
}

/** 글자 하나를 가로세로 비율을 유지한 채 GW×GH 격자로 줄인다 ('1' 처럼 좁은 글자는 가운데 정렬) */
function normalize(c: Comp, W: number): Float32Array {
  const boxW = Math.max(c.w, Math.round(c.h * (GW / GH)));
  const offX = c.x - Math.floor((boxW - c.w) / 2);
  const acc = new Float32Array(GW * GH);
  const cnt = new Float32Array(GW * GH);
  // 박스 전체 면적 기준 평균 (글자 픽셀 비율)
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < boxW; x++) {
      const gx = Math.min(GW - 1, Math.floor((x / boxW) * GW));
      const gy = Math.min(GH - 1, Math.floor((y / c.h) * GH));
      cnt[gy * GW + gx]++;
    }
  for (const i of c.pixels) {
    const x = (i % W) - offX,
      y = ((i / W) | 0) - c.y;
    const gx = Math.min(GW - 1, Math.floor((x / boxW) * GW));
    const gy = Math.min(GH - 1, Math.floor((y / c.h) * GH));
    acc[gy * GW + gx]++;
  }
  for (let k = 0; k < acc.length; k++) acc[k] = cnt[k] ? acc[k] / cnt[k] : 0;
  return acc;
}

/**
 * 마스크에서 숫자처럼 생긴 덩어리를 골라 왼쪽부터 정렬.
 * staticMask: 평소(사용 가능 상태)에도 밝은 픽셀. 여기에 절반 넘게 겹치는 덩어리는
 * 쿨타임 숫자가 아니라 퀵슬롯 키 이름("A", "Shift")이나 아이콘 그림이므로 뺀다.
 */
export function segment(img: Pixels, o: TextMaskOptions = DEFAULT_TEXT_MASK, staticMask?: Uint8Array | null): Segmented {
  const W = img.width,
    H = img.height;
  let comps = components8(textMask(img, o), W, H);
  if (staticMask && staticMask.length === W * H) {
    comps = comps.filter((c) => {
      let overlap = 0;
      for (const i of c.pixels) if (staticMask[i]) overlap++;
      return overlap <= c.pixels.length * 0.5;
    });
  }
  // 숫자 높이 후보: 영역 높이의 22%~90%
  const tall = comps.filter((c) => c.h >= Math.max(5, H * 0.22) && c.h <= H * 0.9 && c.w <= c.h * 1.6 + 2 && c.pixels.length >= 6);
  if (!tall.length) return { tokens: [], glyphs: [], hasColon: false };
  // 가장 많이 겹치는 높이대(줄)를 고른다: 키가 가장 큰 덩어리 기준
  const maxH = Math.max(...tall.map((c) => c.h));
  const ref = tall.filter((c) => c.h >= maxH * 0.7);
  const cy = ref.map((c) => c.y + c.h / 2).sort((a, b) => a - b)[Math.floor(ref.length / 2)];
  const line = ref.filter((c) => Math.abs(c.y + c.h / 2 - cy) <= maxH * 0.35);

  // 붙어버린 두 글자 나누기
  const parts: Comp[] = [];
  for (const c of line) {
    const k = c.w > c.h * 1.05 ? Math.round(c.w / (c.h * 0.62)) : 1;
    if (k <= 1) {
      parts.push(c);
      continue;
    }
    const step = c.w / k;
    for (let s = 0; s < k; s++) {
      const xa = c.x + Math.round(s * step),
        xb = c.x + Math.round((s + 1) * step);
      const px = c.pixels.filter((i) => {
        const x = i % W;
        return x >= xa && x < xb;
      });
      if (px.length) parts.push({ x: xa, y: c.y, w: xb - xa, h: c.h, pixels: px });
    }
  }
  parts.sort((a, b) => a.x - b.x);

  // 콜론: 줄 높이 안에서 위·아래로 놓인 작은 점 두 개
  const lineTop = Math.min(...parts.map((c) => c.y));
  const lineBot = Math.max(...parts.map((c) => c.y + c.h));
  const dots = comps.filter(
    (c) => c.h < maxH * 0.4 && c.w < maxH * 0.4 && c.y >= lineTop - 1 && c.y + c.h <= lineBot + 1 && c.pixels.length >= 2,
  );
  const colonXs: number[] = [];
  for (const a of dots)
    for (const b of dots)
      if (a !== b && b.y > a.y + a.h && Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) <= 2 && !colonXs.some((x) => Math.abs(x - a.x) < 3))
        colonXs.push(a.x);

  // 소수점: 줄 아래쪽에 붙은 작은 점 하나 (콜론의 점이 아닌 것)
  const decimalXs = dots
    .filter((d) => d.y + d.h >= lineBot - Math.max(2, maxH * 0.2) && !colonXs.some((x) => Math.abs(x - d.x) < 3))
    .filter((d) => !dots.some((o) => o !== d && Math.abs(o.x - d.x) <= 2 && o.y + o.h < d.y))
    .map((d) => d.x);

  const glyphs: Glyph[] = parts.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, v: normalize(c, W) }));
  const tokens: Array<Glyph | ":" | "."> = [];
  let lastGlyph: Glyph | null = null;
  for (const g of glyphs) {
    if (lastGlyph) {
      const between = (x: number) => x > lastGlyph!.x + lastGlyph!.w - 1 && x < g.x;
      if (colonXs.some(between)) tokens.push(":");
      else if (decimalXs.some(between)) tokens.push(".");
    }
    tokens.push(g);
    lastGlyph = g;
  }
  return { tokens, glyphs, hasColon: tokens.includes(":") };
}

/** 흑백 기준 이미지에서 '늘 밝은' 픽셀 마스크 (1픽셀 넓혀서 테두리 번짐까지 덮음) */
export function staticBrightMask(gray: ArrayLike<number>, W: number, H: number, min = 170): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (gray[y * W + x] < min) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) m[ny * W + nx] = 1;
        }
    }
  return m;
}

/** 두 글자 모양의 상관계수 (-1~1) */
export function glyphSimilarity(a: Float32Array, b: Float32Array): number {
  let ma = 0,
    mb = 0;
  for (let i = 0; i < a.length; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= a.length;
  mb /= b.length;
  let num = 0,
    va = 0,
    vb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma,
      y = b[i] - mb;
    num += x * y;
    va += x * x;
    vb += y * y;
  }
  const den = Math.sqrt(va * vb);
  return den < 1e-9 ? 0 : num / den;
}

export type DigitTemplates = Array<Float32Array[]>; // index = 숫자 0~9

export interface DigitRead {
  /** 읽은 글자 ("1:05", "43") */
  text: string;
  /** 초 단위 값 */
  seconds: number;
  /** 가장 자신 없는 글자의 점수 */
  confidence: number;
}

export function classifyGlyph(v: Float32Array, templates: DigitTemplates): { digit: number; score: number; margin: number } {
  const best = new Array(10).fill(-1);
  for (let d = 0; d < 10; d++) for (const t of templates[d] ?? []) best[d] = Math.max(best[d], glyphSimilarity(v, t));
  let d1 = -1,
    s1 = -2,
    s2 = -2;
  for (let d = 0; d < 10; d++) {
    if (best[d] > s1) {
      s2 = s1;
      s1 = best[d];
      d1 = d;
    } else if (best[d] > s2) s2 = best[d];
  }
  return { digit: d1, score: s1, margin: s1 - s2 };
}

/** 글자들을 읽어 초로 바꾼다. 모양이 애매하면 null */
export function readDigits(seg: Segmented, templates: DigitTemplates, minScore = 0.72, minMargin = 0.04): DigitRead | null {
  if (!seg.glyphs.length || seg.glyphs.length > 6) return null;
  if (templates.some((t) => !t?.length)) return null;
  let text = "";
  let conf = 1;
  for (const tok of seg.tokens) {
    if (tok === ":" || tok === ".") {
      text += tok;
      continue;
    }
    const c = classifyGlyph(tok.v, templates);
    if (c.score < minScore || c.margin < minMargin) return null;
    conf = Math.min(conf, c.score);
    text += String(c.digit);
  }
  const seconds = parseClock(text);
  return seconds == null ? null : { text, seconds, confidence: conf };
}

/** "1:05" → 65, "43" → 43, "1:02:03" → 3723, "45.23" → 45.23 (부스터 타이머) */
export function parseClock(text: string): number | null {
  if (!/^\d+(:\d\d)*(\.\d{1,2})?$/.test(text)) return null;
  const [main, frac] = text.split(".");
  const parts = main.split(":").map(Number);
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  return frac ? s + Number(frac) / 10 ** frac.length : s;
}

/**
 * 사용자가 화면의 숫자를 직접 입력해 가르치기 ("45.23", "1:05").
 * 화면에서 나눈 글자 수와 입력한 숫자 개수가 같아야 한다.
 */
export function labelGlyphs(seg: Segmented, typed: string): Array<{ digit: number; v: Float32Array; h: number }> | null {
  const digits = typed.replace(/[^0-9]/g, "");
  if (!digits.length || digits.length !== seg.glyphs.length) return null;
  return seg.glyphs.map((g, i) => ({ digit: Number(digits[i]), v: g.v, h: g.h }));
}

/** 값 v 가 화면에 몇 글자로 찍히는지 (콜론 형식이면 m:ss) */
export function expectedText(v: number, withColon: boolean): string {
  if (!withColon) return String(v);
  const h = Math.floor(v / 3600),
    m = Math.floor((v % 3600) / 60),
    s = v % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
