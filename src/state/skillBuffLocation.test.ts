import {describe,expect,it} from "vitest";
import {defaultProfile,newSkill} from "./profile";
import {addSkillAtCurrentLocation,currentSkillBuffLocation,selectSkillBuffLocation} from "./skillBuffLocation";

describe("공유 화면에서 고르는 정밀 스킬 위치",()=>{
  it("나중에 추가한 스킬도 이미 선택한 위치를 쓴다",()=>{
    const p=selectSkillBuffLocation(defaultProfile(),"right");p.skills=p.skills.slice(0,1);
    const next=addSkillAtCurrentLocation(p,newSkill("erda-fountain-precise"));
    expect(next.skills).toHaveLength(2);expect(next.skills.every(s=>s.where==="favorites")).toBe(true);
    expect(currentSkillBuffLocation(next)).toBe("right");
  });
  it("꺼 둔 스킬의 예전 위치 때문에 현재 위치가 다르게 보이지 않는다",()=>{
    const p=defaultProfile();p.skills[0].where="favorites";p.favoritesPosition="right";p.skills[1].enabled=false;
    expect(currentSkillBuffLocation(p)).toBe("right");
    p.skills[1].enabled=true;expect(currentSkillBuffLocation(p)).toBeNull();
  });
  it("좌우 선택은 두 스킬에 함께 적용하고 기존 수동 영역·알림 값은 보존한다",()=>{
    const p=defaultProfile();p.skills[1].enabled=false;
    p.regions.favorites={x:10,y:500,w:200,h:100,frameW:1920,frameH:1080};
    const next=selectSkillBuffLocation(p,"left");
    expect(next.skills.every(s=>s.where==="favorites")).toBe(true);expect(next.favoritesPosition).toBe("left");
    expect(next.skills[1].enabled).toBe(false);expect(next.skills[0].alert).toEqual(p.skills[0].alert);
    expect(next.regions).toBe(p.regions);expect(p.skills[0].where).toBeUndefined();
    const bar=selectSkillBuffLocation(next,"bar");
    expect(bar.skills.every(s=>s.where==="bar")).toBe(true);expect(bar.favoritesPosition).toBe("left");
  });
});
