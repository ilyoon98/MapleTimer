import { describe, expect, it } from "vitest";
import type { Pixels } from "./image";
import { readSevenSegment } from "./sevenSegment";

// 막대 순서 a b c d e f g
const SEGS: Record<string, string> = {
  "0": "1111110",
  "1": "0110000",
  "2": "1101101",
  "3": "1111001",
  "4": "0110011",
  "5": "1011011",
  "6": "1011111",
  "7": "1110000",
  "8": "1111111",
  "9": "1111011",
};
const CW = 26; // 글자 칸 너비 (실제 화면에서 잰 값)
const CH = 42; // 글자 높이
const T = 6; // 막대 굵기
const TOP = 10;

/** 실제 부스터 숫자처럼 그리기: 막대 위쪽 흰색 → 아래쪽 주황, 막대 사이 검은 틈, 어두운 상자 배경 */
function render(text: string, opts: { quest?: boolean; questTop?: boolean; labels?: boolean; border?: boolean; blurDecimals?: boolean } = {}): Pixels {
  const w = 220,
    h = 64;
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x: number, y: number, c: number[]) => x >= 0 && y >= 0 && x < w && y < h && data.set([...c, 255], (y * w + x) * 4);
  for (let i = 0; i < w * h; i++) data.set([10, 12, 10, 255], i * 4);
  const lit = (y: number) => {
    const t = (y - TOP) / CH;
    return [255, Math.round(255 - 68 * t), Math.round(250 - 248 * t)];
  };
  let blur = false; // 소수점 아래가 빠르게 바뀌며 흐릿하게 찍힌 모습: 막대 7개가 모두 반쯤 켜진다
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!blur || (x + y) % 2) put(x, y, lit(y));
  };
  let x = opts.labels ? 40 : 12;
  if (opts.labels) for (let y = TOP + 4; y < TOP + 16; y++) for (let lx = 6; lx < 34; lx += 3) put(lx, y, [240, 240, 240]); // '남은시간'
  if (opts.border) for (let y = 2; y < h - 2; y++) put(3, y, [225, 225, 225]); // 상자 테두리
  for (const ch of text) {
    if (ch === ".") {
      rect(x + 1, TOP + CH - 6, x + 7, TOP + CH - 1);
      x += 11;
      blur = !!opts.blurDecimals;
      continue;
    }
    const s = blur ? SEGS["8"] : SEGS[ch];
    const mid = TOP + (CH >> 1);
    const L = x,
      R = x + CW - 1;
    if (s[0] === "1") rect(L + 2, TOP, R - 2, TOP + T - 1);
    if (s[6] === "1") rect(L + 2, mid - 3, R - 2, mid + 2);
    if (s[3] === "1") rect(L + 2, TOP + CH - T, R - 2, TOP + CH - 1);
    if (s[5] === "1") rect(L, TOP + T + 1, L + T - 1, mid - 5);
    if (s[1] === "1") rect(R - T + 1, TOP + T + 1, R, mid - 5);
    if (s[4] === "1") rect(L, mid + 4, L + T - 1, TOP + CH - T - 2);
    if (s[2] === "1") rect(R - T + 1, mid + 4, R, TOP + CH - T - 2);
    x += CW + 5;
  }
  if (opts.labels) for (let y = TOP + CH - 12; y < TOP + CH; y++) for (let lx = x; lx < x + 10; lx += 2) put(lx, y, [230, 230, 230]); // '초'
  // 퀘스트 알림 글자: 어두운 노란 글자가 숫자 가운데 줄 위로 지나간다
  if (opts.quest) for (let y = TOP + 17; y < TOP + 23; y++) for (let qx = 0; qx < w; qx++) if (qx % 5 < 2) put(qx, y, [195, 166, 61]);
  // 퀘스트 글자가 윗줄을 지나가면 흰 윗막대는 회색으로 어두워지고 군데군데 글자 획이 덮는다 (실제 화면 78.20)
  if (opts.questTop)
    for (let y = TOP; y < TOP + T; y++)
      for (let qx = 0; qx < w; qx++) {
        const i = (y * w + qx) * 4;
        if (qx % 7 < 2) data.set([195, 166, 61], i);
        else if (data[i] >= 215) data.set([204, 204, 200], i);
      }
  return { data, width: w, height: h };
}

describe("디지털 시계 모양 숫자 (부스터 남은시간)", () => {
  // 소수점 아래는 필요 없어서 초(점 앞)만 읽는다
  const sec = (text: string) => text.split(".")[0];
  it.each(["36.83", "10.47", "59.12", "20.06", "7.94", "48.31"])("%s 에서 초를 읽는다", (text) => {
    const r = readSevenSegment(render(text));
    expect(r?.text).toBe(sec(text));
    expect(r?.seconds).toBeCloseTo(Number(sec(text)) + 0.5);
  });
  it("소수점 아래가 흐릿하게 찍혀 못 읽어도 초는 읽는다", () => {
    for (const text of ["36.83", "78.20", "9.54"]) expect(readSevenSegment(render(text, { blurDecimals: true }))?.text).toBe(sec(text));
  });
  it("퀘스트 알림 글자가 겹쳐도, '남은시간'·'초' 글자와 상자 테두리가 같이 잡혀도 읽는다", () => {
    for (const text of ["36.83", "10.47", "59.12", "20.06"])
      expect(readSevenSegment(render(text, { quest: true, labels: true, border: true }))?.text).toBe(sec(text));
  });
  it("퀘스트 글자가 윗막대를 덮어 회색으로 어두워져도 읽는다 (78.20 의 7·8·2·0)", () => {
    for (const text of ["78.20", "36.83", "10.47", "59.12"]) expect(readSevenSegment(render(text, { questTop: true, labels: true }))?.text).toBe(sec(text));
  });
  it("숫자가 없으면 null", () => {
    expect(readSevenSegment(render("", { labels: true, border: true }))).toBeNull();
  });
});
