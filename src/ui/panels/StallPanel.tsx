import { panelIcon } from "../gameArt";
import { screenCapture } from "../../capture/screenCapture";
import { stallRegion } from "../../capture/detectionRegions";
import { liveStore } from "../../engine/engine";
import { STALL_DEFAULT_SEC, STALL_RANGE, profileStore, setRegion, type StallMode, type StallSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { STALL_TEXT } from "../../alerts/speech";
import { NumberInput, Panel, StatusDot, Toggle, fmtClock, NOT_CONNECTED } from "../common";
import { STALL_MODES, pickStallRegion } from "../pickers";
import { SPECIAL_CORE_ENABLED } from "../../state/features";

const MODES = STALL_MODES;

const STATUS: Record<string, { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string }> = {
  off: { tone: "idle", text: "꺼짐" },
  "no-share": NOT_CONNECTED,
  "no-region": { tone: "info", text: "영역 찾는 중 · 필요하면 직접 지정" },
  waiting: { tone: "info", text: "첫 변화 기다리는 중" },
  watching: { tone: "ok", text: "감시 중" },
  stalled: { tone: "alert", text: "멈춤!" },
  gated: { tone: "idle", text: "연계 버프 없음 · 쉬는 중" },
};

function setStall(patch: Partial<StallSettings>) {
  profileStore.set((p) => ({ ...p, stall: { ...p.stall, ...patch } }));
}

export function StallPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const st = profileStore.use((p) => p.stall);
  const allBuffs = profileStore.use((p) => p.buffs);
  const buffs = allBuffs.filter(b=>SPECIAL_CORE_ENABLED||b.kind!=="cooldown");
  const p = profileStore.use((p) => p);
  const region = stallRegion(p, screenCapture.width, screenCapture.height);
  const live = liveStore.use((l) => l.stall);
  const s = STATUS[live.status];
  const [lo, hi] = STALL_RANGE[st.mode];

  const pickRegion = pickStallRegion;

  return (
    <Panel id="stall" title="사냥 멈춤 알림" icon={panelIcon("stall", "🐾")} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${st.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={st.enabled} onChange={(v) => setStall({ enabled: v })} />
          <div className="row-title">
            <select
              value={st.mode}
              onChange={(e) => {
                const mode = e.target.value as StallMode;
                setStall({ mode, thresholdSec: STALL_DEFAULT_SEC[mode] });
                setRegion("stall", null);
              }}
            >
              {(Object.keys(MODES) as StallMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODES[m].label}
                </option>
              ))}
            </select>
          </div>
          <div className="cell">
            <div className="cell-label">안 바뀌면 알림</div>
            <div className="cell-value">
              <NumberInput value={st.thresholdSec} min={lo} max={hi} suffix="초" width={48} onChange={(v) => setStall({ thresholdSec: v })} />
            </div>
          </div>
          <div className="cell">
            <div className="cell-label">변화 없음</div>
            <div className={`cell-value big mono ${live.status === "stalled" ? "urgent" : ""}`}>
              {live.status === "watching" || live.status === "stalled" ? `${Math.floor(live.idleMs / 1000)}초` : "--"}
            </div>
          </div>
          <div className="cell">
            <div className="cell-label">마지막 알림</div>
            <div className="cell-value mono">{fmtClock(live.lastAlertAt)}</div>
          </div>
          <StatusDot tone={s.tone}>{s.text}</StatusDot>
          <div className="row-buttons">
            <button onClick={pickRegion}>{st.mode === "exp" ? "높이 조정" : region ? "영역 다시 선택" : "영역 선택"}</button>
            {st.mode === "exp" && st.expHeightRatio != null && <button onClick={() => setStall({ expHeightRatio: null })}>기본 높이</button>}
          </div>
        </div>
        <details className="row-sub compact-settings"><summary>설정</summary>
          <AlertSettings value={st.alert} onChange={(alert) => setStall({ alert })} speech={STALL_TEXT} />
          {buffs.length > 0 && (
            <div className="field-row">
              <span className="field-label">버프 연계</span>
              <select value={st.linkedBuffId ?? ""} onChange={(e) => setStall({ linkedBuffId: e.target.value || null })}>
                <option value="">사용 안 함</option>
                {buffs.map((b) => (
                  <option key={b.id} value={b.id}>
                    '{b.name}' 버프가 있을 때만 감시
                  </option>
                ))}
              </select>
            </div>
          )}
        </details>
      </div>
    </Panel>
  );
}
