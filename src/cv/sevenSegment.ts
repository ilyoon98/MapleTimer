import { components8, parseClock, type Comp, type DigitRead } from "./digits";
import { type Pixels } from "./image";

/**
 * 부스터 남은시간처럼 디지털 시계(7칸 막대) 모양 숫자 읽기. 학습이 필요 없다.
 * 실제 게임 화면: 막대 위쪽은 흰색(255,255,250), 아래로 갈수록 주황(255,187,2).
 * 막대 사이는 검은 줄로 끊겨 있고, 퀘스트 알림 글자(195,166,61)가 위에 겹쳐 지나가기도 한다.
 *  1) 밝은 막대 픽셀만 고르고
 *  2) 가로로 겹치는 덩어리를 한 글자 칸으로 묶은 뒤
 *  3) 칸마다 막대 7개 자리가 켜졌는지 보고 숫자로 바꾼다.
 */

/** 켜진 막대 픽셀: 밝고(R 215 이상) 파랗지 않은 색. 위쪽 흰색부터 아래쪽 주황까지 */
export function isSegmentLit(r: number, g: number, b: number): boolean {
  return r >= 215 && g >= 140 && b <= g + 10;
}

// 막대 순서: a(위) b(오른쪽 위) c(오른쪽 아래) d(아래) e(왼쪽 아래) f(왼쪽 위) g(가운데)
const PATTERNS: Array<[number, string]> = [
  [0, "1111110"],
  [2, "1101101"],
  [3, "1111001"],
  [4, "0110011"],
  [5, "1011011"],
  [6, "1011111"],
  [6, "0011111"],
  [7, "1110000"],
  [7, "1110010"],
  [8, "1111111"],
  [9, "1111011"],
  [9, "1110011"],
];
// 막대마다 살펴볼 자리 (글자 칸 너비·높이에 대한 비율: x0, x1, y0, y1)
const WINDOWS: Array<[number, number, number, number]> = [
  [0.3, 0.7, 0.0, 0.13], // a
  [0.78, 1.0, 0.18, 0.4], // b
  [0.78, 1.0, 0.6, 0.82], // c
  [0.3, 0.7, 0.87, 1.0], // d
  [0.0, 0.22, 0.6, 0.82], // e
  [0.0, 0.22, 0.18, 0.4], // f
  [0.3, 0.7, 0.44, 0.56], // g
];
const ON = 0.35;
const OFF = 0.12;

interface Column {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  comps: Comp[];
  warm: number;
  count: number;
}

