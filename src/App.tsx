import { useEffect, useState } from "react";
import { screenCapture } from "./capture/screenCapture";
import { liveStore, startEngine, stopRingingAlerts } from "./engine/engine";
import { profileStore, type PanelId } from "./state/profile";
import { persistenceStatus } from "./state/createStore";
import { SPECIAL_CORE_ENABLED } from "./state/features";
import { fmtClock } from "./ui/common";
import { closePicker, pickerStore } from "./ui/pickerStore";
import { BoosterPanel } from "./ui/panels/BoosterPanel";
import { BuffsPanel } from "./ui/panels/BuffsPanel";
import { RunePanel } from "./ui/panels/RunePanel";
import { SkillsPanel } from "./ui/panels/SkillsPanel";
import { StallPanel } from "./ui/panels/StallPanel";
import { TimersPanel } from "./ui/panels/TimersPanel";
import { closePip, openPip, pipStore, pipSupported } from "./ui/Pip";
import { RegionPicker } from "./ui/RegionPicker";
import { ReplayLoader } from "./dev/ReplayLoader";
import { GuideModal } from "./ui/Guide";
import { SettingsModal } from "./ui/SettingsModal";
import { SetupChecklist } from "./ui/SetupChecklist";
import { AppVersion, UpdateBanner } from "./ui/UpdateBanner";
import { CapturePicker } from "./ui/CapturePicker";
import { BuffLocationPicker } from "./ui/BuffLocationPicker";
import { buffLocationStore } from "./ui/buffLocationStore";
import { audioEngine } from "./alerts/audio";
import { connectMaple, connectStore, startCapture } from "./ui/connect";

const PANELS: Record<PanelId, (p: { collapsed: boolean; onToggleCollapse: () => void }) => React.ReactNode> = {
  skills: (p) => <SkillsPanel {...p} />,
  rune: (p) => <RunePanel {...p} />,
  stall: (p) => <StallPanel {...p} />,
  buffs: (p) => <BuffsPanel kind="expiry" {...p} />,
  core: (p) => <BuffsPanel kind="cooldown" {...p} />,
  booster: (p) => <BoosterPanel {...p} />,
  timers: (p) => <TimersPanel {...p} />,
};

/** 화면 테마: 자동(윈도우 설정 따라가기) → 어둡게 → 밝게 순서로 바꾼다 */
function ThemeButton() {
  const theme = profileStore.use((p) => p.theme);
  const next = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
  const label = theme === "system" ? "🖥 자동" : theme === "dark" ? "🌙 어둡게" : "☀ 밝게";
  return (
    <button title="화면 테마 바꾸기 (자동 = 윈도우 설정 따라가기)" onClick={() => profileStore.set({ theme: next })}>
      {label}
    </button>
  );
}

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

