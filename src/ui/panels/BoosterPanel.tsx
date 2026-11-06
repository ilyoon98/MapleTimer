import { panelIcon } from "../gameArt";
import { liveStore } from "../../engine/engine";
import { profileStore, type BoosterSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { leadText } from "../../alerts/speech";
import { Panel, StatusDot, Toggle, fmtClock, fmtRemaining, NOT_CONNECTED } from "../common";

const STATUS: Record<string, { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string }> = {
  off: { tone: "idle", text: "꺼짐" },
  "no-share": NOT_CONNECTED,
  "no-region": { tone: "info", text: "부스터 자동 탐색 중" },
  searching: { tone: "info", text: "타이머 찾는 중" },
  reading: { tone: "info", text: "숫자 확인 중" },
  running: { tone: "ok", text: "부스터 진행 중" },
};

function setBooster(patch: Partial<BoosterSettings>) {
  profileStore.set((p) => ({ ...p, booster: { ...p.booster, ...patch } }));
}

export function BoosterPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const b = profileStore.use((p) => p.booster);
  const live = liveStore.use((l) => l.booster);
  const now = liveStore.use((l) => l.now);
  const st = STATUS[live.status];
  const remaining = live.endsAt != null ? live.endsAt - now : null;

  return (
    <Panel title="부스터 종료 알림" icon={panelIcon("booster", "🚀")} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${b.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={b.enabled} onChange={(v) => setBooster({ enabled: v })} />
          <div className="row-title">
            <div className="name">부스터 타이머</div>
          </div>
          <div className="cell">
            <div className="cell-label">남은 시간</div>
            <div className={`cell-value big mono ${remaining != null && remaining <= b.leadSec * 1000 ? "urgent" : ""}`}>{fmtRemaining(remaining)}</div>
          </div>
          <div className="cell">
            <div className="cell-label">마지막 알림</div>
            <div className="cell-value mono">{fmtClock(live.lastAlertAt)}</div>
          </div>
          <StatusDot tone={st.tone}>{st.text}</StatusDot>

        </div>
        <details className="row-sub compact-settings"><summary>설정</summary>
          <AlertSettings
            value={b.alert}
            onChange={(alert) => setBooster({ alert })}
            speech={leadText("부스터", b.leadSec)}
            lead={{ value: Math.max(0, b.leadSec), onChange: (leadSec) => setBooster({ leadSec }) }}
          />
        </details>
      </div>
    </Panel>
  );
}
