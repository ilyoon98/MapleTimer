import { describe, expect, it, vi } from 'vitest';
vi.mock('../capture/screenCapture', () => ({ screenCapture: {
  width: 512, height: 512,
  crop: () => ({ width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4) }),
} }));
import { recordClip, clipUsage, CLIP_MAX_BYTES } from './clip';
import type { Profile } from '../state/profile';
describe('진단 픽셀 버퍼 상한', () => {
  it('30초가 되기 전에도 32 MiB를 넘으면 오래된 프레임을 버리고 연결 종료 때 비운다', () => {
    const p = { regions: { minimap: { x: 0, y: 0, w: 512, h: 512, frameW: 512, frameH: 512 } } } as unknown as Profile;
    recordClip(p, 0, false, null);
    for (let i = 1; i <= 70; i++) recordClip(p, i * 250, true, 100);
    expect(clipUsage().bytes).toBeLessThanOrEqual(CLIP_MAX_BYTES);
    expect(clipUsage().frames).toBe(32);
    recordClip(p, 18000, false, null);
    expect(clipUsage().bytes).toBe(0);
  });
});