function ShareChip() {
  const cap = useCaptureState();
  const stale = liveStore.use((s) => s.captureStale);
  const black = liveStore.use((s) => s.captureBlack);
  const err = connectStore.use((s) => s.error);
  const picking = connectStore.use((s) => s.picking);
  const setErr = (error: string | null) => connectStore.set({ error });
  const closePicking = () => connectStore.set({ picking: false });
  const [viewportPick, setViewportPick] = useState(false);
  const start = startCapture;
  if (cap.state === "live")
    return (
      <div className={`share-chip share-live ${stale || black ? "share-stale" : ""}`}>
        <span className="dot" /> {black ? "화면이 검음" : stale ? "화면 멈춤" : "연결됨"}
        {cap.w > 0 && <span className="mono muted" title="공유 중인 게임 화면 크기">{cap.w}×{cap.h}</span>}
        <button onClick={connectMaple}>다른 창 선택</button>
        <button onClick={() => screenCapture.stop("user")}>중지</button>
        <button onClick={() => setViewportPick(true)}>게임 영역</button>
        {viewportPick && <RegionPicker raw title="게임 영역 맞추기" guide={['검은 여백과 창 테두리를 빼고 게임 화면만 선택하세요.']} onClose={() => setViewportPick(false)}
          onConfirm={({region})=>{
            if(region.w<320||region.h<240){setErr('게임 화면 전체를 선택해 주세요.');return;}
            const size=`${screenCapture.sourceWidth}x${screenCapture.sourceHeight}`;
            profileStore.set(p=>({...p,gameViewports:{...p.gameViewports,[size]:{x:region.x,y:region.y,w:region.w,h:region.h}}}));
            setViewportPick(false);
          }} />}
        {picking && <CapturePicker onSelect={start} onClose={closePicking} />}
      </div>
    );
  return (
    <div className="share-chip share-off">
      <span className="dot" /> {cap.state === "starting" ? "선택 대기 중…" : cap.state === "ended" ? "공유 끊김" : "연결 안 됨"}
      <button className="primary" onClick={connectMaple} disabled={cap.state === "starting"}>
        메이플 연결
      </button>
      {err && <span className="error">{err}</span>}
      {cap.state === "ended" && screenCapture.error && <span className="error">{screenCapture.error}</span>}
      {picking && <CapturePicker onSelect={start} onClose={closePicking} />}
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
  const persistenceErrors=persistenceStatus.use(s=>s.errors);
  const order = profileStore.use((p) => p.panelOrder);
  const visibleOrder=order.filter(id=>SPECIAL_CORE_ENABLED||id!=="core");
  const collapsed = profileStore.use((p) => p.collapsed);
  const masterVolume = profileStore.use((p) => p.masterVolume);
  const muted = profileStore.use((p) => p.muted);
  const theme = profileStore.use((p) => p.theme);
  const ringing = liveStore.use((s) => s.ringing);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const picker = pickerStore.use((s) => s.req);
  const pickingBuffLocation=buffLocationStore.use(s=>s.open);
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
      const o = p.panelOrder.filter(id=>SPECIAL_CORE_ENABLED||id!=="core");
      const i = o.indexOf(id);
      const j = i + d;
      if (j < 0 || j >= o.length) return p;
      [o[i], o[j]] = [o[j], o[i]];
      return { ...p, panelOrder: [...o,...p.panelOrder.filter(id=>!o.includes(id))] };
    });

  return (
    <div className="app">
      <header className="app-head">
        <h1>메이플 타이머</h1>
        <span className="badge">개인용</span>
        <AppVersion />
        <span className="spacer" />
        <button onClick={() => setModal("guide")}>사용 가이드</button>
        {pipSupported() && (
          <button onClick={() => (pipOpen ? closePip() : openPip())}>{pipOpen ? "PIP 닫기" : "PIP 타이머"}</button>
        )}
        <ThemeButton />
        <button onClick={() => setModal("settings")}>설정</button>
        <ShareChip />
      </header>
      {Object.keys(persistenceErrors).length>0&&<section className="notice" role="alert">
        <span>{Object.values(persistenceErrors)[0]}</span> <button onClick={()=>setModal("settings")}>설정 열기</button>
      </section>}

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
          <button
            className={`icon-btn ${muted ? "mute-on" : ""}`}
            onClick={(e) => {
              e.preventDefault(); // label 안이라 슬라이더로 클릭이 넘어가지 않게
              profileStore.set({ muted: !muted });
            }}
            title={muted ? "알림 소리 다시 켜기" : "모든 알림 소리 끄기"}
            aria-label={muted ? "알림 소리 다시 켜기" : "모든 알림 소리 끄기"}
            aria-pressed={muted}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {muted && <span className="mute-note">소리 꺼짐</span>}
        </label>
        {ringing.length > 0 && (
          <button className="ringing-btn" onClick={stopRingingAlerts} title="지금 울리는 알림과 남은 반복을 멈춰요">
            🔕 알림 멈춤 ({ringing.join(", ")})
          </button>
        )}
        <span className="spacer" />
        <AlertLog />
        <button onClick={() => setEditOrder(!editOrder)}>{editOrder ? "순서 편집 끝" : "순서 편집"}</button>
      </div>

      <UpdateBanner />
      <SetupChecklist />

      <main className="panels">
        {visibleOrder.map((id) => (
          <div key={id} className="panel-slot" data-panel={id}>
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
        화면은 이 PC 안에서만 분석해요 · 비공식 개인용 도구 · MapleStory © NEXON Korea
      </footer>

      {pickingBuffLocation && <BuffLocationPicker />}
      {picker && (
        <RegionPicker
          title={picker.title}
          selection={picker.selection}
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
      {import.meta.env.DEV && new URLSearchParams(location.search).has("replay") && <ReplayLoader />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {modal === "guide" && <GuideModal onClose={() => setModal(null)} />}
    </div>
  );
}