export function readSevenSegment(img: Pixels): DigitRead | null {
  const W = img.width,
    H = img.height,
    d = img.data;
  const mask = new Uint8Array(W * H);
  const warm = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    if (!isSegmentLit(d[p], d[p + 1], d[p + 2])) continue;
    mask[i] = 1;
    if (d[p] - d[p + 2] >= 80) warm[i] = 1;
  }
  const comps = components8(mask, W, H).filter((c) => c.pixels.length >= 4);
  // 가로로 겹치는 덩어리끼리 한 칸으로 (막대가 검은 줄로 끊겨 있어도 한 글자로 모인다)
  comps.sort((a, b) => a.x - b.x);
  const cols: Column[] = [];
  for (const c of comps) {
    const last = cols[cols.length - 1];
    if (last && c.x <= last.x1) {
      last.x1 = Math.max(last.x1, c.x + c.w - 1);
      last.y0 = Math.min(last.y0, c.y);
      last.y1 = Math.max(last.y1, c.y + c.h - 1);
      last.comps.push(c);
    } else cols.push({ x0: c.x, x1: c.x + c.w - 1, y0: c.y, y1: c.y + c.h - 1, comps: [c], warm: 0, count: 0 });
  }
  for (const col of cols)
    for (const c of col.comps) {
      col.count += c.pixels.length;
      for (const i of c.pixels) col.warm += warm[i];
    }
  // 숫자 칸: 아래쪽이 주황이라 따뜻한 색이 섞여 있다 (흰 글자·회색 테두리는 빠진다)
  const tall = cols.filter((c) => c.warm >= c.count * 0.15);
  const digitH = Math.max(0, ...tall.map((c) => c.y1 - c.y0 + 1));
  if (digitH < 10) return null;
  const full = tall.filter((c) => c.y1 - c.y0 + 1 >= digitH * 0.8);
  const top = median(full.map((c) => c.y0));
  const bottom = median(full.map((c) => c.y1));
  const bandH = bottom - top + 1;

  const lit = (x0: number, x1: number, y0: number, y1: number) => {
    let on = 0,
      n = 0;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++, n++) on += mask[y * W + x];
    return n ? on / n : 0;
  };

  type Tok = { x: number; ch: string; cost: number };
  const toks: Tok[] = [];
  for (const c of cols) {
    const w = c.x1 - c.x0 + 1,
      h = c.y1 - c.y0 + 1;
    if (c.y0 < top - bandH * 0.15 || c.y1 > bottom + bandH * 0.15) continue;
    if (h >= bandH * 0.6 && c.warm >= c.count * 0.15) {
      if (w > bandH * 0.85) return null; // 두 글자가 붙었다
      if (w < bandH * 0.32) {
        // '1': 오른쪽 막대 두 개만 켜진 좁은 칸
        const up = lit(c.x0, c.x1, top + Math.round(bandH * 0.2), top + Math.round(bandH * 0.38));
        const down = lit(c.x0, c.x1, top + Math.round(bandH * 0.62), top + Math.round(bandH * 0.8));
        if (up < ON || down < ON) return null;
        toks.push({ x: c.x0, ch: "1", cost: 0 });
        continue;
      }
      if (w < bandH * 0.4) return null;
      const fills = WINDOWS.map(([ax, bx, ay, by]) =>
        lit(c.x0 + Math.round(w * ax), c.x0 + Math.round(w * bx) - 1, top + Math.round(bandH * ay), top + Math.round(bandH * by) - 1),
      );
      // 켜짐(ON 이상)=1, 꺼짐(OFF 이하)=0, 그 사이는 비율로 → 패턴과의 차이가 가장 작은 숫자
      const soft = fills.map((f) => Math.min(1, Math.max(0, (f - OFF) / (ON - OFF))));
      let best = -1,
        bestCost = 99,
        second = 99;
      for (const [digit, pat] of PATTERNS) {
        let cost = 0;
        for (let k = 0; k < 7; k++) cost += Math.abs(soft[k] - Number(pat[k]));
        if (cost < bestCost) {
          if (digit !== best) second = bestCost;
          bestCost = cost;
          best = digit;
        } else if (digit !== best && cost < second) second = cost;
      }
      if (bestCost > 0.5 || second - bestCost < 0.75) return null;
      toks.push({ x: c.x0, ch: String(best), cost: bestCost });
    } else if (w <= bandH * 0.3 && h <= bandH * 0.25 && c.y1 >= bottom - bandH * 0.12) {
      toks.push({ x: c.x0, ch: ".", cost: 0 });
    } else if (w <= bandH * 0.3 && h >= bandH * 0.3 && h < bandH * 0.6 && c.comps.length >= 2) {
      toks.push({ x: c.x0, ch: ":", cost: 0 });
    }
  }
  // 숫자 사이에 있는 점·콜론만 쓴다 (앞뒤의 작은 덩어리는 '남은시간'·'초' 글자 조각)
  const first = toks.findIndex((t) => /\d/.test(t.ch));
  let last = -1;
  toks.forEach((t, i) => /\d/.test(t.ch) && (last = i));
  if (first < 0) return null;
  const used = toks.slice(first, last + 1);
  const text = used.map((t) => t.ch).join("");
  const seconds = parseClock(text);
  if (seconds == null) return null;
  const worst = Math.max(...used.map((t) => t.cost));
  return { text, seconds, confidence: 1 - worst / 7 };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}
