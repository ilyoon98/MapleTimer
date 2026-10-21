import { useState } from "react";
import { storeTemplate } from "../../cv/match";
import { DEFAULT_RUNE_COLOR } from "../../detect/rune";
import { liveStore } from "../../engine/engine";
import { profileStore, setRegion, type RuneSettings } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { DebugCrop, NumberInput, Panel, StatusDot, Toggle, fmtClock } from "../common";
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

  const pickTemplate = () =>
    openPicker({
      title: "룬 아이콘 등록",
      guide: [
        "룬이 미니맵에 떠 있을 때 열어 주세요. (안 떠 있으면 '3초 후 가져오기'를 활용)",
        "룬 아이콘 하나만 딱 맞게 작게 선택하세요. 캐릭터 표시와 겹치지 않은 순간이 좋아요.",
      ],
      within: region,
      onConfirm: ({ pixels }) => setRune({ template: storeTemplate(pixels, false), mode: "template" }),
    });

  return (
    <Panel title="룬 알림" collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className={`row ${rune.enabled ? "" : "row-off"}`}>
        <div className="row-main">
          <Toggle checked={rune.enabled} onChange={(v) => setRune({ enabled: v })} />
          <div className="row-title">
            <div className="name">룬 감지</div>
            <div className="sub">{rune.mode === "template" && rune.template ? "등록한 룬 아이콘으로 찾기" : "색상으로 찾기"}</div>
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
            <button onClick={pickTemplate} disabled={!region}>
              룬 아이콘 등록
            </button>
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
                  <span className="field-label">찾는 방식</span>
                  <select value={rune.mode} onChange={(e) => setRune({ mode: e.target.value as RuneSettings["mode"] })}>
                    <option value="template" disabled={!rune.template}>
                      등록한 룬 아이콘 (권장)
                    </option>
                    <option value="color">색상</option>
                  </select>
                  {rune.template && (
                    <button onClick={() => setRune({ template: null, mode: "color" })}>등록한 아이콘 지우기</button>
                  )}
                </div>
                {rune.mode === "template" ? (
                  <div className="field-row">
                    <span className="field-label">일치 기준</span>
                    <NumberInput
                      value={rune.templateMinScore}
                      min={0.5}
                      max={0.99}
                      step={0.01}
                      onChange={(v) => setRune({ templateMinScore: v })}
                    />
                    <span className="muted">높일수록 엄격 (오탐이 많으면 올리고, 못 찾으면 내리세요)</span>
                  </div>
                ) : (
                  <>
                    <div className="field-row">
                      <span className="field-label">색상(H)</span>
                      <NumberInput value={rune.color.hueMin} min={0} max={360} onChange={(v) => setRune({ color: { ...rune.color, hueMin: v } })} />
                      ~
                      <NumberInput value={rune.color.hueMax} min={0} max={360} onChange={(v) => setRune({ color: { ...rune.color, hueMax: v } })} />
                      <span className="field-label">채도≥</span>
                      <NumberInput value={rune.color.satMin} min={0} max={1} step={0.05} onChange={(v) => setRune({ color: { ...rune.color, satMin: v } })} />
                      <span className="field-label">명도≥</span>
                      <NumberInput value={rune.color.valMin} min={0} max={1} step={0.05} onChange={(v) => setRune({ color: { ...rune.color, valMin: v } })} />
                    </div>
                    <div className="field-row">
                      <span className="field-label">크기</span>
                      <NumberInput value={rune.color.minArea} min={1} max={400} suffix="px 이상" onChange={(v) => setRune({ color: { ...rune.color, minArea: v } })} />
                      <NumberInput value={rune.color.maxSide} min={2} max={100} suffix="px 이하" onChange={(v) => setRune({ color: { ...rune.color, maxSide: v } })} />
                      <button onClick={() => setRune({ color: { ...DEFAULT_RUNE_COLOR } })}>기본값</button>
                    </div>
                    <p className="muted small">
                      색상 방식은 보라색 배경·구조물이 많은 맵에서 오탐이 날 수 있어요. 룬이 떴을 때 '룬 아이콘 등록'을 해 두는 게 가장 정확해요.
                    </p>
                  </>
                )}
                <AlertSettings value={rune.alert} onChange={(alert) => setRune({ alert })} />
              </div>
              <div className="diag">
                <div className="diag-title">진단 (초록 상자 = 후보)</div>
                <DebugCrop cropKey="minimap" boxes={live.boxes} maxWidth={320} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
