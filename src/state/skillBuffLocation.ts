import type { Profile } from "./profile";
export type SkillBuffLocation="bar"|"left"|"right"|"manual";
export const SKILL_BUFF_LOCATIONS:Record<SkillBuffLocation,string>={bar:"기본 버프칸",left:"좌측 하단",right:"우측 하단",manual:"직접 지정"};
export function currentSkillBuffLocation(p:Profile):SkillBuffLocation|null {
  const active=p.skills.filter(s=>s.enabled),skills=active.length?active:p.skills;
  const locations=skills.map(s=>s.where==="favorites"?p.favoritesPosition:"bar");
  return locations.every(l=>l===locations[0])?(locations[0]??"bar"):null;
}
export function selectSkillBuffLocation(p:Profile,location:SkillBuffLocation):Profile {
  return {...p,favoritesPosition:location==="bar"?p.favoritesPosition:location,
    skills:p.skills.map(s=>({...s,where:location==="bar"?"bar":"favorites"}))};
}
export function addSkillAtCurrentLocation(p:Profile,skill:Profile["skills"][number]):Profile {
  const location=currentSkillBuffLocation(p),next={...p,skills:[...p.skills,skill]};
  return location?selectSkillBuffLocation(next,location):next;
}
