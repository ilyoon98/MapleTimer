import { describe, expect, it } from "vitest";
import { CooldownSequenceRecorder } from "../detect/digitLearner";
import { GH, GW, classifyGlyph, labelGlyphs, readDigits, segment, staticBrightMask, type DigitTemplates } from "./digits";
import { gameDigitTemplates } from "./gameDigits";
import type { Pixels } from "./image";

// 테스트용 5×7 픽셀 글꼴 (실제 게임 글꼴과는 무관)
const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
};
const S = 3; // 확대 배율

function render(text: string, w = 64, h = 40): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([40, 60, 90, 255], i * 4); // 아이콘 배경
  const totalW = text.length * 6 * S;
  let ox = Math.floor((w - totalW) / 2);
  const oy = Math.floor((h - 7 * S) / 2);
  for (const ch of text) {
    const rows = FONT[ch];
    rows.forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit !== "1") return;
        for (let dy = 0; dy < S; dy++)
          for (let dx = 0; dx < S; dx++) data.set([255, 255, 255, 255], ((oy + y * S + dy) * w + ox + x * S + dx) * 4);
      }),
    );
    ox += 6 * S;
  }
  return { data, width: w, height: h };
}

function templatesFromFont(): DigitTemplates {
  return Array.from({ length: 10 }, (_, d) => segment(render(String(d))).glyphs.map((g) => g.v));
}

describe("숫자 읽기", () => {
  it("글자를 나누고 콜론을 찾는다", () => {
    const seg = segment(render("1:05", 90));
    expect(seg.glyphs).toHaveLength(3);
    expect(seg.hasColon).toBe(true);
  });
  it("템플릿으로 초 단위 값을 읽는다", () => {
    const t = templatesFromFont();
    expect(readDigits(segment(render("43")), t)?.seconds).toBe(43);
    expect(readDigits(segment(render("1:05", 90)), t)?.seconds).toBe(65);
    expect(readDigits(segment(render("7")), t)?.seconds).toBe(7);
  });
  it("부스터처럼 소수점이 있는 시간(45.23)도 읽는다", () => {
    const t = templatesFromFont();
    const r = readDigits(segment(render("45.23", 110)), t);
    expect(r?.text).toBe("45.23");
    expect(r?.seconds).toBeCloseTo(45.23);
  });
  it("화면 숫자를 직접 입력해 가르칠 수 있다 (글자 수가 맞을 때만)", () => {
    const seg = segment(render("45.23", 110));
    expect(labelGlyphs(seg, "45.23")?.map((x) => x.digit)).toEqual([4, 5, 2, 3]);
    expect(labelGlyphs(seg, "45.2")).toBeNull();
  });
  it("평소에도 있는 밝은 글자(퀵슬롯 키 이름)는 쿨타임 숫자로 보지 않는다", () => {
    // 사용 가능 상태: 왼쪽 위에 키 이름처럼 생긴 밝은 막대
    const withLabel = (img: Pixels) => {
      for (let y = 2; y < 14; y++) for (let x = 2; x < 5; x++) img.data.set([255, 255, 255, 255], (y * img.width + x) * 4);
      return img;
    };
    const ready = withLabel(render(""));
    const gray = Array.from({ length: ready.width * ready.height }, (_, i) => ready.data[i * 4]);
    const mask = staticBrightMask(gray, ready.width, ready.height);
    // 숫자가 없을 때는 키 이름이 가장 큰 글자라서 숫자로 잘못 잡힌다 → 기준 마스크로 뺀다
    expect(segment(ready).glyphs.length).toBe(1);
    expect(segment(ready, undefined, mask).glyphs.length).toBe(0);
    // 쿨타임 숫자는 그대로 잡힌다
    expect(segment(withLabel(render("43")), undefined, mask).glyphs.length).toBe(2);
  });
  it("노란 숫자가 있으면 흰 아이콘 그림(은색·테두리)은 무시한다 (실제 게임 버프 아이콘)", () => {
    // 실제 화면에서 잰 노란 숫자 색 (175,166,0), 아이콘 위쪽엔 흰 그림 덩어리
    const img = render("48", 64, 40);
    for (let i = 0; i < img.data.length; i += 4)
      if (img.data[i] === 255 && img.data[i + 1] === 255) img.data.set([175, 166, 0, 255], i); // 숫자를 노란색으로
    for (let y = 1; y < 12; y++) for (let x = 4; x < 60; x++) if ((x >> 3) % 2 === 0) img.data.set([240, 240, 245, 255], (y * 64 + x) * 4);
    const seg = segment(img);
    expect(seg.glyphs).toHaveLength(2);
    expect(readDigits(seg, templatesFromFont())?.seconds).toBe(48);
  });
  it("점수가 조금 낮아도 2등과 차이가 크면 읽고, 애매하면 버린다", () => {
    const t = templatesFromFont();
    const v = segment(render("7")).glyphs[0].v;
    // 7 모양을 조금 망가뜨린 글자: 1등 점수는 떨어지지만 여전히 7이 확실한 1등
    const noisy = Float32Array.from(v, (x, i) => (i % 7 === 0 ? 1 - x : x));
    const c = classifyGlyph(noisy, t);
    const seg = { tokens: [{ x: 0, y: 0, w: 1, h: 1, v: noisy }], glyphs: [{ x: 0, y: 0, w: 1, h: 1, v: noisy }], hasColon: false };
    const r = readDigits(seg, t);
    if (c.score >= 0.6 && c.margin >= 0.15) expect(r?.text).toBe("7");
    else expect(r).toBeNull();
  });
  it("숫자가 없으면 null", () => {
    expect(readDigits(segment(render("")), templatesFromFont())).toBeNull();
  });
});

