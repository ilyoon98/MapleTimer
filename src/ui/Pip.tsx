import { createRoot, type Root } from "react-dom/client";
import { liveStore, stopRingingAlerts } from "../engine/engine";
import { createStore } from "../state/createStore";
import { PIP_SIZES, profileStore, shortName } from "../state/profile";
import { fmtRemaining } from "./common";
import { pauseTimer, startTimer } from "./panels/TimersPanel";

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts: { width: number; height: number }): Promise<Window>;
      window: Window | null;
    };
  }
}

export const pipStore = createStore<{ open: boolean }>({ open: false });
let pipRoot: Root | null = null;

export const pipSupported = () => typeof window !== "undefined" && !!window.documentPictureInPicture;

/** 게임 위에 항상 떠 있는 작은 타이머 창 (Chrome Document Picture-in-Picture) */
export async function openPip() {
  if (!window.documentPictureInPicture) {
    alert("이 브라우저는 PIP 창을 지원하지 않아요. 최신 Chrome 이나 Edge 에서 열어 주세요.");
    return;
  }
  if (window.documentPictureInPicture.window) return;
  let pip: Window;
  try {
    const size = PIP_SIZES[profileStore.get().pipSize] ?? PIP_SIZES.medium;
    pip = await window.documentPictureInPicture.requestWindow({ width: size.width, height: size.height });
  } catch (e) {
    alert(`PIP 창을 열 수 없어요. 일반 Chrome/Edge 창에서 열어 주세요.\n(${(e as Error).message})`);
    return;
  }
  // 스타일 복사
  for (const node of document.head.querySelectorAll("style, link[rel=stylesheet]")) {
    pip.document.head.appendChild(node.cloneNode(true));
  }
  pip.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? "";
  pip.document.title = "메이플 타이머";
  pip.document.body.className = "pip-body";
  const mount = pip.document.createElement("div");
  pip.document.body.appendChild(mount);
  pipRoot = createRoot(mount);
  pipRoot.render(<PipView />);
  pipStore.set({ open: true });
  pip.addEventListener("pagehide", () => {
    pipRoot?.unmount();
    pipRoot = null;
    pipStore.set({ open: false });
  });
}

export function closePip() {
  window.documentPictureInPicture?.window?.close();
}

interface Item {
  key: string;
  name: string;
  remaining: number | null;
  urgent: boolean;
  tone: "alert" | "running" | "waiting";
  text?: string;
}

function PipView() {
  const live = liveStore.use((s) => s);
  const p = profileStore.use((s) => s);
  const now = live.now;
  const items: Item[] = [];

  for (const s of p.skills) {
    if (!s.enabled) continue;
    const l = live.skills[s.id];
    const rem = l?.expiresAt != null ? l.expiresAt - now : null;
    const urgent = rem != null && rem <= s.leadSec * 1000;
    items.push({ key: s.id, name: shortName(s.name), remaining: rem, urgent, tone: urgent ? "alert" : rem != null ? "running" : "waiting" });
  }
  for (const b of p.buffs) {
    if (!b.enabled) continue;
    const l = live.buffs[b.id];
    const rem = l?.endsAt != null ? l.endsAt - now : null;
    const urgent = rem != null && rem <= b.leadSec * 1000;
    items.push({
      key: b.id,
      name: b.name,
      remaining: rem,
      urgent,
      tone: urgent ? "alert" : rem != null || l?.present ? "running" : "waiting",
      text: rem == null ? (b.kind === "cooldown" ? "사용 가능" : l?.present ? "있음" : "없음") : undefined,
    });
  }
  for (const t of p.timers) {
    const rem = t.endsAt != null ? t.endsAt - now : t.pausedRemainingMs;
    const urgent = t.endsAt != null && rem != null && rem <= t.leadSec * 1000;
    items.push({ key: t.id, name: shortName(t.name), remaining: rem, urgent, tone: urgent ? "alert" : t.endsAt != null ? "running" : "waiting" });
  }
  const order = { alert: 0, running: 1, waiting: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone] || (a.remaining ?? Infinity) - (b.remaining ?? Infinity));

  const runeText =
    live.rune.status === "present" ? "룬 있음!" : live.rune.status === "off" ? "꺼짐" : live.rune.status === "searching" ? "찾는 중" : "—";
  const stallText =
    live.stall.status === "stalled"
      ? "멈춤!"
      : live.stall.status === "watching"
        ? `${Math.floor(live.stall.idleMs / 1000)}초 무변동`
        : live.stall.status === "off"
          ? "꺼짐"
          : "—";

  return (
    <div className={`pip ${live.ringing.length ? "pip-ringing" : ""} pip-${p.pipSize}`}>
      <div className="pip-status">
        <span className={`pip-chip ${live.rune.status === "present" ? "pip-chip-alert" : ""}`}>룬 · {runeText}</span>
        <span className={`pip-chip ${live.stall.status === "stalled" ? "pip-chip-alert" : ""}`}>사냥 · {stallText}</span>
      </div>
      <div className="pip-list">
        {items.map((it) => (
          <div key={it.key} className={`pip-item pip-${it.tone}`}>
            <span className="pip-name">{it.name}</span>
            <span className="pip-time mono">{it.text ?? fmtRemaining(it.remaining)}</span>
            {p.timers.some((t) => t.id === it.key) && <PipTimerButton id={it.key} />}
          </div>
        ))}
        {items.length === 0 && <div className="muted">표시할 항목이 없어요</div>}
      </div>
      <div className="pip-foot">
        <span>볼륨</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(p.masterVolume * 100)}
          onChange={(e) => profileStore.set({ masterVolume: Number(e.target.value) / 100 })}
        />
        <span className="mono">{Math.round(p.masterVolume * 100)}%</span>
        <button title={p.muted ? "알림 소리 켜기" : "모든 알림 소리 끄기"} onClick={() => profileStore.set({ muted: !p.muted })}>
          {p.muted ? "🔇" : "🔊"}
        </button>
      </div>
      {live.ringing.length > 0 && (
        <button className="ringing-btn" onClick={stopRingingAlerts}>
          🔕 알림 멈춤
        </button>
      )}
    </div>
  );
}

function PipTimerButton({ id }: { id: string }) {
  const t = profileStore.use((p) => p.timers.find((x) => x.id === id));
  if (!t) return null;
  return t.endsAt != null ? (
    <button className="pip-btn" onClick={() => pauseTimer(t)}>
      ⏸
    </button>
  ) : (
    <button className="pip-btn" onClick={() => startTimer(t)}>
      ▶
    </button>
  );
}
