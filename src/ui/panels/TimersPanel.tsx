import { useState } from "react";
import { liveStore, resetTimerAlert } from "../../engine/engine";
import { leadText } from "../../alerts/speech";
import { TIMER_PRESETS, TIMER_QUICK_SECS, newTimer, profileStore, shortName, updateTimer, type TimerEntry } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { ItemIcon, LeadSelect, NumberInput, Panel, StatusDot, Toggle, durationLabel, fmtRemaining } from "../common";

export function startTimer(t: TimerEntry, now = Date.now()) {
  if (!t.enabled) return;
  const remaining = t.pausedRemainingMs ?? t.durationSec * 1000;
  updateTimer(t.id, { endsAt: now + remaining, pausedRemainingMs: null });
  if (t.pausedRemainingMs == null) resetTimerAlert(t.id);
}
export function pauseTimer(t: TimerEntry, now = Date.now()) {
  if (t.endsAt == null) return;
  updateTimer(t.id, { endsAt: null, pausedRemainingMs: Math.max(0, t.endsAt - now) });
}
export function resetTimer(t: TimerEntry) {
  updateTimer(t.id, { endsAt: null, pausedRemainingMs: null });
  resetTimerAlert(t.id);
}

export function TimersPanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const timers = profileStore.use((p) => p.timers);
  const [preset, setPreset] = useState(0);
  return (
    <Panel
      title="일반 타이머"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      actions={
        <>
          <button onClick={() => timers.forEach((t) => t.endsAt == null && startTimer(t))}>전체 시작</button>
          <button onClick={() => timers.forEach((t) => pauseTimer(t))}>전체 일시정지</button>
          <button onClick={() => timers.forEach(resetTimer)}>전체 초기화</button>
          <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
            {TIMER_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
            <option value={-1}>직접 입력</option>
          </select>
          <button
            onClick={() =>
              profileStore.set((s) => ({
                ...s,
                timers: [...s.timers, newTimer(preset >= 0 ? TIMER_PRESETS[preset] : { name: "타이머", sec: 300 })],
              }))
            }
          >
            + 추가
          </button>
        </>
      }
    >
      {timers.length === 0 && <div className="empty">타이머가 없어요.</div>}
      {timers.map((t) => (
        <TimerRow key={t.id} t={t} />
      ))}
    </Panel>
  );
}

/** 타이머 알림 시점: 긴 타이머가 많아서 분 단위도 고를 수 있게 */
const TIMER_LEADS = [0, 5, 10, 30, 60, 120, 300];

function TimerRow({ t }: { t: TimerEntry }) {
  const now = liveStore.use((l) => l.now);
  const buffs = profileStore.use((p) => p.buffs);
  const remaining = t.endsAt != null ? t.endsAt - now : t.pausedRemainingMs ?? t.durationSec * 1000;
  const running = t.endsAt != null;
  const paused = !running && t.pausedRemainingMs != null;
  const urgent = running && remaining <= t.leadSec * 1000;
  const minutes = Math.floor(t.durationSec / 60);
  const seconds = t.durationSec % 60;
  const quick = TIMER_QUICK_SECS.includes(t.durationSec);
  const [custom, setCustom] = useState(!quick);
  const setEnabled = (v: boolean) => {
    if (!v) resetTimer(t);
    updateTimer(t.id, { enabled: v });
  };
  const expiryBuffs = buffs.filter((b) => b.kind === "expiry");

  return (
    <div className={`row ${t.enabled ? "" : "row-off"}`}>
      <div className="row-main">
        <Toggle checked={t.enabled} onChange={setEnabled} />
        <ItemIcon fallback="⏰" />
        <div className="row-title">
          <input className="name-input" value={t.name} aria-label="타이머 이름" onChange={(e) => updateTimer(t.id, { name: e.target.value })} />
        </div>
        <div className="cell">
          <div className="cell-label">시간</div>
          <select
            aria-label="타이머 시간"
            value={custom ? "custom" : t.durationSec}
            onChange={(e) => {
              if (e.target.value === "custom") setCustom(true);
              else {
                setCustom(false);
                updateTimer(t.id, { durationSec: Number(e.target.value) });
              }
            }}
          >
            {TIMER_QUICK_SECS.map((sec) => (
              <option key={sec} value={sec}>
                {durationLabel(sec)}
              </option>
            ))}
            <option value="custom">직접 입력</option>
          </select>
        </div>
        <div className="cell">
          <div className="cell-label">남은 시간</div>
          <div className={`cell-value big mono ${urgent ? "urgent" : ""}`}>{fmtRemaining(remaining)}</div>
        </div>
        <StatusDot tone={!t.enabled ? "idle" : running ? (urgent ? "alert" : "ok") : paused ? "warn" : "idle"}>
          {!t.enabled ? "꺼짐" : running ? "진행 중" : paused ? "일시정지" : "대기"}
        </StatusDot>
        <div className="row-buttons">
          {running ? (
            <button onClick={() => pauseTimer(t)}>⏸ 일시정지</button>
          ) : (
            <button className="primary" disabled={!t.enabled} onClick={() => startTimer(t)}>
              ▶ {paused ? "재개" : "시작"}
            </button>
          )}
          <button onClick={() => resetTimer(t)}>↺ 처음으로</button>
          <button
            className="icon-btn danger"
            aria-label="삭제"
            title="삭제"
            onClick={() => {
              if (!confirm(`'${t.name}' 타이머를 삭제할까요?`)) return;
              profileStore.set((p) => ({ ...p, timers: p.timers.filter((x) => x.id !== t.id) }));
            }}
          >
            🗑
          </button>
        </div>
      </div>
      <div className="row-sub">
        <AlertSettings value={t.alert} onChange={(alert) => updateTimer(t.id, { alert })} speech={leadText(shortName(t.name), t.leadSec)} />
        <div className="field-row">
          <span className="field-label">알림 시점</span>
          <LeadSelect value={t.leadSec} options={TIMER_LEADS} onChange={(leadSec) => updateTimer(t.id, { leadSec })} />
          {custom && (
            <>
              <span className="field-label">시간</span>
              <NumberInput value={minutes} min={0} max={1440} suffix="분" width={56} onChange={(v) => updateTimer(t.id, { durationSec: Math.max(1, v * 60 + seconds) })} />
              <NumberInput value={seconds} min={0} max={59} suffix="초" width={48} onChange={(v) => updateTimer(t.id, { durationSec: Math.max(1, minutes * 60 + v) })} />
            </>
          )}
          <Toggle checked={t.autoRestart} onChange={(v) => updateTimer(t.id, { autoRestart: v })} label="끝나면 다시 시작" />
          {expiryBuffs.length > 0 && (
            <>
              <span className="field-label">버프 연계</span>
              <select value={t.linkedBuffId ?? ""} onChange={(e) => updateTimer(t.id, { linkedBuffId: e.target.value || null })}>
                <option value="">사용 안 함</option>
                {expiryBuffs.map((b) => (
                  <option key={b.id} value={b.id}>
                    '{b.name}' 아이콘이 뜨면 자동 시작
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
