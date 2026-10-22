import { describe, expect, it } from "vitest";
import type { Pixels } from "../cv/image";
import { findTemplate, prepareTemplate, storeTemplate, type StoredTemplate } from "../cv/match";
import { toGray } from "../cv/image";
import { ChangeMonitor } from "./changeMonitor";
import { PresenceTracker } from "./presence";
import { QuickslotCastDetector, ReferenceHealer, makeReference } from "./quickslotCast";
import { RuneTracker, colorRangeFromTemplate, detectRuneByColor, DEFAULT_RUNE_COLOR } from "./rune";

function solid(w: number, h: number, rgb: [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { data, width: w, height: h };
}
function paint(img: Pixels, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) img.data.set([...rgb, 255], (yy * img.width + xx) * 4);
  return img;
}
/** 결정적인 무늬가 있는 아이콘 */
function icon(seed: number, w = 24, h = 24): Pixels {
  const img = solid(w, h, [0, 0, 0]);
  let s = seed;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    img.data.set([s & 255, (s >> 8) & 255, (s >> 16) & 255, 255], i * 4);
  }
  return img;
}
function blit(dst: Pixels, src: Pixels, ox: number, oy: number) {
  for (let y = 0; y < src.height; y++)
    dst.data.set(src.data.subarray(y * src.width * 4, (y + 1) * src.width * 4), ((oy + y) * dst.width + ox) * 4);
  return dst;
}

describe("ChangeMonitor (사냥 멈춤)", () => {
  it("첫 변화 전에는 멈춤으로 보지 않고, 변화 후 일정 시간 그대로면 멈춤", () => {
    const m = new ChangeMonitor();
    const a = solid(60, 12, [40, 40, 40]);
    m.observe(a, 0);
    m.observe(a, 10_000);
    expect(m.isStalled(10_000, 7)).toBe(false); // 아직 변화를 못 봄
    const b = paint(solid(60, 12, [40, 40, 40]), 10, 2, 4, 6, [250, 250, 250]); // 숫자 하나 바뀜
    expect(m.observe(b, 11_000).changed).toBe(true);
    m.observe(b, 15_000);
    expect(m.isStalled(15_000, 7)).toBe(false);
    m.observe(b, 18_100);
    expect(m.isStalled(18_100, 7)).toBe(true);
  });
  it("작은 잡음은 변화로 보지 않음", () => {
    const m = new ChangeMonitor();
    m.observe(solid(30, 9, [100, 100, 100]), 0);
    expect(m.observe(solid(30, 9, [104, 104, 104]), 1000).changed).toBe(false);
  });
});

describe("QuickslotCastDetector (스킬 사용 감지)", () => {
  const ready = icon(7, 32, 32);
  const dim = (img: Pixels) => {
    const out = { ...img, data: new Uint8ClampedArray(img.data) };
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] *= 0.45;
      out.data[i + 1] *= 0.45;
      out.data[i + 2] *= 0.45;
    }
    return out;
  };
  it("사용 가능 → 어두워짐이 연속 2번이면 첫 어두운 시각을 사용 시점으로", () => {
    const d = new QuickslotCastDetector();
    d.setReference(makeReference(ready));
    expect(d.observe(ready, 0)).toBeNull();
    expect(d.observe(dim(ready), 250)).toBeNull();
    expect(d.observe(dim(ready), 500)).toBe(250);
    expect(d.observe(dim(ready), 750)).toBeNull(); // 같은 쿨타임 중엔 다시 안 잡음
    d.observe(ready, 60_000);
    d.observe(dim(ready), 60_250);
    expect(d.observe(dim(ready), 60_500)).toBe(60_250);
  });
  it("화면 전환(맵 이동) 뒤에는 '사용 가능'을 다시 볼 때까지 어두운 아이콘을 사용으로 보지 않음", () => {
    const d = new QuickslotCastDetector();
    d.setReference(makeReference(ready));
    d.observe(ready, 0);
    d.interrupt(); // 화면이 어두워짐 → 엔진이 감지를 멈추고 알려줌
    expect(d.observe(dim(ready), 2000)).toBeNull(); // 페이드 인 도중의 어두운 아이콘
    expect(d.observe(dim(ready), 2250)).toBeNull();
    d.observe(ready, 3000); // 다시 사용 가능 확인
    d.observe(dim(ready), 5000);
    expect(d.observe(dim(ready), 5250)).toBe(5000); // 그 뒤 진짜 사용은 감지
  });
  it("켤 때 이미 쿨타임이면 사용 시점을 모르므로 무시", () => {
    const d = new QuickslotCastDetector();
    d.setReference(makeReference(ready));
    d.observe(dim(ready), 0);
    expect(d.observe(dim(ready), 250)).toBeNull();
  });
});

