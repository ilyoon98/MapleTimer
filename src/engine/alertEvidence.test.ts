import { beforeEach,describe,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({capture:{state:"live",width:800,height:600,sessionId:7,frameId:12,drawnAt:1000,snapshot:vi.fn(),crop:vi.fn()},save:vi.fn(()=>Promise.resolve())}));
vi.mock("../capture/screenCapture",()=>({screenCapture:mock.capture}));
vi.mock("../state/alertEvidence",()=>({saveAlertEvidence:mock.save}));
import { captureAlertEvidence,flushAlertEvidence } from "./alertEvidence";
import { liveStore } from "./live";
import { defaultProfile,profileStore } from "../state/profile";

const canvas=()=>({width:800,height:600,getContext:()=>({putImageData:vi.fn(),drawImage:vi.fn()}),toBlob:(cb:(blob:Blob)=>void)=>queueMicrotask(()=>cb(new Blob(["captured"]))) });
beforeEach(()=>{
  profileStore.set(defaultProfile());mock.save.mockClear();mock.capture.state="live";
  mock.capture.snapshot.mockReset().mockImplementation(canvas);mock.capture.crop.mockReset().mockReturnValue({width:30,height:20,data:new Uint8ClampedArray(2400)});
  vi.stubGlobal("document",{createElement:canvas});
});
describe("알림 시점 화면과 판독값",()=>{
  it("새 프레임을 끌어오지 않고 알림을 판단한 화면 및 tick 말의 판독값을 저장한다",async()=>{
    const p=defaultProfile();p.regions.booster={x:300,y:80,w:230,h:65,frameW:800,frameH:600};profileStore.set(p);
    captureAlertEvidence({at:1000,label:"부스터",key:"booster",playIndex:1});
    liveStore.set({booster:{status:"running",readText:"10",endsAt:11500,lastAlertAt:1000}});
    await flushAlertEvidence();
    expect(mock.capture.snapshot).toHaveBeenCalledWith(false);
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({at:1000,frameId:12,drawnAt:1000,crop:expect.objectContaining({rect:{x:300,y:80,w:230,h:65}}),live:expect.objectContaining({booster:expect.objectContaining({readText:"10"})})}));
  });
  it("공유 중이 아니면 다른 데스크톱 화면을 찍지 않는다",async()=>{
    mock.capture.state="ended";captureAlertEvidence({at:2000,label:"룬",key:"rune",playIndex:1});await flushAlertEvidence();
    expect(mock.capture.snapshot).not.toHaveBeenCalled();expect(mock.save).not.toHaveBeenCalled();
  });
});
