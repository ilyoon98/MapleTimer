import { describe, expect, it, vi } from 'vitest';
vi.mock('../capture/screenCapture', () => ({ screenCapture: {
  width: 512, height: 512, state: 'live',
  crop: () => ({ width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4) }),
} }));
import { recordClip, clipUsage, CLIP_MAX_BYTES, activeClipRegions } from './clip';
import { defaultProfile, type Profile } from '../state/profile';
describe('진단 픽셀 버퍼 상한', () => {
  it('30초가 되기 전에도 32 MiB를 넘으면 오래된 프레임을 버리고 연결 종료 때 비운다', () => {
    const p = { ...defaultProfile(), skills: [], buffs: [], rune: { ...defaultProfile().rune, enabled: true }, regions: { minimap: { x: 0, y: 0, w: 512, h: 512, frameW: 512, frameH: 512 } } } as Profile;
    recordClip(p, 0, false, null);
    for (let i = 1; i <= 70; i++) recordClip(p, i * 250, true, 100);
    expect(clipUsage().bytes).toBeLessThanOrEqual(CLIP_MAX_BYTES);
    expect(clipUsage().frames).toBe(32);
    recordClip(p, 18000, false, null);
    expect(clipUsage().bytes).toBe(0);
  });
});
describe('녹화할 영역', () => {
  const W = 1920, H = 1080;
  it('켜진 기능이 실제로 보는 영역만 고르고, 자동 계산 영역(버프칸·경험치 줄)도 넣는다', () => {
    const base = defaultProfile();
    const p: Profile = {
      ...base,
      rune: { ...base.rune, enabled: false },
      booster: { ...base.booster, enabled: false },
      stall: { ...base.stall, enabled: true, mode: 'exp' },
      buffs: [],
      regions: { minimap: { x: 0, y: 0, w: 200, h: 150, frameW: W, frameH: H } },
    };
    const keys = Object.keys(activeClipRegions(p, W, H));
    expect(keys).not.toContain('minimap');
    expect(keys).toContain('stall');
    // 기본 정밀 스킬(야누스·파운틴)은 위쪽 버프칸을 자동으로 본다: p.regions 에 없어도 녹화해야 재생할 수 있다
    expect(p.skills.some((s) => s.enabled)).toBe(true);
    expect(keys.some((k) => k === 'buffbar' || k.startsWith('slot:'))).toBe(true);
  });
  it('다른 영역 안에 들어가는 영역은 한 번만 보관한다', () => {
    const base = defaultProfile();
    const p: Profile = {
      ...base,
      skills: [],
      rune: { ...base.rune, enabled: true },
      booster: { ...base.booster, enabled: true },
      stall: { ...base.stall, enabled: true, mode: 'cooldown' },
      buffs: [],
      regions: {
        minimap: { x: 0, y: 0, w: 400, h: 300, frameW: W, frameH: H },
        stall: { x: 10, y: 10, w: 50, h: 50, frameW: W, frameH: H },
        booster: { x: 800, y: 0, w: 200, h: 60, frameW: W, frameH: H },
      },
    };
    expect(Object.keys(activeClipRegions(p, W, H)).sort()).toEqual(['booster', 'minimap']);
  });
});
