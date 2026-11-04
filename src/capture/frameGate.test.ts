import { describe, expect, it } from 'vitest';
import { FrameGate } from './frameGate';
describe('프레임 신선도', () => {
  it('같은 프레임을 다시 투표하거나 학습하지 않는다', () => {
    const gate = new FrameGate();
    expect(gate.sample(1, 8, 1000, 1000, true).fresh).toBe(true);
    expect(gate.sample(1, 8, 1000, 1250, true)).toEqual({ usable: true, fresh: false, reset: false });
    expect(gate.sample(1, 9, 1500, 1500, true).fresh).toBe(true);
  });
  it('프레임이 끊기면 관측을 중단하고 재개 시 과거 공백을 버린다', () => {
    const gate = new FrameGate();
    gate.sample(1, 8, 1000, 1000, true);
    expect(gate.sample(1, 8, 1000, 4000, true)).toEqual({ usable: false, fresh: false, reset: true });
    expect(gate.sample(1, 9, 31000, 31000, true).reset).toBe(true);
  });
  it('엔진 자체가 멈췄다 돌아와도 긴 공백을 식별한다', () => {
    const gate = new FrameGate();
    gate.sample(1, 8, 1000, 1000, true);
    expect(gate.sample(1, 9, 31000, 31000, true)).toEqual({ usable: true, fresh: true, reset: true });
  });
  it('해상도가 같은 새 공유도 별도 세션으로 처리한다', () => {
    const gate = new FrameGate();
    gate.sample(1, 8, 1000, 1000, true);
    expect(gate.sample(2, 8, 1250, 1250, true)).toEqual({ usable: true, fresh: true, reset: true });
  });
});
