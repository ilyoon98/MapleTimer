import { useEffect, useState } from "react";
import { listAlertEvidence, type AlertEvidence } from "../state/alertEvidence";
import { flushAlertEvidence } from "../engine/alertEvidence";

function Shot({blob,kind}:{blob:Blob;kind:"frame"|"crop"}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob]);
  return url?<img className={`evidence-${kind}`} src={url} alt={kind==="crop"?"알림 시점 감지 영역":"알림 시점 게임 화면"}/>:null;
}

/** 설정의 진단 영역에서만 펼친다. 플레이 중에는 캡처 표시나 창을 띄우지 않는다. */
export function AlertEvidenceViewer() {
  const [entries,setEntries]=useState<AlertEvidence[]|null>(null);
  useEffect(()=>{let active=true;void flushAlertEvidence().then(listAlertEvidence).then(e=>{if(active)setEntries(e);});return()=>{active=false;};},[]);
  if(!entries)return <p className="muted small">캡처 불러오는 중…</p>;
  if(!entries.length)return <p className="muted small">알림이 울리면 화면과 판독값을 자동으로 남겨요. 최대 30건.</p>;
  return <div className="alert-evidence-list">{entries.map(entry=><article className="alert-evidence" key={entry.id}>
    <b>{new Date(entry.at).toLocaleTimeString()} · {entry.label}</b>
    {entry.muted&&<span className="muted small"> · 음소거 중</span>}
    {entry.crop&&<Shot blob={entry.crop.image} kind="crop"/>}
    <details><summary>게임 화면 · 판독값</summary>
      {entry.frame&&<Shot blob={entry.frame} kind="frame"/>}
      <pre>{JSON.stringify({at:entry.at,key:entry.key,frameId:entry.frameId,drawnAt:entry.drawnAt,live:entry.live},null,2)}</pre>
    </details>
  </article>)}</div>;
}
