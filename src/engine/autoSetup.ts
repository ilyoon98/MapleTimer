import { screenCapture } from '../capture/screenCapture';
import { regionValidFor } from '../capture/types';
import { findBooster, findMinimap, findExperienceBand, RegionConfirmation } from '../detect/autoRegions';
import { profileStore, setRegion } from '../state/profile';

let last=0, size='';
const minimap=new RegionConfirmation(),booster=new RegionConfirmation();
const experience=new RegionConfirmation();
export function autoSetup(now:number){
  if(now-last<1500)return;
  last=now;
  const w=screenCapture.width,h=screenCapture.height;
  const key=`${w}x${h}:${screenCapture.sessionId}:${screenCapture.layoutRevision}`;
  if(size!==key){size=key;minimap.reset();booster.reset();experience.reset();}
  const p=profileStore.get();
  const apply=(key:'minimap'|'booster'|'stall',r:import('../capture/types').Rect)=>{
    const old=profileStore.get().regions[key];
    if(old&&old.frameW===w&&old.frameH===h&&old.x===r.x&&old.y===r.y&&old.w===r.w&&old.h===r.h)return;
    setRegion(key,{...r,frameW:w,frameH:h,automatic:true});
  };
  if(p.rune.enabled&&(p.regions.minimap?.automatic||!regionValidFor(p.regions.minimap,w,h))){
    const crop={x:0,y:0,w:Math.min(600,Math.round(w*.45)),h:Math.min(450,Math.round(h*.5))};
    const img=screenCapture.crop(crop);
    const found=minimap.observe(img?findMinimap(img):null);
    if(found)apply('minimap',found);
  }
  if(p.booster.enabled&&(p.regions.booster?.automatic||!regionValidFor(p.regions.booster,w,h))){
    const crop={x:Math.round(w*.25),y:0,w:Math.round(w*.5),h:Math.min(220,Math.round(h*.25))};
    const img=screenCapture.crop(crop);
    const found=booster.observe(img?findBooster(img):null);
    if(found)apply('booster',{...found,x:found.x+crop.x});
  }
  if(p.stall.enabled&&p.stall.mode==='exp'&&(p.regions.stall?.automatic||!regionValidFor(p.regions.stall,w,h))){
    const y=Math.max(0,h-40),img=screenCapture.crop({x:0,y,w,h:h-y});
    const found=experience.observe(img?findExperienceBand(img):null);
    if(found)apply('stall',{...found,y:found.y+y});
  }
}
