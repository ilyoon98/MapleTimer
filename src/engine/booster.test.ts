import { inflateSync } from "node:zlib";
import { describe,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({play:vi.fn(()=>Promise.resolve()),crop:vi.fn(),capture:{width:1920,height:1080,sessionId:1,frameId:1,drawnAt:1000}}));
vi.mock("../alerts/audio",()=>({audioEngine:{play:mock.play}}));
vi.mock("../capture/screenCapture",()=>({screenCapture:{...mock.capture,crop:mock.crop,get frameId(){return mock.capture.frameId;},get drawnAt(){return mock.capture.drawnAt;}}}));
import fixture from "../detect/fixtures/booster-quest-overlay.json?raw";
import { cropPixels } from "../cv/image";
import { onAlertFired } from "../alerts/alertRunner";
import { defaultProfile,profileStore } from "../state/profile";
import { resetBoosterObservations,tickBooster } from "./booster";

describe("실제 부스터 판독에서 종료 알림까지",()=>{
  it("다른 화면 세 장으로 49초를 확정한 뒤 10초 전에 한 번 알린다",()=>{
    const f=JSON.parse(fixture),data=new Uint8ClampedArray(inflateSync(Uint8Array.from(atob(f.rgbaDeflate),c=>c.charCodeAt(0))));
    const pixels=cropPixels({width:f.width,height:f.height,data},80,30,230,65);
    const p=defaultProfile();p.booster.enabled=true;p.regions.booster={x:850,y:90,w:230,h:65,frameW:1920,frameH:1080};profileStore.set(p);
    resetBoosterObservations();mock.crop.mockReturnValue(pixels);
    const listener=vi.fn(),off=onAlertFired(listener);
    try{
      expect(tickBooster(p,1000,true).endsAt).toBeNull();
      // 같은 프레임을 다시 읽는 것으로는 확정하지 않는다.
      expect(tickBooster(p,1250,true).endsAt).toBeNull();
      mock.capture.frameId=2;mock.capture.drawnAt=1500;
      expect(tickBooster(p,1500,true).endsAt).toBeNull();
      mock.capture.frameId=3;mock.capture.drawnAt=2000;
      const read=tickBooster(p,2000,true);
      expect(read.readText).toBe("49");expect(read.endsAt).toBe(51000);
      expect(mock.play).not.toHaveBeenCalled();
      mock.crop.mockReturnValue(null);
      tickBooster(p,41000,true);tickBooster(p,41500,true);
      expect(mock.play).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({at:41000,label:"부스터",key:"booster",playIndex:1});
    }finally{off();}
  });
});
