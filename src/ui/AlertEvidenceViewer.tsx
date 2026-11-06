import { useEffect, useState } from "react";
import { listAlertEvidence, markAlertEvidence, type AlertEvidence, type EvidenceVerdict } from "../state/alertEvidence";
import { flushAlertEvidence } from "../engine/alertEvidence";

function Shot({blob,kind}:{blob:Blob;kind:"frame"|"crop"}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob]);
  return url?<img className={`evidence-${kind}`} src={url} alt={kind==="crop"?"알림 시점 감지 영역":"알림 시점 게임 화면"}/>:null;
}

/** 맞아요/틀렸어요 한 번 누르기. 같은 걸 다시 누르면 지운다. 진단 파일에 같이 담겨 자동 분석에 쓰인다 */
function Verdict({entry,onChange}:{entry:AlertEvidence;onChange:(v:EvidenceVerdict|null)=>void}) {
  if(entry.verdict==="missed")return <span className="evidence-tag evidence-missed">놓침</span>;
  const pick=(v:EvidenceVerdict)=>onChange(entry.verdict===v?null:v);
  return <span className="seg evidence-verdict" role="group" aria-label="이 알림이 맞았나요?">
    <button className={entry.verdict==="right"?"on":""} onClick={()=>pick("right")}>맞아요</button>
    <button className={entry.verdict==="wrong"?"on":""} onClick={()=>pick("wrong")}>틀렸어요</button>
  </span>;
}

/** 설정의 진단 영역에서만 펼친다. 플레이 중에는 캡처 표시나 창을 띄우지 않는다. */
export function AlertEvidenceViewer() {
  const [entries,setEntries]=useState<AlertEvidence[]|null>(null);
  useEffect(()=>{let active=true;void flushAlertEvidence().then(listAlertEvidence).then(e=>{if(active)setEntries(e);});return()=>{active=false;};},[]);
  if(!entries)return <p className="muted small">캡처 불러오는 중…</p>;
  if(!entries.length)return <p className="muted small">알림이 울리면 화면과 판독값을 자동으로 남겨요. 최대 30건.</p>;
  const mark=(id:string,v:EvidenceVerdict|null)=>{
    setEntries(list=>list&&list.map(e=>e.id===id?{...e,verdict:v}:e));
    void markAlertEvidence(id,v);
  };
  return <div className="alert-evidence-list">
    <p className="muted small">알림마다 맞았는지 눌러 두고 진단 파일을 저장하면, 틀린 것만 골라 고칠 수 있어요.</p>
    {entries.map(entry=><article className="alert-evidence" key={entry.id}>
    <div className="evidence-head">
      <b>{new Date(entry.at).toLocaleTimeString()} · {entry.label}</b>
      {entry.muted&&<span className="muted small">음소거 중</span>}
      <Verdict entry={entry} onChange={v=>mark(entry.id,v)}/>
    </div>
    {entry.crop&&<Shot blob={entry.crop.image} kind="crop"/>}
    <details><summary>게임 화면 · 판독값</summary>
      {entry.frame&&<Shot blob={entry.frame} kind="frame"/>}
      <pre>{JSON.stringify({at:entry.at,key:entry.key,frameId:entry.frameId,drawnAt:entry.drawnAt,live:entry.live},null,2)}</pre>
    </details>
  </article>)}</div>;
}
