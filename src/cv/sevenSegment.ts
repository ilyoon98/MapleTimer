import { components8, type Comp, type DigitRead } from "./digits";
import { type Pixels } from "./image";

/**
 * 부스터 남은시간처럼 디지털 시계(7칸 막대) 모양 숫자 읽기. 학습이 필요 없다.
 * 실제 게임 화면: 막대 위쪽은 흰색(255,255,250), 아래로 갈수록 주황(255,187,2).
 * 막대 사이는 검은 줄로 끊겨 있고, 퀘스트 알림 글자(195,166,61)가 위에 겹쳐 지나가기도 한다.
 *  1) 밝은 막대 픽셀만 고르고
 *  2) 가로로 겹치는 덩어리를 한 글자 칸으로 묶은 뒤
 *  3) 칸마다 막대 7개 자리가 켜졌는지 보고 숫자로 바꾼다.
 * 소수점 아래는 알림에 필요 없고 너무 빨리 바뀌어 흐릿하게 찍히므로, 자리만 확인하고 초(점 앞)만 읽는다.
 */

/** 켜진 막대 픽셀: 밝고(R 215 이상) 파랗지 않은 색. 위쪽 흰색부터 아래쪽 주황까지 */
export function isSegmentLit(r: number, g: number, b: number): boolean {
  return r >= 215 && g >= 140 && b <= g + 10;
}

/**
 * 어두워진 흰 막대: 퀘스트 알림 글자가 지나가는 줄에서는 흰 윗막대가 회색(204,204,200)으로 보인다.
 * 글자를 나눌 때는 안 쓰고(흰 글자·테두리가 붙으므로), 막대가 켜졌는지 셀 때만 켜진 것으로 본다.
 */
function isDimmedWhite(r: number, g: number, b: number): boolean {
  return r >= 165 && g >= 160 && b >= 140 && Math.max(r, g, b) - Math.min(r, g, b) <= 25;
}

/**
 * 숫자 위로 겹쳐 지나가는 퀘스트 알림 글자(어두운 노랑, 예: 195,166,61).
 * 이 픽셀은 막대가 켜졌는지 알 수 없으므로 켜짐 비율을 셀 때 뺀다.
 */
export function isOverlayText(r: number, g: number, b: number): boolean {
  return r >= 120 && r < 215 && g >= 90 && b <= 100 && r - b >= 70;
}

