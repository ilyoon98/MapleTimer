import {beforeEach,describe,expect,it,vi} from "vitest";
import {createPersistentStore,persistenceStatus} from "./createStore";
beforeEach(()=>{vi.stubGlobal("localStorage",{getItem:vi.fn(()=>null),setItem:vi.fn()});vi.stubGlobal("window",{});persistenceStatus.set({errors:{}});});
describe("종료해도 남는 설정",()=>{
  it("300ms를 기다리지 않고 저장해서 바로 다시 열어도 유지한다",()=>{
    const saved=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)});
    const first=createPersistentStore("test",{theme:"system"});first.set({theme:"dark"});
    expect(createPersistentStore("test",{theme:"system"}).get().theme).toBe("dark");
  });
  it("브라우저 저장소가 비거나 한도를 넘어도 앱 파일에서 복원하고 즉시 저장한다",()=>{
    const disk=new Map([["test",JSON.stringify({theme:"dark"})]]);
    vi.stubGlobal("window",{mapleDesktop:{settings:{read:(k:string)=>({value:disk.get(k)??null}),write:(k:string,v:string)=>{disk.set(k,v);return {ok:true};}}}});
    vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{throw Error("quota");}});
    const store=createPersistentStore("test",{theme:"system"});expect(store.get().theme).toBe("dark");store.set({theme:"light"});
    expect(JSON.parse(disk.get("test")!).theme).toBe("light");expect(persistenceStatus.get().errors).toEqual({});
  });
  it("저장 실패를 숨기지 않고 알린다",()=>{
    vi.stubGlobal("window",{mapleDesktop:{settings:{read:()=>({value:null}),write:()=>({ok:false,error:"쓰기 실패"})}}});
    createPersistentStore("test",{enabled:true}).set({enabled:false});expect(persistenceStatus.get().errors.test).toBe("쓰기 실패");
  });
});
