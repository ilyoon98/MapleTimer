import { describe, expect, it } from "vitest";
import { ScreenTransitionDetector } from "./screenTransition";

/** [밝기, 이어지는 초] 구간을 0.25초마다 넣고, 각 시각(초)에 전환 중이었는지 돌려준다 */
function run(d: ScreenTransitionDetector, parts: Array<[number | null, number]>) {
  const out: Array<[number, boolean]> = [];
  let now = 0;
  for (const [mean, sec] of parts)
    for (let t = 0; t < sec * 1000; t += 250, now += 250) out.push([now / 1000, d.update(mean == null ? null : { mean }, now)]);
  const at = (s: number) => out.find(([t]) => t >= s)![1];
  return { at, out };
}

describe("화면 전환 (맵 이동) 감지", () => {
  it("암전되는 동안과 밝기가 돌아온 뒤 1.5초까지 전환 중", () => {
    const { at } = run(new ScreenTransitionDetector(), [
      [120, 5],
      [3, 2], // 5~7초 암전
      [120, 4],
    ]);
    expect(at(4)).toBe(false);
    expect(at(6)).toBe(true);
    expect(at(7.5)).toBe(true); // 돌아온 뒤 1.5초 안
    expect(at(9)).toBe(false);
  });
  it("로딩 검은 화면이 길어도 계속 전환 중으로 본다", () => {
    const { at } = run(new ScreenTransitionDetector(), [
      [120, 5],
      [2, 10],
    ]);
    expect(at(14)).toBe(true);
  });
  it("밝은 맵에서 어두운 맵으로 오면 3초 뒤 새 밝기에 맞춰 감지를 다시 한다 (예전엔 계속 전환 중)", () => {
    const { at } = run(new ScreenTransitionDetector(), [
      [120, 5],
      [3, 1.5], // 5~6.5초 암전
      [50, 10], // 6.5초부터 어두운 맵 (120 의 55% 아래)
    ]);
    expect(at(8)).toBe(true);
    expect(at(10)).toBe(false); // 어두운 맵이 3초 넘게 이어짐 → 새 평소 밝기
    expect(at(16)).toBe(false);
  });
  it("어두운 맵에 적응한 뒤에도 다음 맵 이동은 잡는다", () => {
    const { at } = run(new ScreenTransitionDetector(), [
      [120, 5],
      [50, 6], // 어두운 맵 (3초 뒤 적응)
      [2, 2], // 11~13초 맵 이동 암전
      [50, 3],
    ]);
    expect(at(10)).toBe(false);
    expect(at(12)).toBe(true);
  });
  it("공유가 끊겼다 다시 켜지면 평소 밝기를 새로 잰다", () => {
    const { at } = run(new ScreenTransitionDetector(), [
      [120, 5],
      [null, 2], // 공유 끊김
      [50, 3], // 다시 켠 화면은 더 어두운 장면
    ]);
    expect(at(7.5)).toBe(false);
  });
});