describe("ReferenceHealer (쿨타임 중에 저장한 기준 이미지 자동 교정)", () => {
  const bright = icon(9, 32, 32);
  it("의심스러운 기준일 때만, 숫자 없이 밝은 모습이 3초 유지되면 교체", () => {
    const h = new ReferenceHealer();
    const base = { img: bright, hasDigits: false, lumaRatio: 1.6 };
    expect(h.observe({ ...base, suspicious: true, now: 0 })).toBeNull();
    expect(h.observe({ ...base, suspicious: true, now: 1500 })).toBeNull();
    const healed = h.observe({ ...base, suspicious: true, now: 3100 });
    expect(healed?.width).toBe(32);
  });
  it("기준이 멀쩡하거나(의심 없음), 숫자가 보이거나, 더 밝지 않으면 바꾸지 않는다", () => {
    const h = new ReferenceHealer();
    for (let t = 0; t <= 6000; t += 500) {
      expect(h.observe({ img: bright, hasDigits: false, lumaRatio: 1.6, suspicious: false, now: t })).toBeNull();
      expect(h.observe({ img: bright, hasDigits: true, lumaRatio: 1.6, suspicious: true, now: t })).toBeNull();
      expect(h.observe({ img: bright, hasDigits: false, lumaRatio: 1.02, suspicious: true, now: t })).toBeNull();
    }
  });
});

describe("템플릿 찾기 (버프 아이콘)", () => {
  it("버프칸 안의 아이콘 위치를 찾고, 가운데 숫자가 바뀌어도 테두리로 찾음", () => {
    const tpl = icon(42);
    const bar = solid(200, 60, [20, 20, 30]);
    blit(bar, icon(3), 10, 10);
    blit(bar, icon(42), 120, 18);
    const prepared = prepareTemplate(storeTemplate(tpl, true));
    // 가운데에 '숫자'를 덮어씀
    paint(bar, 126, 24, 12, 12, [255, 255, 255]);
    const m = findTemplate(bar, toGray(bar), prepared, 1)[0];
    expect(m.x).toBe(120);
    expect(m.y).toBe(18);
    expect(m.score).toBeGreaterThan(0.95);
  });
  it("'숫자 부분만 제외' 방식: 저장할 때 숫자가 있던 자리는 빼고 아이콘 전체로 비교", () => {
    const tplImg = paint(icon(42), 8, 8, 12, 12, [255, 255, 255]); // 저장 시점 숫자
    const t: StoredTemplate = { ...storeTemplate(tplImg, true), matchMode: "noText" };
    const prepared = prepareTemplate(t);
    expect(prepared.maskIdx.length).toBeGreaterThan(24 * 24 * 0.5); // 테두리만보다 훨씬 많은 픽셀 사용
    const bar = solid(200, 60, [20, 20, 30]);
    blit(bar, icon(42), 120, 18);
    paint(bar, 128, 26, 12, 12, [255, 255, 255]); // 지금 숫자
    const m = findTemplate(bar, toGray(bar), prepared, 1)[0];
    expect([m.x, m.y]).toEqual([120, 18]);
    expect(m.score).toBeGreaterThan(0.9);
  });
  it("아이콘이 없으면 점수가 낮음", () => {
    const prepared = prepareTemplate(storeTemplate(icon(42), true));
    const bar = blit(solid(200, 60, [20, 20, 30]), icon(5), 50, 10);
    const m = findTemplate(bar, toGray(bar), prepared, 1)[0];
    expect(m?.score ?? 0).toBeLessThan(0.5);
  });
});

