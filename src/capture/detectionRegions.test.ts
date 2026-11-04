import { describe, expect, it } from "vitest";
import { defaultProfile, migrate, SKILL_PRESETS } from "../state/profile";
import { experienceRegion, favoritesRegion, stallRegion } from "./detectionRegions";
import { regionValidFor } from "./types";

describe("간단한 감지 위치", () => {
  it.each([[1024,768],[1280,720],[1366,768],[1920,1080],[1920,1200],[2560,1440]])("%ix%i에서 좌우 즐겨찾기와 중앙 경험치 줄을 맞춘다", (w,h) => {
    const p = defaultProfile();
    const left = favoritesRegion({ ...p, favoritesPosition: "left" }, w,h)!;
    const right = favoritesRegion({ ...p, favoritesPosition: "right" }, w,h)!;
    expect(regionValidFor(left,w,h)).toBe(true);
    expect(regionValidFor(right,w,h)).toBe(true);
    expect(left.x+left.w).toBe(right.x);
    expect(right.x+right.w).toBe(w);
    expect(right.y+right.h).toBeLessThanOrEqual(h-100);
    const exp = experienceRegion(w,h);
    expect(regionValidFor(exp,w,h)).toBe(true);
    expect(exp.w/w).toBeCloseTo(.4,2);
    expect(exp.x+exp.w/2).toBeCloseTo(w/2,0);
    expect(exp.y+exp.h).toBe(h);
  });

  it("높이를 클릭하면 가로 폭은 유지하고, 화면 끝에서도 영역이 벗어나지 않는다", () => {
    const low = experienceRegion(1920,1080,.08);
    expect(low.y+low.h/2).toBeCloseTo(1080*.92,0);
    const high = experienceRegion(1280,720,.08);
    expect(high.y+high.h/2).toBeCloseTo(720*.92,0);
    for(const ratio of [0,1,-1,2]) expect(regionValidFor(experienceRegion(1920,1080,ratio),1920,1080)).toBe(true);
    const p = defaultProfile();
    p.regions.stall = {x:0,y:0,w:30,h:30,frameW:1920,frameH:1080};
    expect(stallRegion(p,1920,1080)).toEqual(experienceRegion(1920,1080));
    p.stall.mode = "mana";
    expect(stallRegion(p,1920,1080)).toEqual(p.regions.stall);
  });

  it("이전 직접 지정 위치와 높이는 보존하고 삭제된 스킬은 설정에서도 제거한다", () => {
    const original = defaultProfile();
    const rect = {x:100,y:950,w:300,h:20,frameW:1920,frameH:1080};
    const p = migrate({ ...original, favoritesPosition: undefined,
      skills: [...original.skills,{...original.skills[0],presetId:"hologram-barrier"}],
      stall: {...original.stall,expHeightRatio:undefined},regions:{favorites:rect,stall:rect} });
    expect(p.favoritesPosition).toBe("manual");
    expect(favoritesRegion(p,1920,1080)).toEqual(rect);
    expect(p.stall.expHeightRatio).toBeCloseTo(1-960/1080);
    expect(p.skills.map(s=>s.presetId)).toEqual(SKILL_PRESETS.map(s=>s.id));
    expect(SKILL_PRESETS).toHaveLength(2);
  });
});
