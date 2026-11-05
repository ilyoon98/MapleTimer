import { liveStore } from "../../engine/engine";
import { profileStore, type RuneSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { RUNE_TEXT } from "../../alerts/speech";
import { DebugCrop, Panel, StatusDot, Toggle, fmtClock, NOT_CONNECTED } from "../common";
import { RUNE_ICON } from "../gameArt";
import { pickMinimap } from "../pickers";

const STATUS: Record<string, { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string }> = {
  off: { tone: "idle", text: "꺼짐" },
  "no-share": NOT_CONNECTED,
  "no-region": { tone: "info", text: "미니맵 자동 탐색 중" },
  searching: { tone: "ok", text: "미니맵에서 룬 찾는 중" },
  candidate: { tone: "info", text: "룬 후보 확인 중" },
  present: { tone: "alert", text: "룬 있음!" },
  dark: { tone: "info", text: "맵 이동 중" },
};

function setRune(patch: Partial<RuneSettings>) {
  profileStore.set((p) => ({ ...p, rune: { ...p.rune, ...patch } }));
}

export function RunePanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const rune = profileStore.use((p) => p.rune);
  const region = profileStore.use((p) => p.regions.minimap);
  const live = liveStore.use((l) => l.rune);
  const st = STATUS[live.status];

  const pickRegion = pickMinimap;

  return (
    <Panel id="rune" title="룬 알림" icon={RUNE_ICON} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${rune.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={rune.enabled} onChange={(v) => setRune({ enabled: v })} />
          <div className="row-title">
            <div className="name">룬 감지</div>
          </div>
          <div className="cell">
            <div className="cell-label">찾은 룬</div>
            <div className="cell-value">{live.boxes.length}개</div>
          </div>
          <div className="cell">
            <div className="cell-label">마지막 알림</div>
            <div className="cell-value mono">{fmtClock(live.lastAlertAt)}</div>
          </div>
          <StatusDot tone={st.tone}>{st.text}</StatusDot>
          <div className="row-buttons">
            <button onClick={pickRegion}>{region ? "위치 변경" : "직접 지정"}</button>
          </div>
        </div>
        <details className="row-sub compact-settings"><summary>설정</summary>
          <AlertSettings value={rune.alert} onChange={(alert) => setRune({ alert })} speech={RUNE_TEXT} />
          {region && (
            <div className="field-row">
              <span className="field-label">지금 미니맵</span>
              <DebugCrop cropKey="minimap" boxes={live.boxes} maxWidth={240} />
              <span className="muted small">초록 상자 = 찾은 룬</span>
            </div>
          )}
        </details>
      </div>
    </Panel>
  );
}
