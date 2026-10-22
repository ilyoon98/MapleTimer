import { describe, expect, it } from "vitest";
import { EstimateConsensus, applyExpiry } from "./consensus";

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
