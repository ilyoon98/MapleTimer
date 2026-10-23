import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { screenCapture } from "../capture/screenCapture";
import { liveStore, manualSkillCast, stopRingingAlerts } from "../engine/engine";
import { createStore } from "../state/createStore";
import { PIP_ALERT_COLORS, PIP_SIZES, profileStore, shortName, type PipAlertColor } from "../state/profile";
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
  pipRoot.render(<PipRoot />);
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

/** 고른 알림색으로 PIP 의 알림색 변수를 바꾼다 (기본은 테마 색 그대로) */
function alertColorStyle(key: PipAlertColor): React.CSSProperties | undefined {
  const c = PIP_ALERT_COLORS[key]?.color;
  return c ? ({ "--alert": c, "--alert-soft": `color-mix(in srgb, ${c} 28%, var(--bg))` } as React.CSSProperties) : undefined;
}

/** 공유 중인 게임 화면을 PIP 배경에 깐다 (설정에서 켰을 때만). 글자가 보이게 어둡게 덮는다 */
function PipBackground() {
  const on = profileStore.use((p) => p.pipBackground);
  const [, force] = useState(0);
  useEffect(() => screenCapture.onChange(() => force((n) => n + 1)) as () => void, []);
  const stream = screenCapture.state === "live" ? screenCapture.mediaStream : null;
  if (!on || !stream) return null;
  return (
    <>
      <video
        className="pip-bg"
        autoPlay
        muted
        playsInline
        ref={(v) => {
          if (v && v.srcObject !== stream) v.srcObject = stream;
        }}
      />
      <div className="pip-bg-shade" />
    </>
  );
}

interface Item {
  key: string;
  name: string;
  remaining: number | null;
  urgent: boolean;
  tone: "alert" | "running" | "waiting";
  /** 알림이 울리기까지 남은 시간(ms). 진행 중이 아니면 null */
  alertIn?: number | null;
  text?: string;
  /** 누르면 실행할 동작 (스킬: 지금 사용한 것으로 타이머 시작) */
  onClick?: () => void;
  title?: string;
}

/** 보스용: 특수 코어 쿨타임 하나만 크게 */
function CorePipView() {
  const live = liveStore.use((s) => s);
  const p = profileStore.use((s) => s);
  const core = p.buffs.find((b) => b.enabled && b.kind === "cooldown");
  const l = core ? live.buffs[core.id] : undefined;
  const rem = l?.endsAt != null ? l.endsAt - live.now : null;
  const soon = core != null && rem != null && rem > 0 && rem <= core.leadSec * 1000;
  const ready = rem == null || rem <= 0;
  return (
    <div className={`pip pip-core ${soon ? "pip-ringing" : ""} pip-${p.pipSize} pip-emph-${p.pipEmphasis} ${p.pipBackground ? "pip-with-bg" : ""}`} style={alertColorStyle(p.pipAlertColor)}>
      <PipBackground />
      <div className="pip-core-name">{core?.name ?? "특수 코어 항목 없음"}</div>
      <div className={`pip-core-time mono ${soon ? "urgent" : ""}`}>{ready ? "사용 가능" : fmtRemaining(rem)}</div>
      <div className="pip-core-state muted">{!core ? "버프칸 감지에서 '+ 특수 코어'를 추가하세요" : ready ? "" : soon ? "곧 사용 가능" : "쿨타임"}</div>
      <ModeSwitch />
    </div>
  );
}

function ModeSwitch() {
  const mode = profileStore.use((s) => s.pipMode);
  return (
    <button className="pip-btn pip-mode" onClick={() => profileStore.set({ pipMode: mode === "core" ? "hunting" : "core" })}>
      {mode === "core" ? "전체 보기" : "특수 코어만"}
    </button>
  );
}

function PipRoot() {
  const mode = profileStore.use((s) => s.pipMode);
  return mode === "core" ? <CorePipView /> : <PipView />;
}

function PipView() {
  const live = liveStore.use((s) => s);
  const p = profileStore.use((s) => s);
  const now = live.now;
  const show = p.pipShow;
  const items: Item[] = [];

  if (show.skills)
    for (const s of p.skills) {
      if (!s.enabled) continue;
      const l = live.skills[s.id];
      const rem = l?.expiresAt != null ? l.expiresAt - now : null;
      const urgent = rem != null && rem <= s.leadSec * 1000;
      items.push({
        key: s.id,
        name: shortName(s.name),
        remaining: rem,
        urgent,
        tone: urgent ? "alert" : rem != null ? "running" : "waiting",
        alertIn: rem != null ? rem - s.leadSec * 1000 : null,
        onClick: () => manualSkillCast(s.id),
        title: "누르면 지금 스킬을 쓴 것으로 타이머를 시작해요",
      });
    }
  if (show.buffs)
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
        alertIn: rem != null ? rem - b.leadSec * 1000 : null,
        text: rem == null ? (b.kind === "cooldown" ? "사용 가능" : l?.present ? "있음" : "없음") : undefined,
      });
    }
  if (show.booster && p.booster.enabled && live.booster.endsAt != null) {
    const rem = live.booster.endsAt - now;
    const urgent = rem <= p.booster.leadSec * 1000;
    items.push({ key: "booster", name: "부스터", remaining: rem, urgent, tone: urgent ? "alert" : "running", alertIn: rem - p.booster.leadSec * 1000 });
  }
  if (show.timers)
    for (const t of p.timers) {
      if (!t.enabled) continue;
      const rem = t.endsAt != null ? t.endsAt - now : t.pausedRemainingMs;
      const urgent = t.endsAt != null && rem != null && rem <= t.leadSec * 1000;
      items.push({
        key: t.id,
        name: shortName(t.name),
        remaining: rem,
        urgent,
        tone: urgent ? "alert" : t.endsAt != null ? "running" : "waiting",
        alertIn: t.endsAt != null && rem != null ? rem - t.leadSec * 1000 : null,
      });
    }
  const order = { alert: 0, running: 1, waiting: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone] || (a.remaining ?? Infinity) - (b.remaining ?? Infinity));
  // 아직 안 울린 알림 중 가장 먼저 울릴 것
  const next = show.next
    ? items.filter((it) => it.alertIn != null && it.alertIn > 0).sort((a, b) => a.alertIn! - b.alertIn!)[0]
    : undefined;

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
    <div className={`pip ${live.ringing.length ? "pip-ringing" : ""} pip-${p.pipSize} pip-emph-${p.pipEmphasis} ${p.pipBackground ? "pip-with-bg" : ""}`} style={alertColorStyle(p.pipAlertColor)}>
      <PipBackground />
      {next && (
        <div className="pip-next">
          <span className="pip-next-label">다음 알림</span>
          <span className="pip-next-name">{next.name}</span>
          <span className="pip-next-time mono">{fmtRemaining(next.alertIn)}</span>
        </div>
      )}
      {(show.rune || show.stall) && (
        <div className="pip-status">
          {show.rune && <span className={`pip-chip ${live.rune.status === "present" ? "pip-chip-alert" : ""}`}>룬 · {runeText}</span>}
          {show.stall && <span className={`pip-chip ${live.stall.status === "stalled" ? "pip-chip-alert" : ""}`}>사냥 · {stallText}</span>}
        </div>
      )}
      <div className="pip-list">
        {items.map((it) => (
          <div
            key={it.key}
            className={`pip-item pip-${it.tone} ${it.onClick ? "pip-clickable" : ""}`}
            onClick={it.onClick}
            title={it.title}
          >
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
        {p.buffs.some((b) => b.kind === "cooldown") && <ModeSwitch />}
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
