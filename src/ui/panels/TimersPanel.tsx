import { useState } from "react";
import { liveStore, resetTimerAlert } from "../../engine/engine";
import { TIMER_PRESETS, newTimer, profileStore, updateTimer, type TimerEntry } from "../../state/profile";
import { AlertSettings } from "../AlertSettings";
import { NumberInput, Panel, StatusDot, Toggle, fmtRemaining, leadLabel } from "../common";

export function startTimer(t: TimerEntry, now = Date.now()) {
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

function TimerRow({ t }: { t: TimerEntry }) {
  const [open, setOpen] = useState(false);
  const now = liveStore.use((l) => l.now);
  const buffs = profileStore.use((p) => p.buffs);
  const remaining = t.endsAt != null ? t.endsAt - now : t.pausedRemainingMs ?? t.durationSec * 1000;
  const running = t.endsAt != null;
  const paused = !running && t.pausedRemainingMs != null;
  const urgent = running && remaining <= t.leadSec * 1000;
  const minutes = Math.floor(t.durationSec / 60);
  const seconds = t.durationSec % 60;

  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">
          <div className="name">{t.name}</div>
          <div className="sub">
            {fmtRemaining(t.durationSec * 1000)} · {leadLabel(t.leadSec)} 알림{t.autoRestart ? " · 자동 반복" : ""}
            {t.linkedBuffId ? " · 버프 연계" : ""}
          </div>
        </div>
        <div className="cell">
          <div className="cell-label">남은 시간</div>
          <div className={`cell-value huge mono ${urgent ? "urgent" : ""}`}>{fmtRemaining(remaining)}</div>
        </div>
        <StatusDot tone={running ? (urgent ? "alert" : "ok") : paused ? "warn" : "idle"}>
          {running ? "진행 중" : paused ? "일시정지" : "대기"}
        </StatusDot>
        <div className="row-buttons">
          {running ? (
            <button onClick={() => pauseTimer(t)}>⏸ 일시정지</button>
          ) : (
            <button className="primary" onClick={() => startTimer(t)}>
              ▶ {paused ? "재개" : "시작"}
            </button>
          )}
          <button onClick={() => resetTimer(t)}>↺ 초기화</button>
          <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="설정 펼치기">
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {open && (
        <div className="row-detail">
          <div className="field-row">
            <span className="field-label">이름</span>
            <input value={t.name} onChange={(e) => updateTimer(t.id, { name: e.target.value })} />
            <span className="field-label">시간</span>
            <NumberInput value={minutes} min={0} max={1440} suffix="분" width={56} onChange={(v) => updateTimer(t.id, { durationSec: Math.max(1, v * 60 + seconds) })} />
            <NumberInput value={seconds} min={0} max={59} suffix="초" width={48} onChange={(v) => updateTimer(t.id, { durationSec: Math.max(1, minutes * 60 + v) })} />
          </div>
          <div className="field-row">
            <span className="field-label">알림 시점</span>
            <NumberInput value={t.leadSec} min={-5} max={600} suffix="초 전" onChange={(v) => updateTimer(t.id, { leadSec: v })} />
            <Toggle checked={t.autoRestart} onChange={(v) => updateTimer(t.id, { autoRestart: v })} label="끝나면 자동으로 다시 시작" />
          </div>
          <div className="field-row">
            <span className="field-label">버프 연계</span>
            <select value={t.linkedBuffId ?? ""} onChange={(e) => updateTimer(t.id, { linkedBuffId: e.target.value || null })}>
              <option value="">사용 안 함</option>
              {buffs
                .filter((b) => b.kind === "expiry")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    '{b.name}' 아이콘이 나타나면 자동 시작
                  </option>
                ))}
            </select>
            {t.linkedBuffId && (
              <Toggle
                checked={!!t.pauseWithoutBuff}
                onChange={(v) => updateTimer(t.id, { pauseWithoutBuff: v })}
                label="버프가 사라지면 일시정지, 다시 뜨면 이어서"
              />
            )}
          </div>
          <AlertSettings value={t.alert} onChange={(alert) => updateTimer(t.id, { alert })} />
          <div className="field-row">
            <button
              className="danger"
              onClick={() => {
                if (!confirm(`'${t.name}' 타이머를 삭제할까요?`)) return;
                profileStore.set((p) => ({ ...p, timers: p.timers.filter((x) => x.id !== t.id) }));
              }}
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