/** 기본 숫자 모양(실제 게임에서 모은 평균)을 높이 h 로 키워 노란 글자 + 검은 테두리로 아이콘 위에 그린다 */
function renderGame(text: string, h: number): Pixels {
  const w = 48,
    H = 40;
  const data = new Uint8ClampedArray(w * H * 4);
  for (let i = 0; i < w * H; i++) data.set([40 + (i % 7) * 6, 60, 90 + (i % 5) * 8, 255], i * 4); // 무늬 있는 아이콘 배경
  const T = gameDigitTemplates();
  const bw = Math.round((h * GW) / GH);
  const lit: Array<[number, number]> = [];
  const widths = [...text].map((ch) => (ch === ":" ? 2 : bw));
  let x = Math.floor((w - widths.reduce((a, b) => a + b + 1, -1)) / 2);
  const y0 = Math.floor((H - h) / 2);
  [...text].forEach((ch, i) => {
    if (ch === ":") for (const dy of [Math.round(h * 0.25), Math.round(h * 0.65)]) lit.push([x, y0 + dy], [x + 1, y0 + dy], [x, y0 + dy + 1], [x + 1, y0 + dy + 1]);
    else
      for (let y = 0; y < h; y++)
        for (let xx = 0; xx < bw; xx++) if (T[Number(ch)][0][Math.floor((y / h) * GH) * GW + Math.floor((xx / bw) * GW)] >= 0.25) lit.push([x + xx, y0 + y]);
    x += widths[i] + 1;
  });
  for (const [px, py] of lit) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) data.set([0, 0, 0, 255], ((py + dy) * w + px + dx) * 4);
  for (const [px, py] of lit) data.set([216, 211, 62, 255], (py * w + px) * 4);
  return { data, width: w, height: H };
}

describe("기본 숫자 모양으로 학습 없이 읽기", () => {
  // 10px 이하는 10×14 평균 모양을 줄여 그리는 과정에서 모양이 뭉개져 이 테스트 방식으로는 맞지 않는다 (실제 화면은 그 크기로 그려진 숫자)
  it.each([12, 14])("높이 %ipx 의 게임 모양 숫자를 읽는다", (h) => {
    for (const text of ["15", "9", "58", "30", "1:07", "2:46"]) expect(readDigits(segment(renderGame(text, h)), gameDigitTemplates())?.text).toBe(text);
  });
});

