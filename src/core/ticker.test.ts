import { afterEach, describe, expect, it, vi } from "vitest";
import { Ticker } from "./ticker";

afterEach(() => vi.restoreAllMocks());

describe("여러 경로에서 분석 깨우기", () => {
  it("워커 신호가 없어도 프레임/PIP 신호로 실행하고 중복은 합친다", () => {
    const clock = vi.spyOn(performance, "now");
    const ticker = new Ticker(250);
    const run = vi.fn();
    ticker.subscribe(run);
    clock.mockReturnValue(0);
    ticker.pulse();
    clock.mockReturnValue(100);
    ticker.pulse();
    clock.mockReturnValue(250);
    ticker.pulse();
    ticker.pulse();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("긴 백그라운드 정지 뒤에 쌓인 신호를 몰아서 분석하지 않는다", () => {
    const clock = vi.spyOn(performance, "now");
    const ticker = new Ticker(250);
    const run = vi.fn();
    ticker.subscribe(run);
    clock.mockReturnValue(0);
    ticker.pulse();
    clock.mockReturnValue(600_000);
    for (let i = 0; i < 100; i++) ticker.pulse();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
