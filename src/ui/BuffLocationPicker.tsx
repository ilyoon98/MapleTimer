import {useEffect,useRef,useState,type CSSProperties} from "react";
import {screenCapture} from "../capture/screenCapture";
import {autoBuffbarRegion,favoritesRegion} from "../capture/detectionRegions";
import {regionValidFor} from "../capture/types";
import {profileStore} from "../state/profile";
import {currentSkillBuffLocation,selectSkillBuffLocation,SKILL_BUFF_LOCATIONS,type SkillBuffLocation} from "../state/skillBuffLocation";
import {closeBuffLocation} from "./buffLocationStore";
import {pickFavoritesManually} from "./pickers";
import {useEscape} from "./SettingsModal";

export function BuffLocationPicker(){
  const p=profileStore.use(p=>p);
  const [selected,setSelected]=useState<SkillBuffLocation|null>(()=>currentSkillBuffLocation(p));
  const [size,setSize]=useState({w:screenCapture.width||1920,h:screenCapture.height||1080});
  const [preview,setPreview]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  useEscape(closeBuffLocation);
  useEffect(()=>{
    const draw=()=>{
      if(!canvas.current)return;
      const live=screenCapture.drawPreview(canvas.current);setPreview(live);
      if(!live)canvas.current.getContext("2d")?.clearRect(0,0,canvas.current.width,canvas.current.height);
      if(live)setSize(old=>old.w===screenCapture.width&&old.h===screenCapture.height?old:{w:screenCapture.width,h:screenCapture.height});
    };
    draw();const timer=setInterval(draw,500);return()=>clearInterval(timer);
  },[]);
  const options=(["bar","left","right"] as const).map(location=>({location,rect:location==="bar"?autoBuffbarRegion(size.w,size.h):favoritesRegion({...p,favoritesPosition:location},size.w,size.h)!}));
  const manual=p.regions.favorites;
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&closeBuffLocation()}>
    <section className="modal modal-buff-location" role="dialog" aria-modal="true" aria-label="스킬 버프 위치 선택">
      <header className="modal-head"><h2>버프가 보이는 위치를 누르세요</h2><button onClick={closeBuffLocation}>닫기</button></header>
      <div className="buff-location-content">
        <div className="buff-location-stage" style={{"--game-aspect":size.w/size.h} as CSSProperties}>
          <canvas ref={canvas} aria-label="공유 중인 메이플 화면"/>
          {!preview&&<span className="buff-location-placeholder">메이플을 연결하면 게임 화면이 보여요</span>}
          {options.map(({location,rect})=><button key={location} className={`buff-location-choice ${selected===location?"is-selected":""}`}
            aria-pressed={selected===location} onClick={()=>setSelected(location)}
            style={{left:`${rect.x/size.w*100}%`,top:`${rect.y/size.h*100}%`,width:`${rect.w/size.w*100}%`,height:`${rect.h/size.h*100}%`}}>
            <span>{selected===location?"✓ ":""}{SKILL_BUFF_LOCATIONS[location]}</span>
          </button>)}
          {selected==="manual"&&regionValidFor(manual,size.w,size.h)&&<div className="buff-location-manual" style={{left:`${manual.x/size.w*100}%`,top:`${manual.y/size.h*100}%`,width:`${manual.w/size.w*100}%`,height:`${manual.h/size.h*100}%`}}/>}
        </div>
        <div className="buff-location-footer">
          <button className="text-btn" onClick={()=>{closeBuffLocation();pickFavoritesManually();}}>직접 지정</button>
          <span className="muted small">두 스킬에 함께 적용</span><span className="spacer"/>
          <button onClick={closeBuffLocation}>취소</button>
          <button className="primary" disabled={!selected||(selected==="manual"&&!regionValidFor(manual,size.w,size.h))} onClick={()=>{if(selected){profileStore.set(p=>selectSkillBuffLocation(p,selected));closeBuffLocation();}}}>이 위치 사용</button>
        </div>
      </div>
    </section>
  </div>;
}
