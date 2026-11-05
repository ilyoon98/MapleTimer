import { screenCapture } from "../../capture/screenCapture";
import { favoritesRegion } from "../../capture/detectionRegions";
import { regionValidFor } from "../../capture/types";
import { liveStore } from "../../engine/engine";
import { SKILL_PRESETS, newSkill, profileStore, setRegion, shortName, updateSkill, type SkillEntry } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { leadText } from "../../alerts/speech";
import { Panel, StatusDot, Toggle, fmtRemaining, NOT_CONNECTED } from "../common";
import { gameIconUrl } from "../gameArt";
import { addSkillAtCurrentLocation, currentSkillBuffLocation, SKILL_BUFF_LOCATIONS } from "../../state/skillBuffLocation";
import { pickFavorites } from "../pickers";

export function SkillsPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const skills = profileStore.use((p) => p.skills);
  const p = profileStore.use(p=>p);
  const location=currentSkillBuffLocation(p);
  const missing = SKILL_PRESETS.filter((preset) => !skills.some((s) => s.presetId === preset.id));
  return (
    <Panel id="skills" title="스킬 알림" icon={gameIconUrl("janus")} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
      actions={missing.map((preset) => <button key={preset.id} onClick={() => profileStore.set((p) => addSkillAtCurrentLocation(p,newSkill(preset.id)))}>+ {shortName(preset.name)}</button>)}>
      {skills.length>0&&<div className="skills-location"><span className="muted">버프 위치</span><button aria-label="버프 위치 선택" onClick={pickFavorites}>{location?SKILL_BUFF_LOCATIONS[location]:"스킬별 위치"} · 변경</button></div>}
      {skills.length === 0 && <div className="empty">사용할 스킬을 추가해 주세요.</div>}
      {skills.map((s) => <SkillRow key={s.id} skill={s} />)}
    </Panel>
  );
}

function SkillRow({ skill: s }: { skill: SkillEntry }) {
  const live = liveStore.use((l) => l.skills[s.id]);
  const now = liveStore.use((l) => l.now);
  const p = profileStore.use((p) => p);
  const sharing = liveStore.use(() => screenCapture.state === "live");
  const onFavorites = s.where === "favorites";
  const favOk = sharing && regionValidFor(favoritesRegion(p, screenCapture.width, screenCapture.height), screenCapture.width, screenCapture.height);
  const remaining = live?.expiresAt != null ? live.expiresAt - now : null;
  let status: { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string };
  if (!s.enabled) status = { tone: "idle", text: "꺼짐" };
  else if (!sharing) status = NOT_CONNECTED;
  else if (onFavorites && !favOk) status = { tone: "warn", text: "즐겨찾기 위치 확인 필요" };
  else if (remaining != null && remaining <= s.leadSec * 1000) status = { tone: "alert", text: remaining > 0 ? "곧 종료" : "종료됨" };
  else if (remaining != null) status = { tone: "ok", text: "지속 중" };
  else status = { tone: "info", text: live?.iconState === "ready" ? "아이콘 찾음" : "버프 찾는 중" };
  return (
    <div className={`row ${s.enabled ? "" : "row-off"}`}>
      <div className="row-main">
        <Toggle checked={s.enabled} onChange={(v) => updateSkill(s.id, { enabled: v })} />
        <div className="row-title"><div className="name">{s.name}</div></div>
        <div className="cell"><div className="cell-label">남은 시간</div><div className={`cell-value big mono ${remaining != null && remaining <= s.leadSec * 1000 ? "urgent" : ""}`}>{fmtRemaining(remaining)}</div></div>
        <StatusDot tone={status.tone}>{status.text}</StatusDot>
        <div className="row-buttons"><button className="icon-btn danger" aria-label={`${s.name} 삭제`} title="삭제" onClick={() => {
          setRegion(`skill:${s.id}`, null);
          profileStore.set((p) => ({ ...p, skills: p.skills.filter((x) => x.id !== s.id) }));
        }}>🗑</button></div>
      </div>
      <details className="row-sub compact-settings"><summary>설정</summary>
        <AlertSettings compact value={s.alert} onChange={(alert) => updateSkill(s.id, { alert })} speech={leadText(shortName(s.name), s.leadSec)} lead={{ value: s.leadSec, onChange: (leadSec) => updateSkill(s.id, { leadSec }) }} />
      </details>
    </div>
  );
}
