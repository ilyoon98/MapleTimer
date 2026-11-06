import { onAlertFired, type AlertFiredEvent } from "../alerts/alertRunner";
import { screenCapture } from "../capture/screenCapture";
import { stallRegion } from "../capture/detectionRegions";
import { regionValidFor, type SavedRegion } from "../capture/types";
import { saveAlertEvidence, type EvidenceVerdict } from "../state/alertEvidence";
import { profileStore, type Profile } from "../state/profile";
import { buffRegion, preciseSkillBuffs } from "./buffs";
import { liveStore } from "./live";

function alertRegion(key: string,p: Profile,w:number,h:number): SavedRegion | undefined {
  if(key==="rune")return p.regions.minimap;
  if(key==="booster")return p.regions.booster;
  if(key==="stall")return stallRegion(p,w,h);
  if(key.startsWith("buff:")){
    const buff=[...p.buffs,...preciseSkillBuffs(p,w,h)].find(b=>b.id===key.slice(5));
    return buff?buffRegion(p,buff):undefined;
  }
  if(key.startsWith("skill:"))return p.regions[key as `skill:${string}`];
}

const pending = new Set<Promise<void>>();
const encode=(canvas:HTMLCanvasElement,type="image/png")=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,.85));

/** 알림 시점의 공유 게임만 보관한다. 창 띄우기·다운로드·전체 모니터 캡처는 하지 않는다. */
export function captureAlertEvidence(event: AlertFiredEvent, verdict: EvidenceVerdict | null = null) {
  if (screenCapture.state !== "live" || pending.size >= 3) return false;
  const full=screenCapture.snapshot(false);
  if(!full)return false;
  const p=profileStore.get(),w=screenCapture.width,h=screenCapture.height;
  const region=alertRegion(event.key,p,w,h);
  const crop=regionValidFor(region,w,h)?screenCapture.crop(region):null;
  let overview=full;
  if(full.width>1280){
    overview=document.createElement("canvas");overview.width=1280;overview.height=Math.round(full.height*1280/full.width);
    overview.getContext("2d")!.drawImage(full,0,0,overview.width,overview.height);
  }
  const frameId=screenCapture.frameId,sessionId=screenCapture.sessionId,drawnAt=screenCapture.drawnAt;
  const overviewJob=encode(overview,"image/jpeg");
  let cropJob:Promise<Blob|null>=Promise.resolve(null);
  if(crop){
    const canvas=document.createElement("canvas");canvas.width=crop.width;canvas.height=crop.height;
    canvas.getContext("2d")!.putImageData(crop,0,0);cropJob=encode(canvas);
  }
  // 소리 재생은 엔진 tick 중에 시작한다. tick 끝에 확정된 판독값을 같은 화면과 묶는다.
  const work=Promise.resolve().then(async()=>{
    const live=liveStore.get();
    const readings=structuredClone({skills:live.skills,rune:live.rune,stall:live.stall,booster:live.booster,buffs:live.buffs,captureStale:live.captureStale,captureBlack:live.captureBlack});
    const [frame,image]=await Promise.all([overviewJob,cropJob]);
    await saveAlertEvidence({...event,id:`${sessionId}:${event.at}:${event.key}:${event.playIndex}`,
      frameId,sessionId,drawnAt,frameWidth:w,frameHeight:h,muted:p.muted,masterVolume:p.masterVolume,
      frame,crop:image&&region?{rect:{x:region.x,y:region.y,w:region.w,h:region.h},image}:null,live:readings,verdict});
  }).catch(()=>{});
  pending.add(work);void work.finally(()=>pending.delete(work));
  return true;
}

/** '방금 놓쳤어요': 알림이 안 울린 그 순간의 화면을 '놓침'으로 남긴다 */
export function captureMissedAlert(key: string, label: string) {
  return captureAlertEvidence({ at: Date.now(), key, label, playIndex: 0 }, "missed");
}

let started=false;
export function startAlertEvidence(){if(!started){started=true;onAlertFired(e=>{captureAlertEvidence(e);});}}
export async function flushAlertEvidence(){await Promise.all([...pending]);}
