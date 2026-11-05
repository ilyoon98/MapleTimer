import type { Profile } from "./profile";

// 개발 중인 특수 코어는 잠시 중단한다. 저장된 항목은 지우지 않는다.
export const SPECIAL_CORE_ENABLED = false;
export function activeProfile(profile: Profile): Profile {
  if(SPECIAL_CORE_ENABLED)return profile;
  return {...profile,pipMode:"hunting",buffs:profile.buffs.filter(buff=>buff.kind!=="cooldown")};
}
