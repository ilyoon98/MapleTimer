import { useState } from "react";
import { liveStore } from "../../engine/engine";
import { profileStore, setRegion, type RuneSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { RUNE_TEXT } from "../../alerts/speech";
import { DebugCrop, Panel, StatusDot, Toggle, fmtClock } from "../common";
import { openPicker } from "../pickerStore";

const STATUS: Record<string, { tone: "ok" | "warn" | "alert" | "idle" | "info"; text: string }> = {
  off: { tone: "idle", text: "꺼짐" },
  "no-share": { tone: "warn", text: "화면 공유 필요" },
  "no-region": { tone: "warn", text: "미니맵 영역 선택 필요" },
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
  const [open, setOpen] = useState(false);
  const st = STATUS[live.status];

  const pickRegion = () =>
    openPicker({
      title: "미니맵 영역 선택",
      guide: [
        "미니맵의 헤더·버튼·필터 창은 빼고, 안쪽 지도 부분만 선택하세요.",
        "맵마다 미니맵 크기가 달라요. 마을이 아닌 실제 사냥터에서 선택해 주세요.",
      ],
      initial: region,
      onConfirm: ({ region }) => setRegion("minimap", region),
    });

  return (
    <Panel title="룬 알림" collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${rune.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={rune.enabled} onChange={(v) => setRune({ enabled: v })} />
          <div className="row-title">
            <div className="name">룬 감지</div>
            <div className="sub">미니맵에 룬이 뜨면 알려요</div>
          </div>
          <div className="cell">
            <div className="cell-label">후보</div>
            <div className="cell-value">{live.boxes.length}개</div>
          </div>
          <div className="cell">
            <div className="cell-label">마지막 알림</div>
            <div className="cell-value mono">{fmtClock(live.lastAlertAt)}</div>
          </div>
          <StatusDot tone={st.tone}>{st.text}</StatusDot>
          <div className="row-buttons">
            <button onClick={pickRegion}>{region ? "미니맵 다시 선택" : "미니맵 선택"}</button>
            <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="설정 펼치기">
              {open ? "▴" : "▾"}
            </button>
          </div>
        </div>
        {open && (
          <div className="row-detail">
            <div className="detail-grid">
              <div>
                <AlertSettings value={rune.alert} onChange={(alert) => setRune({ alert })} speech={RUNE_TEXT} />
              </div>
              <div className="diag">
                <div className="diag-title">지금 미니맵 (초록 상자 = 찾은 룬)</div>
                <DebugCrop cropKey="minimap" boxes={live.boxes} maxWidth={320} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
