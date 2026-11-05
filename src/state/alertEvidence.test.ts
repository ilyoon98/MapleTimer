import { describe,expect,it } from "vitest";
import { trimEvidence,saveAlertEvidence,listAlertEvidence,type AlertEvidence } from "./alertEvidence";

const item=(id:string,at:number,size:number)=>({id,at,key:"rune",label:"룬",frame:new Blob([new Uint8Array(size)]),crop:null} as AlertEvidence);
describe("알림 캡처 보관",()=>{
  it("최신순으로 중복을 빼고 건수·용량을 함께 제한한다",()=>{
    const a=item("a",1,4),b=item("b",2,4),c=item("c",3,4);
    expect(trimEvidence([a,b,c,c],10,3).map(e=>e.id)).toEqual(["c","b"]);
    expect(trimEvidence([a,b,c],100,1).map(e=>e.id)).toEqual(["c"]);
    expect(trimEvidence([item("oversized",4,200),b],10,3).map(e=>e.id)).toEqual(["b"]);
  });
  it("영구 저장소를 못 써도 실행 중 기록은 남긴다",async()=>{
    const evidence=item("fallback",10,4);await saveAlertEvidence(evidence);
    expect((await listAlertEvidence()).some(e=>e.id===evidence.id)).toBe(true);
  });
});