describe("PresenceTracker", () => {
  it("연속 2번 보이면 나타남, 연속 2번 안 보이면 사라짐", () => {
    const p = new PresenceTracker();
    expect(p.observe(true, 0)).toBeNull();
    expect(p.observe(true, 500)).toBe("appeared");
    expect(p.observe(false, 1000)).toBeNull();
    expect(p.observe(true, 1500)).toBeNull();
    expect(p.observe(false, 2000)).toBeNull();
    expect(p.observe(false, 2500)).toBe("disappeared");
  });
});

const minimapBg = () => solid(160, 100, [60, 70, 60]);

describe("룬 감지", () => {
  const minimap = minimapBg;
  const withRune = (x: number, y: number) => paint(minimap(), x, y, 7, 7, [200, 60, 230]);

  it("보라색 덩어리를 후보로 찾음", () => {
    const boxes = detectRuneByColor(withRune(40, 30), DEFAULT_RUNE_COLOR);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ x: 40, y: 30, w: 7, h: 7 });
  });
  it("두 번 보여야 확정, 같은 룬으로는 한 번만 알림, 잠깐 가려져도 유지", () => {
    const t = new RuneTracker();
    const see = (now: number, img = withRune(40, 30)) => t.observe(img, detectRuneByColor(img, DEFAULT_RUNE_COLOR), now);
    expect(see(0).newRune).toBe(false);
    const second = see(1000);
    expect(second.newRune).toBe(true);
    expect(second.present).toBe(true);
    expect(see(2000).newRune).toBe(false);
    // 캐릭터가 룬 위에 서서 3초 가려짐
    const hidden = minimap();
    expect(t.observe(hidden, [], 5000).present).toBe(true);
    expect(see(6000).newRune).toBe(false);
    // 오래 안 보이면 사라짐 → 같은 자리에 다시 떠도 묘비 때문에 다시 안 울림
    expect(t.observe(hidden, [], 12000).present).toBe(false);
    see(13000);
    expect(see(14000).newRune).toBe(false);
  });
  it("등록한 룬 아이콘 색으로 색상 범위를 맞춘다 (빨강처럼 0°를 걸치는 색도)", () => {
    const red = paint(solid(9, 9, [30, 30, 30]), 2, 2, 5, 5, [230, 30, 50]);
    const range = colorRangeFromTemplate(red)!;
    expect(range.hueMin).toBeGreaterThan(range.hueMax); // 0° 를 걸침
    expect(detectRuneByColor(paint(minimapBg(), 50, 40, 6, 6, [230, 30, 50]), range)).toHaveLength(1);
    expect(detectRuneByColor(paint(minimapBg(), 50, 40, 6, 6, [200, 60, 230]), range)).toHaveLength(0); // 보라는 아님
  });

  it("맵 이동(암전)하면 상태를 지우고 새 룬은 다시 알림", () => {
    const t = new RuneTracker();
    const see = (now: number, img = withRune(40, 30)) => t.observe(img, detectRuneByColor(img, DEFAULT_RUNE_COLOR), now);
    see(0);
    see(1000);
    const dark = solid(160, 100, [5, 5, 5]);
    expect(t.observe(dark, [], 2000).mapChange).toBe(true);
    see(3000);
    see(4500);
    see(5500);
    expect(see(6500, withRune(100, 60)).newRune || see(7500, withRune(100, 60)).newRune).toBe(true);
  });
});
