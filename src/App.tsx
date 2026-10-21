import { useEffect, useState } from "react";
import { audioEngine } from "./alerts/audio";
import { screenCapture } from "./capture/screenCapture";
import { liveStore, startEngine, stopRingingAlerts } from "./engine/engine";
import { profileStore, type PanelId } from "./state/profile";
import { fmtClock, Toggle } from "./ui/common";
import { closePicker, pickerStore } from "./ui/pickerStore";
import { BuffsPanel } from "./ui/panels/BuffsPanel";
import { RunePanel } from "./ui/panels/RunePanel";
import { SkillsPanel } from "./ui/panels/SkillsPanel";
import { StallPanel } from "./ui/panels/StallPanel";
import { TimersPanel } from "./ui/panels/TimersPanel";
import { closePip, openPip, pipStore, pipSupported } from "./ui/Pip";
import { RegionPicker } from "./ui/RegionPicker";
import { GuideModal, SettingsModal } from "./ui/SettingsModal";
import { SetupChecklist } from "./ui/SetupChecklist";

const PANELS: Record<PanelId, (p: { collapsed: boolean; onToggleCollapse: () => void }) => React.ReactNode> = {
  skills: (p) => <SkillsPanel {...p} />,
  rune: (p) => <RunePanel {...p} />,
  stall: (p) => <StallPanel {...p} />,
  buffs: (p) => <BuffsPanel {...p} />,
  timers: (p) => <TimersPanel {...p} />,
};

function useCaptureState() {
  const [, force] = useState(0);
  useEffect(() => {
    const off = screenCapture.onChange(() => force((n) => n + 1));
    return () => {
      off();
    };
  }, []);
  return { state: screenCapture.state, w: screenCapture.width, h: screenCapture.height };
}

/** 공유 중인 화면 한 장을 PNG 로 내려받는다 (실제 게임 화면으로 기준값을 맞출 때 사용) */
function saveFrame() {
  const c = screenCapture.snapshot();
  if (!c) return;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `maple-frame-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
}

function ShareChip() {
  const cap = useCaptureState();
  const stale = liveStore.use((s) => s.captureStale);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    setErr(null);
    audioEngine.unlock();
    try {
      await screenCapture.start();
    } catch (e) {
      const name = (e as Error).name;
      if (name !== "NotAllowedError") setErr((e as Error).message);
    }
  };
  if (cap.state === "live")
    return (
      <div className={`share-chip share-live ${stale ? "share-stale" : ""}`}>
        <span className="dot" /> {stale ? "화면이 멈춤 (게임 창 최소화?)" : "화면 공유 중"}{" "}
        {cap.w > 0 && <span className="mono">{cap.w}×{cap.h}</span>}
        <button title="지금 공유 중인 게임 화면을 PNG 로 저장 (감지 기준 조정용)" onClick={saveFrame}>
          화면 저장
        </button>
        <button onClick={start}>다른 창 선택</button>
        <button onClick={() => screenCapture.stop("user")}>중지</button>
      </div>
    );
  return (
    <div className="share-chip share-off">
      <span className="dot" /> {cap.state === "starting" ? "선택 대기 중…" : cap.state === "ended" ? "화면 공유가 끝났어요" : "화면 공유 필요"}
      <button className="primary" onClick={start} disabled={cap.state === "starting"}>
        화면 공유 시작
      </button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}

function AlertLog() {
  const log = liveStore.use((s) => s.log);
  if (!log.length) return <span className="muted">아직 알림 없음</span>;
  return (
    <span className="alert-log">
      최근 알림:{" "}
      {log.slice(0, 4).map((e, i) => (
        <span key={i} className="log-item">
          {fmtClock(e.at)} {e.label}
        </span>
      ))}
    </span>
  );
}

export function App() {
  const order = profileStore.use((p) => p.panelOrder);
  const collapsed = profileStore.use((p) => p.collapsed);
  const masterVolume = profileStore.use((p) => p.masterVolume);
  const randomDelay = profileStore.use((p) => p.randomDelay);
  const muted = profileStore.use((p) => p.muted);
  const theme = profileStore.use((p) => p.theme);
  const ringing = liveStore.use((s) => s.ringing);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const picker = pickerStore.use((s) => s.req);
  const pipOpen = pipStore.use((s) => s.open);
  const [modal, setModal] = useState<"settings" | "guide" | null>(null);
  const [editOrder, setEditOrder] = useState(false);

  useEffect(() => {
    startEngine();
    const unlock = () => audioEngine.unlock();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const move = (id: PanelId, d: -1 | 1) =>
    profileStore.set((p) => {
      const o = [...p.panelOrder];
      const i = o.indexOf(id);
      const j = i + d;
      if (j < 0 || j >= o.length) return p;
      [o[i], o[j]] = [o[j], o[i]];
      return { ...p, panelOrder: o };
    });

  return (
    <div className="app">
      <header className="app-head">
        <h1>메이플 타이머</h1>
        <span className="badge">개인용</span>
        <span className="spacer" />
        <button onClick={() => setModal("guide")}>사용 방법</button>
        {pipSupported() && (
          <button onClick={() => (pipOpen ? closePip() : openPip())}>{pipOpen ? "PIP 닫기" : "PIP 타이머"}</button>
        )}
        <button onClick={() => setModal("settings")}>설정</button>
        <ShareChip />
      </header>

      <div className="toolbar">
        <label className="volume">
          마스터 볼륨
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(masterVolume * 100)}
            onChange={(e) => profileStore.set({ masterVolume: Number(e.target.value) / 100 })}
          />
          <span className="mono">{Math.round(masterVolume * 100)}%</span>
        </label>
        <Toggle checked={randomDelay} onChange={(v) => profileStore.set({ randomDelay: v })} label="랜덤 지연 (첫 알림 0~2초)" />
        <Toggle checked={muted} onChange={(v) => profileStore.set({ muted: v })} label="모든 알림 소리 끄기" />
        {ringing.length > 0 && (
          <button className="ringing-btn" onClick={stopRingingAlerts} title="지금 울리는 알림과 남은 반복을 멈춰요">
            🔕 알림 멈춤 ({ringing.join(", ")})
          </button>
        )}
        <span className="spacer" />
        <AlertLog />
        <button onClick={() => setEditOrder(!editOrder)}>{editOrder ? "순서 편집 끝" : "순서 편집"}</button>
      </div>

      <SetupChecklist />

      <main className="panels">
        {order.map((id) => (
          <div key={id} className="panel-slot">
            {editOrder && (
              <div className="order-controls">
                <button onClick={() => move(id, -1)}>▲</button>
                <button onClick={() => move(id, 1)}>▼</button>
              </div>
            )}
            {PANELS[id]({
              collapsed: !!collapsed[id],
              onToggleCollapse: () => profileStore.set((p) => ({ ...p, collapsed: { ...p.collapsed, [id]: !p.collapsed[id] } })),
            })}
          </div>
        ))}
      </main>

      <footer className="app-foot muted small">
        공유한 화면은 이 브라우저 안에서만 분석되고 어디에도 전송되지 않아요. 설정은 이 브라우저에 저장돼요. · 비공식 개인용 도구 · MapleStory 및
        관련 저작물의 권리는 ㈜넥슨코리아에 있습니다.
      </footer>

      {picker && (
        <RegionPicker
          title={picker.title}
          guide={picker.guide}
          within={picker.within}
          initial={picker.initial}
          onClose={closePicker}
          onConfirm={(r) => {
            picker.onConfirm(r);
            closePicker();
          }}
        />
      )}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {modal === "guide" && <GuideModal onClose={() => setModal(null)} />}
    </div>
  );
}
