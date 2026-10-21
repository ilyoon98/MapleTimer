import { useState } from "react";
import { lastBoosterSegment, liveStore } from "../../engine/engine";
import { teachDigits } from "../teachDigits";
import { profileStore, setRegion, type BoosterSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { DebugCrop, NumberInput, Panel, StatusDot, Toggle, fmtClock, fmtRemaining, leadLabel } from "../common";
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
  const [open, setOpen] = useState(false);
  const st = STATUS[live.status];
  const remaining = live.endsAt != null ? live.endsAt - now : null;

  const pickRegion = () =>
    openPicker({
      title: "부스터 타이머 영역 선택",
      guide: [
        "부스터(VIP·HEXA 등)를 쓰면 화면 위쪽 가운데에 뜨는 남은 시간 숫자를 선택하세요.",
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
          <div className="row-title">
            <div className="name">부스터 타이머</div>
            <div className="sub">화면 위쪽 남은 시간 숫자를 읽어요</div>
          </div>
          <div className="cell">
            <div className="cell-label">알림 시점</div>
            <div className="cell-value">{leadLabel(b.leadSec)}</div>
          </div>
          <div className="cell">
            <div className="cell-label">읽은 값</div>
            <div className="cell-value mono">{live.readText ?? "--"}</div>
          </div>
          <div className="cell">
            <div className="cell-label">남은 시간</div>
            <div className={`cell-value big mono ${remaining != null && remaining <= b.leadSec * 1000 ? "urgent" : ""}`}>
              {fmtRemaining(remaining)}
            </div>
          </div>
          <div className="cell">
            <div className="cell-label">마지막 알림</div>
            <div className="cell-value mono">{fmtClock(live.lastAlertAt)}</div>
          </div>
          <StatusDot tone={st.tone}>{st.text}</StatusDot>
          <div className="row-buttons">
            <button onClick={pickRegion}>{region ? "영역 다시 선택" : "영역 선택"}</button>
            <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="설정 펼치기">
              {open ? "▴" : "▾"}
            </button>
          </div>
        </div>
        {open && (
          <div className="row-detail">
            <div className="detail-grid">
              <div>
                <div className="field-row">
                  <span className="field-label">알림 시점</span>
                  <NumberInput value={b.leadSec} min={-5} max={60} suffix="초 전" onChange={(v) => setBooster({ leadSec: v })} />
                </div>
                <AlertSettings value={b.alert} onChange={(alert) => setBooster({ alert })} />
              </div>
              <div className="diag">
                <div className="diag-title">진단</div>
                <DebugCrop cropKey="booster" maxWidth={320} />
                <p className="muted small">
                  부스터 숫자는 쿨타임 숫자와 글꼴이 다를 수 있어요. 읽은 값이 비어 있거나 틀리면, 숫자가 보일 때 아래 버튼으로 화면 숫자를 직접
                  입력해 가르쳐 주세요 (2~3번이면 충분해요).
                </p>
                <div className="field-row">
                  <button onClick={() => teachDigits(lastBoosterSegment, "부스터 타이머")}>지금 보이는 숫자 가르치기</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
