import type { AlertFiredEvent } from "../alerts/alertRunner";
import type { Rect } from "../capture/types";
import type { LiveState } from "../engine/live";

/** 사람이 남기는 정답: 맞게 울림 / 잘못 울림 / 울려야 했는데 안 울림 */
export type EvidenceVerdict = "right" | "wrong" | "missed";

export interface AlertEvidence extends AlertFiredEvent {
  id: string;
  frameId: number;
  sessionId: number;
  drawnAt: number | null;
  frameWidth: number;
  frameHeight: number;
  muted: boolean;
  masterVolume: number;
  /** 소리 재생을 요청한 순간의 화면. 오디오 장치의 실제 출력을 보증하지는 않는다. */
  frame: Blob | null;
  crop: { rect: Rect; image: Blob } | null;
  live: Pick<LiveState, "skills" | "rune" | "stall" | "booster" | "buffs" | "captureStale" | "captureBlack">;
  verdict?: EvidenceVerdict | null;
}

export const EVIDENCE_MAX_COUNT = 30;
export const EVIDENCE_MAX_BYTES = 24 * 1024 * 1024;
export const evidenceBytes = (entry: AlertEvidence) => (entry.frame?.size ?? 0) + (entry.crop?.image.size ?? 0);
export function trimEvidence(entries: AlertEvidence[], maxBytes = EVIDENCE_MAX_BYTES, maxCount = EVIDENCE_MAX_COUNT) {
  const seen = new Set<string>(), kept: AlertEvidence[] = [];
  let bytes = 0;
  for (const entry of [...entries].sort((a,b)=>b.at-a.at)) {
    if (seen.has(entry.id) || kept.length >= maxCount) continue;
    seen.add(entry.id);
    const size = evidenceBytes(entry);
    if (bytes + size > maxBytes) continue;
    bytes += size;
    kept.push(entry);
  }
  return kept;
}

let memory: AlertEvidence[] = [];
let database: Promise<IDBDatabase> | null = null;
const STORE = "captures";
function openDb(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve,reject)=>{
    if (typeof indexedDB === "undefined") { reject(new Error("저장소 없음")); return; }
    const req = indexedDB.open("maple-timer-alert-evidence",1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE,{keyPath:"id"});
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return database;
}

export async function saveAlertEvidence(entry: AlertEvidence) {
  memory = trimEvidence([entry,...memory]);
  try {
    const db = await openDb();
    await new Promise<void>((resolve,reject)=>{
      const tx = db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),req=store.getAll();
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      req.onsuccess=()=>{
        const old=req.result as AlertEvidence[],kept=trimEvidence([entry,...old]);
        const ids=new Set(kept.map(e=>e.id));
        for(const item of old)if(!ids.has(item.id))store.delete(item.id);
        if(ids.has(entry.id))store.put(entry);
      };
    });
  } catch { /* 저장을 못 해도 이번 실행 중에는 메모리에서 확인할 수 있다 */ }
}

/** 맞아요/틀렸어요 표시. 같은 표시를 다시 누르면 지운다 (null) */
export async function markAlertEvidence(id: string, verdict: EvidenceVerdict | null) {
  memory = memory.map(e => e.id === id ? { ...e, verdict } : e);
  try {
    const db = await openDb();
    await new Promise<void>((resolve,reject)=>{
      const tx = db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),req=store.get(id);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      req.onsuccess=()=>{ if(req.result) store.put({ ...req.result, verdict }); };
    });
  } catch { /* 메모리에는 남았다 */ }
}

export async function listAlertEvidence(): Promise<AlertEvidence[]> {
  try {
    const db=await openDb();
    const saved=await new Promise<AlertEvidence[]>((resolve,reject)=>{
      const req=db.transaction(STORE,"readonly").objectStore(STORE).getAll();
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    return trimEvidence([...memory,...saved]);
  } catch { return memory.slice(); }
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);
  });
}

export async function exportAlertEvidence() {
  return Promise.all((await listAlertEvidence()).map(async entry=>({
    ...entry, frame:entry.frame?await blobDataUrl(entry.frame):null,
    crop:entry.crop?{rect:entry.crop.rect,image:await blobDataUrl(entry.crop.image)}:null,
  })));
}
