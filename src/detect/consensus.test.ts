import { describe, expect, it } from "vitest";
import { EstimateConsensus, applyBoosterReading, applyExpiry, keepEndAfterVanish, stepReadTimer, type ReadTimer } from "./consensus";

describe("EstimateConsensus", () => {
  it("3번 연달아 비슷하면 평균을 믿는다", () => {
    const c = new EstimateConsensus(1500);
    expect(c.add(10_000)).toBeNull();
    expect(c.add(10_400)).toBeNull();
    expect(c.add(10_200)).toBeCloseTo(10_200);
  });
  it("한 번 튄 값은 걸러지고, 그 뒤로 맞는 값이 쌓여야 믿는다", () => {
    const c = new EstimateConsensus(1500);
    c.add(10_000);
    c.add(10_100);
    expect(c.add(40_000)).toBeNull(); // 잘못 읽음 → 앞의 값들과 안 맞아 혼자 남음
    expect(c.add(10_050)).toBeNull(); // 튄 값은 버려지고 다시 쌓기 시작
    expect(c.add(10_000)).toBeNull();
    expect(c.add(10_100)).not.toBeNull();
  });
});

describe("applyExpiry (버프 남은 시간 반영)", () => {
  it("처음 / 그대로 / 연장 / 정정", () => {
    expect(applyExpiry(null, 100_000, 2500)).toEqual({ endsAt: 100_000, change: "new" });
    expect(applyExpiry(100_000, 101_000, 2500)).toEqual({ endsAt: 100_000, change: null });
    expect(applyExpiry(100_000, 130_000, 2500)).toEqual({ endsAt: 130_000, change: "extended" });
    expect(applyExpiry(100_000, 90_000, 2500)).toEqual({ endsAt: 90_000, change: "corrected" });
  });
});

/** 0.25초마다 tick 을 돌려 알림이 울린 시각(초)과 마지막 상태를 돌려준다 */
function runReadTimer(start: ReadTimer, from: number, to: number, leadSec: number) {
  let cur = start;
  const fired: number[] = [];
  for (let now = from; now <= to; now += 250) {
    const s = stepReadTimer(cur, now, leadSec);
    cur = s.next;
    if (s.fire) fired.push(now / 1000);
  }
  return { fired, cur };
}

describe("부스터 종료 시각 (숫자로 맞추는 타이머)", () => {
  it("처음 읽은 값은 새 주기, 1.5초 안이면 평균으로 다듬는다", () => {
    const a = applyBoosterReading({ endsAt: null, alerted: false }, 60_000, 0, 10);
    expect(a).toEqual({ next: { endsAt: 60_000, alerted: false }, newCycle: true });
    const b = applyBoosterReading(a.next, 61_000, 1000, 10);
    expect(b).toEqual({ next: { endsAt: 60_500, alerted: false }, newCycle: false });
  });
  it("알림 시점이 이미 지난 뒤에 처음 본 주기는 조용히 넘긴다", () => {
    expect(applyBoosterReading({ endsAt: null, alerted: false }, 5_000, 0, 10).next.alerted).toBe(true);
  });
  it("5초 넘게 늦어지면(다시 사용) 새 주기로 다시 알린다", () => {
    const r = applyBoosterReading({ endsAt: 20_000, alerted: true }, 80_000, 15_000, 10);
    expect(r).toEqual({ next: { endsAt: 80_000, alerted: false }, newCycle: true });
  });
  it("잘못 읽은 값으로 10초 늦게 잡혔으면 바른 값으로 앞당기고, 알림 시점이 지났으니 바로 울린다", () => {
    // 실제 종료 50초인데 처음 3번을 60초로 잘못 읽음 → 이후 바른 값(50초)이 합의됨
    const fixed = applyBoosterReading({ endsAt: 60_000, alerted: false }, 50_000, 42_000, 10);
    expect(fixed).toEqual({ next: { endsAt: 50_000, alerted: false }, newCycle: false });
    expect(stepReadTimer(fixed.next, 42_000, 10).fire).toBe(true);
  });
  it("조금(1.5~5초) 늦게 잡힌 것도 새 주기로 보지 않고 바로잡는다", () => {
    expect(applyBoosterReading({ endsAt: 50_000, alerted: true }, 53_000, 10_000, 10)).toEqual({
      next: { endsAt: 53_000, alerted: true },
      newCycle: false,
    });
  });
  it("알림 시점에 한 번만 울린다", () => {
    const { fired } = runReadTimer({ endsAt: 60_000, alerted: false }, 0, 70_000, 10);
    expect(fired).toEqual([50]);
  });
  it.each([-1, -4, -5])("종료 %i초 뒤 알림도 울린다 (예전엔 종료 3초 뒤 치워져서 그보다 늦은 알림은 안 울렸다)", (lead) => {
    const { fired, cur } = runReadTimer({ endsAt: 60_000, alerted: false }, 0, 70_000, lead);
    expect(fired).toEqual([60 - lead]);
    expect(cur.endsAt).toBeNull(); // 울린 뒤엔 끝난 것으로 치운다
  });
  it("알림이 없어도 끝나고 3초 지나면 치운다", () => {
    expect(stepReadTimer({ endsAt: 60_000, alerted: true }, 63_250, 10).next.endsAt).toBeNull();
    expect(stepReadTimer({ endsAt: 60_000, alerted: true }, 62_750, 10).next.endsAt).toBe(60_000);
  });
});

describe("버프 아이콘이 사라질 때 종료 시각 남기기", () => {
  it("예정대로 끝났고 종료 뒤 알림이 남아 있을 때만 남긴다", () => {
    expect(keepEndAfterVanish(60_000, false, -3, 61_000)).toBe(true);
    expect(keepEndAfterVanish(60_000, true, -3, 61_000)).toBe(false); // 이미 울림
    expect(keepEndAfterVanish(60_000, false, 10, 61_000)).toBe(false); // 종료 전 알림
    expect(keepEndAfterVanish(60_000, false, -3, 30_000)).toBe(false); // 30초 일찍 끝냄(취소)
    expect(keepEndAfterVanish(null, false, -3, 61_000)).toBe(false);
    // 10초 전 알림인데 11초 남기고 아이콘을 놓침(깜빡임) → 알림이 울리도록 남겨 둔다
    expect(keepEndAfterVanish(60_000, false, 10, 49_000)).toBe(true);
    expect(keepEndAfterVanish(60_000, false, 10, 40_000)).toBe(false); // 20초 일찍 사라짐(취소)
    expect(keepEndAfterVanish(60_000, true, 10, 52_000)).toBe(false); // 이미 울림
  });
});