describe("쿨타임 한 바퀴로 숫자 학습", () => {
  it("56 → 1 로 줄어드는 숫자를 끝에서부터 세어 0~9 를 모두 배운다", () => {
    const rec = new CooldownSequenceRecorder();
    let t = 0;
    let result = null;
    for (let v = 56; v >= 1; v--)
      for (let k = 0; k < 4; k++, t += 250) result = rec.feed(segment(render(String(v))), t) ?? result;
    for (let k = 0; k < 8; k++, t += 250) result = rec.feed(segment(render("")), t) ?? result;
    expect(result?.ok).toBe(true);
    const learned: DigitTemplates = Array.from({ length: 10 }, () => []);
    for (const s of result!.samples) learned[s.digit].push(s.v);
    expect(learned.every((x) => x.length > 0)).toBe(true);
    // 배운 템플릿으로 다시 읽기
    expect(readDigits(segment(render("38")), learned)?.seconds).toBe(38);
    expect(readDigits(segment(render("9")), learned)?.seconds).toBe(9);
  });
  const runSeq = (from: number, to: number) => {
    const rec = new CooldownSequenceRecorder();
    let t = 0;
    let result = null;
    for (let v = from; v >= to; v--) for (let k = 0; k < 4; k++, t += 250) result = rec.feed(segment(render(String(v))), t) ?? result;
    for (let k = 0; k < 8; k++, t += 250) result = rec.feed(segment(render("")), t) ?? result;
    return result;
  };
  const learnedFrom = (r: ReturnType<typeof runSeq>) => {
    const learned: DigitTemplates = Array.from({ length: 10 }, () => []);
    for (const s of r!.samples) learned[s.digit].push(s.v);
    return learned;
  };

  it("실제 게임처럼 5초 미만은 안 보여줘도(60→5) 10→9 기준점으로 맞게 학습한다", () => {
    const r = runSeq(60, 5);
    expect(r?.ok).toBe(true);
    expect(r?.reason).toContain("마지막으로 보인 값 5");
    const learned = learnedFrom(r);
    expect(readDigits(segment(render("38")), learned)?.seconds).toBe(38);
    expect(readDigits(segment(render("7")), learned)?.seconds).toBe(7);
  });
  it("마지막 값이 0 이어도 기준점으로 맞게 학습하고, 0 은 건너뛴다", () => {
    const r = runSeq(30, 0);
    expect(r?.ok).toBe(true);
    expect(readDigits(segment(render("21")), learnedFrom(r))?.seconds).toBe(21);
  });
  it("한 자리까지 내려가지 않으면(30→12) 기준점이 없어 학습하지 않는다", () => {
    const r = runSeq(30, 12);
    expect(r?.ok).toBe(false);
    expect(r?.reason).toContain("기준점");
  });

  /** 맵 이동처럼 감지를 쉬는 동안(from 아래로 skip 초)은 숫자를 못 본 채로 끝까지 */
  const runWithGap = (from: number, gapAt: number, skip: number, to: number) => {
    const rec = new CooldownSequenceRecorder();
    let t = 0;
    let result = null;
    for (let v = from; v >= to; v--) {
      if (v < gapAt && v >= gapAt - skip) {
        t += 1000; // 이 1초 동안은 감지를 쉬어서 feed 가 없다
        continue;
      }
      for (let k = 0; k < 4; k++, t += 250) result = rec.feed(segment(render(String(v))), t) ?? result;
    }
    for (let k = 0; k < 8; k++, t += 250) result = rec.feed(segment(render("")), t) ?? result;
    return result;
  };
  it("중간에 값을 못 본 곳(25..21, 3초 쉼, 17..5)이 있으면 기준점과 이어진 구간만 배운다", () => {
    const r = runWithGap(25, 21, 3, 5);
    expect(r?.ok).toBe(true);
    // 21 의 '2' 를 '1' 로 배우는 식으로 어긋난 이름이 하나도 없어야 한다
    const truth = segment(render("21")).glyphs.map((g) => g.v);
    const wrong = r!.samples.filter((s) => truth.some((v, k) => s.v.every((x, i) => x === v[i]) && s.digit !== [2, 1][k]));
    expect(wrong).toHaveLength(0);
    expect(r?.reason).toContain("13개 값"); // 17..5
  });
  it("10→9 바뀌는 순간을 건너뛰었으면(11 → 8) 기준점으로 쓰지 않는다", () => {
    const r = runWithGap(30, 10, 2, 1);
    expect(r?.ok).toBe(false);
  });
});
