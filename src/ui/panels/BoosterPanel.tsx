import { liveStore } from "../../engine/engine";
import { profileStore, setRegion, type BoosterSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { leadText } from "../../alerts/speech";
import { ItemIcon, LeadSelect, Panel, StatusDot, Toggle, fmtClock, fmtRemaining } from "../common";
import { openPicker } from "../pickerStore";

const STATUS: Record<string, { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string }> = {
  off: { tone: "idle", text: "꺼짐" },
  "no-share": { tone: "warn", text: "화면 공유 필요" },
  "no-region": { tone: "warn", text: "영역 선택 필요" },
  searching: { tone: "info", text: "타이머 찾는 중" },
  reading: { tone: "info", text: "숫자 확인 중" },
  running: { tone: "ok", text: "부스터 진행 중" },
};

function setBooster(patch: Partial<BoosterSettings>) {
  profileStore.set((p) => ({ ...p, booster: { ...p.booster, ...patch } }));
}

export function BoosterPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const b = profileStore.use((p) => p.booster);
  const region = profileStore.use((p) => p.regions.booster);
  const live = liveStore.use((l) => l.booster);
  const now = liveStore.use((l) => l.now);
  const st = STATUS[live.status];
  const remaining = live.endsAt != null ? live.endsAt - now : null;

  const pickRegion = () =>
    openPicker({
      title: "부스터 타이머 영역 선택",
      guide: [
        "부스터를 쓰면 화면 위쪽 가운데에 뜨는 '남은시간' 숫자(예: 36.83 초)를 선택하세요.",
        "부스터가 켜져 있을 때 열거나 '3초 후 가져오기'를 활용하세요. 숫자 주변을 조금 여유 있게 잡아 주세요.",
      ],
      initial: region,
      onConfirm: ({ region }) => setRegion("booster", region),
    });

  return (
    <Panel title="부스터 종료 알림" collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${b.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={b.enabled} onChange={(v) => setBooster({ enabled: v })} />
          <ItemIcon fallback="🚀" />
          <div className="row-title">
            <div className="name">부스터 타이머</div>
            <div className="sub">화면 위쪽 남은 시간 숫자를 읽어요</div>
          </div>
          <div className="cell">
            <div className="cell-label">알림 시점</div>
            <LeadSelect value={Math.max(0, b.leadSec)} onChange={(leadSec) => setBooster({ leadSec })} />
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
          <div className="row-buttons">
            <button onClick={pickRegion}>{region ? "영역 다시 선택" : "영역 선택"}</button>
          </div>
        </div>
        <div className="row-sub">
          <AlertSettings value={b.alert} onChange={(alert) => setBooster({ alert })} speech={leadText("부스터", b.leadSec)} />
        </div>
      </div>
    </Panel>
  );
}
