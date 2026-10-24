import { liveStore } from "../../engine/engine";
import { STALL_DEFAULT_SEC, STALL_RANGE, profileStore, setRegion, type StallMode, type StallSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { STALL_TEXT } from "../../alerts/speech";
import { ItemIcon, NumberInput, Panel, StatusDot, Toggle, fmtClock } from "../common";
import { openPicker } from "../pickerStore";

const MODES: Record<StallMode, { label: string; guide: string[] }> = {
  exp: {
    label: "경험치 인식",
    guide: [
      "화면 아래 경험치바에서 경험치 숫자와 % 가 보이는 부분을 선택하세요.",
      "사냥 중 경험치가 오르면 이 영역이 바뀌고, 일정 시간 안 바뀌면 멈춘 것으로 봐요.",
    ],
  },
  cooldown: {
    label: "쿨타임 인식",
    guide: [
      "사냥 중 계속 쓰는 짧은 쿨타임 스킬의 퀵슬롯 아이콘을 선택하세요.",
      "아이콘(쿨타임 표시)이 일정 시간 안 바뀌면 멈춘 것으로 봐요.",
    ],
  },
  mana: {
    label: "마나 인식",
    guide: [
      "MP 숫자와 MP 바만 선택하세요 (HP 는 빼고).",
      "MP 가 일정 시간 안 바뀌면 멈춘 것으로 봐요. 마을에서 MP 가 자연 회복되면 변화로 칠 수 있어요.",
    ],
  },
};

const STATUS: Record<string, { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string }> = {
  off: { tone: "idle", text: "꺼짐" },
  "no-share": { tone: "warn", text: "화면 공유 필요" },
  "no-region": { tone: "warn", text: "영역 선택 필요" },
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
  const buffs = profileStore.use((p) => p.buffs);
  const region = profileStore.use((p) => p.regions.stall);
  const live = liveStore.use((l) => l.stall);
  const s = STATUS[live.status];
  const [lo, hi] = STALL_RANGE[st.mode];

  const pickRegion = () =>
    openPicker({
      title: `사냥 멈춤 · ${MODES[st.mode].label} 영역 선택`,
      guide: MODES[st.mode].guide,
      initial: region,
      onConfirm: ({ region }) => setRegion("stall", region),
    });

  return (
    <Panel title="사냥 멈춤 알림" collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${st.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={st.enabled} onChange={(v) => setStall({ enabled: v })} />
          <ItemIcon fallback="🐾" />
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
            <button onClick={pickRegion}>{region ? "영역 다시 선택" : "영역 선택"}</button>
          </div>
        </div>
        <div className="row-sub">
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
        </div>
      </div>
    </Panel>
  );
}
