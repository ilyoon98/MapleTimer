import { useEffect, useState } from "react";
import { desktop, type UpdateState } from "../platform/desktop";

const BUILD_VERSION=import.meta.env.VITE_APP_VERSION || "개발";
export function AppVersion() {
  const [version,setVersion]=useState(BUILD_VERSION);
  useEffect(()=>{void desktop?.appInfo?.().then(info=>setVersion(info.version)).catch(()=>{});},[]);
  useEffect(()=>{document.title=`메이플 타이머 v${version}`;},[version]);
  return <span className="badge app-version">v{version}</span>;
}
function useUpdates() {
  const [info,setInfo]=useState<UpdateState|null>(null);
  useEffect(()=>{
    const accept=(next:UpdateState|null)=>next&&setInfo(current=>!current||next.revision>=current.revision?next:current);
    const off=desktop?.onUpdateState?.(accept);
    void desktop?.updateStatus?.().then(accept).catch(()=>{});
    return ()=>off?.();
  },[]);
  const check=()=>void desktop?.checkForUpdates?.().then(setInfo).catch(()=>{
    setInfo(old=>({currentVersion:BUILD_VERSION,latestVersion:null,progress:null,checkedAt:Date.now(),revision:old?.revision??0,status:"error",error:"업데이트 서버에 연결하지 못했어요"}));
  });
  return {info,check};
}
function statusText(info:UpdateState|null){
  if(!info)return "자동 업데이트 대기 중";
  switch(info.status){
    case "checking":return "새 버전 확인 중…";
    case "available":return `v${info.latestVersion} 다운로드 준비 중`;
    case "downloading":return `v${info.latestVersion} 다운로드 중 · ${Math.round(info.progress??0)}%`;
    case "downloaded":return `v${info.latestVersion} 준비됨 · 앱을 끄면 설치돼요`;
    case "current":return "최신 버전입니다";
    case "error":return "업데이트 확인 실패 · 다시 시도해 주세요";
    case "disabled":return "개발 실행 · 설치판에서 자동 업데이트됩니다";
    default:return "자동 업데이트 사용 중";
  }
}
export function UpdateSettings(){
  const {info,check}=useUpdates();
  if(!desktop)return <div className="field-row"><span>웹 버전</span><AppVersion/></div>;
  const busy=info&&["checking","available","downloading"].includes(info.status);
  return <section className="modal-section">
    <div className="field-row"><h4>앱</h4><AppVersion/><span className="muted small" role="status">{statusText(info)}</span></div>
    <div className="field-row">
      <button onClick={check} disabled={!!busy||!desktop.checkForUpdates}>업데이트 확인</button>
      {info?.status==="downloaded"&&<button className="primary" onClick={()=>void desktop?.installUpdate?.()}>지금 업데이트</button>}
    </div>
  </section>;
}
export function UpdateBanner() {
  const {info,check}=useUpdates();
  if(!info||!["available","downloading","downloaded","error"].includes(info.status))return null;
  return <section className="notice notice-update" aria-live="polite"><div className="notice-row">
    <span className="notice-mark" aria-hidden>↑</span><span className="notice-text">{statusText(info)}</span>
    {info.status==="downloaded"&&<button className="primary" onClick={()=>void desktop?.installUpdate?.()}>지금 다시 시작</button>}
    {info.status==="error"&&<button onClick={check}>다시 확인</button>}
  </div></section>;
}
