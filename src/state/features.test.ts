import {describe,it,expect} from "vitest";
import {activeProfile} from "./features";
import {defaultProfile,newBuff} from "./profile";
describe("특수 코어 일시 중단",()=>{
  it("기존 코어는 보존하고 실행 목록과 PIP에서만 제외한다",()=>{
    const profile=defaultProfile(),core=newBuff("cooldown"),buff=newBuff("expiry");
    profile.buffs=[core,buff];profile.pipMode="core";
    expect(activeProfile(profile).buffs).toEqual([buff]);expect(activeProfile(profile).pipMode).toBe("hunting");
    expect(profile.buffs).toEqual([core,buff]);expect(core.enabled).toBe(true);expect(profile.pipMode).toBe("core");
  });
});
