import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ crop: vi.fn(), match: vi.fn() }));
vi.mock("../capture/screenCapture", () => ({screenCapture:{state:"live",width:1024,height:768,crop:mock.crop}}));
vi.mock("../cv/match", async (original) => ({ ...await original<typeof import("../cv/match")>(), findTemplate:mock.match }));
import { defaultProfile } from "../state/profile";
import { applyBuffSearch, detectBuffs as request, isBuffPresent, preciseSkillBuffs, resetBuffObservations, trackBuffIcons } from "./buffs";

// 엔진처럼: 탐색을 요청하고 같은 tick 에 끝난 결과를 반영한다 (테스트에서는 워커 없이 그 자리에서 계산)
const detectBuffs = (p: ReturnType<typeof defaultProfile>, now: number, live: boolean) => { request(p, now, live); applyBuffSearch(p, now, live); };

beforeEach(() => {
  resetBuffObservations();
  mock.crop.mockReset().mockImplementation(r => ({width:r.w,height:r.h,data:new Uint8ClampedArray(r.w*r.h*4)}));
  mock.match.mockReset().mockReturnValue([{x:8,y:8,score:.98,colorDist:0}]);
});

describe("즐겨찾기 위치 전환", () => {
  it("두 스킬은 같은 영역을 한 번만 자르고 이전 영역의 추적을 중지한다", () => {
    const p = defaultProfile();
    p.favoritesPosition="left";
    p.skills.forEach(s=>s.where="favorites");
    p.buffs=preciseSkillBuffs(p,1024,768);
    detectBuffs(p,1000,true);
    expect(mock.crop).toHaveBeenCalledTimes(1);
    detectBuffs(p,1500,true);
    expect(isBuffPresent(p.buffs[0].id)).toBe(true);
    p.favoritesPosition="right";
    p.buffs=preciseSkillBuffs(p,1024,768);
    mock.crop.mockClear();
    trackBuffIcons(p,1750,true);
    expect(mock.crop).not.toHaveBeenCalled();
    expect(isBuffPresent(p.buffs[0].id)).toBe(false);
    detectBuffs(p,2000,true);
    expect(mock.crop.mock.calls[0][0].x).toBe(512);
    expect(isBuffPresent(p.buffs[0].id)).toBe(false);
    detectBuffs(p,2500,true);
    expect(isBuffPresent(p.buffs[0].id)).toBe(true);
  });
});