// 막대 순서: a(위) b(오른쪽 위) c(오른쪽 아래) d(아래) e(왼쪽 아래) f(왼쪽 위) g(가운데)
const PATTERNS: Array<[number, string]> = [
  [0, "1111110"],
  [2, "1101101"],
  [3, "1111001"],
  [4, "0110011"],
  [5, "1011011"],
  [6, "1011111"],
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

export function readSevenSegment(img: Pixels, debug?: (msg: string) => void): DigitRead | null {
  const W = img.width,
    H = img.height,
    d = img.data;
  const mask = new Uint8Array(W * H);
  const warm = new Uint8Array(W * H);
  const hidden = new Uint8Array(W * H);
  const dim = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    if (isOverlayText(d[p], d[p + 1], d[p + 2])) hidden[i] = 1;
    if (isDimmedWhite(d[p], d[p + 1], d[p + 2])) dim[i] = 1;
    if (!isSegmentLit(d[p], d[p + 1], d[p + 2])) continue;
    mask[i] = 1;
    if (d[p] - d[p + 2] >= 80) warm[i] = 1;
  }
  // 숫자 막대는 4픽셀 넘게 두껍다. 1~2픽셀 가는 선(상자 뒤로 비치는 'MULTIKILL' 그림 등)과
  // 영역 가장자리에 걸린 덩어리는 숫자가 아닌데, 숫자 칸에 붙으면 칸 너비가 틀어진다
  const comps = components8(mask, W, H).filter(
    (c) => c.pixels.length >= 4 && Math.min(c.w, c.h) >= 3 && c.x > 0 && c.y > 0 && c.x + c.w < W && c.y + c.h < H,
  );
  // 가로로 겹치거나 2픽셀 안으로 붙은 덩어리끼리 한 칸으로 (막대가 검은 줄로 끊겨 있어도 한 글자로 모인다).
  // '4' 는 가운데 막대 끝과 오른쪽 막대 사이가 1~2픽셀 떨어져 있어 겹침만 보면 오른쪽만 남아 '1' 이 된다 (54 → 51)
  comps.sort((a, b) => a.x - b.x);
  const cols: Column[] = [];
  for (const c of comps) {
    const last = cols[cols.length - 1];
    if (last && c.x <= last.x1 + 3) {
      last.x1 = Math.max(last.x1, c.x + c.w - 1);
      last.y0 = Math.min(last.y0, c.y);
      last.y1 = Math.max(last.y1, c.y + c.h - 1);
      last.comps.push(c);
    } else cols.push({ x0: c.x, x1: c.x + c.w - 1, y0: c.y, y1: c.y + c.h - 1, comps: [c], warm: 0, count: 0 });
  }
  for (const col of cols) {
    for (const c of col.comps) {
      col.count += c.pixels.length;
      for (const i of c.pixels) col.warm += warm[i];
    }
    // 어두워진 흰 윗막대·아랫막대도 글자 높이에 넣는다 (막대 사이 검은 틈 2줄까지 건너뛰고, 회색 막대로 찬 줄까지 늘린다)
    const rowFill = (y: number) => {
      let on = 0;
      for (let x = col.x0; x <= col.x1; x++) on += mask[y * W + x] | dim[y * W + x];
      return on / (col.x1 - col.x0 + 1);
    };
    const maxGrow = Math.round((col.y1 - col.y0 + 1) * 0.25);
    let y0 = col.y0,
      y1 = col.y1;
    for (let y = col.y0 - 1; y >= Math.max(0, col.y0 - maxGrow) && y0 - y <= 3; y--) if (rowFill(y) >= 0.3) y0 = y;
    for (let y = col.y1 + 1; y <= Math.min(H - 1, col.y1 + maxGrow) && y - y1 <= 3; y++) if (rowFill(y) >= 0.3) y1 = y;
    col.y0 = y0;
    col.y1 = y1;
  }
  // 숫자 칸: 아래쪽이 주황이라 따뜻한 색이 섞여 있다 (흰 글자·회색 테두리는 빠진다)
  const tall = cols.filter((c) => c.warm >= c.count * 0.15);
  const digitH = Math.max(0, ...tall.map((c) => c.y1 - c.y0 + 1));
  if (digitH < 10) return null;
  const full = tall.filter((c) => c.y1 - c.y0 + 1 >= digitH * 0.8);
  const top = median(full.map((c) => c.y0));
  const bottom = median(full.map((c) => c.y1));
  const bandH = bottom - top + 1;

  // 켜진 비율. 퀘스트 글자에 대부분 가려져 알 수 없으면 NaN
  const lit = (x0: number, x1: number, y0: number, y1: number) => {
    let on = 0,
      n = 0,
      all = 0;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++, all++) {
        if (hidden[y * W + x]) continue;
        on += mask[y * W + x] | dim[y * W + x];
        n++;
      }
    return n >= all * 0.3 && n ? on / n : NaN;
  };
  // 글자 칸 너비: 윗막대가 가려져 짧게 잡힌 칸('7')도 오른쪽 끝에 맞춰 같은 너비로 본다
  const digitCols = cols.filter((c) => c.y1 - c.y0 + 1 >= bandH * 0.6 && c.x1 - c.x0 + 1 >= bandH * 0.4);
  const cellW = digitCols.length ? median(digitCols.map((c) => c.x1 - c.x0 + 1)) : 0;

  type Tok = { x: number; ch: string; cost: number };
  const toks: Tok[] = [];
  for (const c of cols) {
    const w = c.x1 - c.x0 + 1,
      h = c.y1 - c.y0 + 1;
    if (c.y0 < top - bandH * 0.15 || c.y1 > bottom + bandH * 0.15) continue;
    if (h >= bandH * 0.6 && c.warm >= c.count * 0.15) {
      // 못 읽은 숫자 칸은 '?' 로 남긴다 (소수점 아래라면 괜찮다)
      const unknown = () => toks.push({ x: c.x0, ch: "?", cost: 0 });
      if (w > bandH * 0.85) {
        unknown(); // 두 글자가 붙었다
        continue;
      }
      if (w < bandH * 0.32) {
        // '1': 오른쪽 막대 두 개만 켜진 좁은 칸. 왼쪽 윗막대 자리가 (어두워졌어도) 켜져 있으면 '7', 가려서 모르면 포기
        const up = lit(c.x0, c.x1, top + Math.round(bandH * 0.2), top + Math.round(bandH * 0.38));
        const down = lit(c.x0, c.x1, top + Math.round(bandH * 0.62), top + Math.round(bandH * 0.8));
        const aLeft = lit(c.x1 - Math.round(cellW || bandH * 0.55) + 1, c.x0 - 1, top, top + Math.round(bandH * 0.13) - 1);
        debug?.(`x${c.x0} '1'? up ${up.toFixed(2)} down ${down.toFixed(2)} a ${aLeft.toFixed(2)}`);
        if (!(up >= ON && down >= ON)) unknown();
        else if (aLeft >= ON) toks.push({ x: c.x0, ch: "7", cost: 0 });
        else if (aLeft <= OFF) toks.push({ x: c.x0, ch: "1", cost: 0 });
        else unknown();
        continue;
      }
      if (w < bandH * 0.4) {
        unknown();
        continue;
      }
      const x0 = cellW && w < cellW - 2 ? c.x1 - cellW + 1 : c.x0;
      const bw = c.x1 - x0 + 1;
      const fills = WINDOWS.map(([ax, bx, ay, by]) =>
        lit(x0 + Math.round(bw * ax), x0 + Math.round(bw * bx) - 1, top + Math.round(bandH * ay), top + Math.round(bandH * by) - 1),
      );
      // 켜짐(ON 이상)=1, 꺼짐(OFF 이하)=0, 그 사이는 비율로, 가려서 모르면 0.5 → 패턴과의 차이가 가장 작은 숫자
      const soft = fills.map((f) => (Number.isNaN(f) ? 0.5 : Math.min(1, Math.max(0, (f - OFF) / (ON - OFF)))));
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
      debug?.(`x${c.x0} fills ${fills.map((f) => f.toFixed(2)).join(" ")} → ${best} cost ${bestCost.toFixed(2)} 2nd ${second.toFixed(2)}`);
      if (bestCost > 1 || second - bestCost < 1) unknown();
      else toks.push({ x: c.x0, ch: String(best), cost: bestCost });
    } else if (w <= bandH * 0.3 && h <= bandH * 0.25 && c.y1 >= bottom - bandH * 0.12) {
      toks.push({ x: c.x0, ch: ".", cost: 0 });
    }
  }
  // 숫자 사이에 있는 점만 쓴다 (앞뒤의 작은 덩어리는 '남은시간'·'초' 글자 조각)
  const first = toks.findIndex((t) => t.ch !== ".");
  let last = -1;
  toks.forEach((t, i) => t.ch !== "." && (last = i));
  if (first < 0) return null;
  const used = toks.slice(first, last + 1);
  // 부스터는 1분이 넘어도 언제나 '초.소수 두 자리'(78.20, 9.54). 이 모양이 아니면 데미지 숫자 같은 잡음.
  // 소수 두 자리는 자리만 있으면 되고(못 읽어도 '?'), 초는 모두 읽혀야 한다
  const m = /^(\d{1,3})\.[\d?]{2}$/.exec(used.map((t) => t.ch).join(""));
  // 부스터는 100초 동안 지속된다
  if (!m || Number(m[1]) > 100) return null;
  const worst = Math.max(...used.slice(0, m[1].length).map((t) => t.cost));
  // 화면이 36.xx 면 남은 시간은 36~37초 사이 → 가운데 36.5초로 본다
  return { text: m[1], seconds: Number(m[1]) + 0.5, confidence: 1 - worst / 7 };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}
