import { beforeEach, describe, expect, it, vi } from "vitest";

// 실제 소리 대신 재생 횟수만 센다 (재생은 즉시 끝난 것으로)
const play = vi.fn(() => Promise.resolve());
vi.mock("./audio", () => ({ audioEngine: { play } }));

const { AlertRunner, randomDelaySetting } = await import("./alertRunner");

const cfg = (enabled: boolean, maxCount: number | null) => () => ({
  sound: { kind: "beep" as const, pattern: "single" as const },
  volume: 1,
  repeat: { enabled, intervalSec: 2, maxCount },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("AlertRunner", () => {
  beforeEach(() => {
    play.mockClear();
    randomDelaySetting.enabled = false;
  });

  it("음성 읽기는 저장된 문장이 아니라 항목 이름으로 만든 문장을 읽는다 (이름을 바꾸면 따라 바뀜)", async () => {
    const r = new AlertRunner("t", () => ({ sound: { kind: "tts" as const, text: "예전 문장" }, volume: 1, repeat: { enabled: false, intervalSec: 2, maxCount: null } }));
    let name = "솔 야누스";
    r.setSpeak(() => `${name} 곧 끝나요`);
    name = "야누스";
    r.trigger(0);
    r.tick(0);
    await flush();
    expect(play).toHaveBeenCalledWith({ kind: "tts", text: "야누스 곧 끝나요" }, 1);
  });

  it("반복이 꺼져 있으면 한 번만 울린다", async () => {
    const r = new AlertRunner("t", cfg(false, null));
    r.trigger(0);
    r.tick(0);
    await flush();
    r.tick(10_000);
    r.trigger(10_000); // 이미 울린 알림은 reset 전까지 다시 시작하지 않음
    r.tick(20_000);
    expect(play).toHaveBeenCalledTimes(1);
    expect(r.isRinging).toBe(false);
  });

  it("반복 2번이면 총 3번, 간격은 소리가 끝난 뒤부터", async () => {
    vi.useFakeTimers({ now: 0 });
    const r = new AlertRunner("t", cfg(true, 2));
    r.trigger(0);
    r.tick(0);
    await vi.advanceTimersByTimeAsync(0);
    r.tick(1_000); // 아직 2초 안 지남
    expect(play).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    r.tick(Date.now());
    await vi.advanceTimersByTimeAsync(2_000);
    r.tick(Date.now());
    await vi.advanceTimersByTimeAsync(2_000);
    r.tick(Date.now());
    expect(play).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("알림 멈춤(ack) 후에는 조건이 풀릴 때(reset)까지 다시 울리지 않는다", async () => {
    const r = new AlertRunner("t", cfg(true, null));
    r.trigger(0);
    r.tick(0);
    await flush();
    r.ack();
    expect(r.isRinging).toBe(false);
    r.trigger(5_000);
    r.tick(5_000);
    expect(play).toHaveBeenCalledTimes(1);
    r.reset();
    r.trigger(6_000);
    r.tick(6_000);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("랜덤 지연은 첫 알림을 최대 2초 늦춘다", () => {
    randomDelaySetting.enabled = true;
    const r = new AlertRunner("t", cfg(false, null));
    r.trigger(0);
    r.tick(2_000);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
