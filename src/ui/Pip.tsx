import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { screenCapture } from "../capture/screenCapture";
import { appTicker } from "../core/ticker";
import { SPECIAL_CORE_ENABLED } from "../state/features";
import { desktop } from "../platform/desktop";
import { liveStore, manualSkillCast, stopRingingAlerts } from "../engine/engine";
import { captureMissedAlert } from "../engine/alertEvidence";
import { preciseBuffId } from "../engine/buffs";
import { createStore } from "../state/createStore";
import {
  PIP_ALERT_COLORS,
  PIP_EMPHASIS,
  PIP_SIZES,
  PIP_TEXT,
  defaultProfile,
  preciseIcon,
  profileStore,
  shortName,
  type PipAlertColor,
  type PipEmphasis,
  type PipText,
} from "../state/profile";
import { Toggle, fmtRemaining } from "./common";
import { useIssues } from "./issues";
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
let overlay: Window | null = null;

export const pipSupported = () => !!desktop || !!window.documentPictureInPicture;

/** 이보다 작게 저장하지 않는다 (잘못 줄어든 채로 다시 열리지 않게) */
const MIN_PIP = { width: 200, height: 160 };

/** 게임 위에 항상 떠 있는 작은 타이머 창 (Chrome Document Picture-in-Picture) */
export async function openPip() {
  if (!desktop && !window.documentPictureInPicture) {
    alert("이 브라우저는 PIP 창을 지원하지 않아요. 최신 Chrome 이나 Edge 에서 열어 주세요.");
    return;
  }
  if (overlay && !overlay.closed) { overlay.focus(); return; }
  if (!desktop && window.documentPictureInPicture?.window) return;
  let pip: Window;
  try {
    // 끌어서 맞춘 크기가 있으면 그대로, 없으면 기본 크기
    const saved = profileStore.get().pipWindow;
    const size = saved ?? PIP_SIZES[profileStore.get().pipSize] ?? PIP_SIZES.medium;
    if (desktop) {
      const popup = window.open('about:blank', 'maple-overlay', `width=${size.width},height=${size.height}`);
      if (!popup) throw new Error('타이머 창을 열지 못했어요.');
      pip = popup;
    } else pip = await window.documentPictureInPicture!.requestWindow({ width: size.width, height: size.height });
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
  overlay = pip;
  pipStore.set({ open: true });
  // 보이는 PIP 창의 타이머도 감지를 깨운다. 원래 탭의 워커 신호가 늦어져도 계속 확인한다.
  const heartbeat = pip.setInterval(() => appTicker.pulse(), 250);
  // 창 가장자리를 끌어 크기를 바꾸면 기억해 둔다 (다음에 열 때 같은 크기)
  let sizeTimer = 0;
  pip.addEventListener("resize", () => {
    pip.clearTimeout(sizeTimer);
    sizeTimer = pip.setTimeout(() => {
      const width = pip.innerWidth, height = pip.innerHeight;
      if (width >= MIN_PIP.width && height >= MIN_PIP.height) profileStore.set({ pipWindow: { width, height } });
    }, 400);
  });
  pip.addEventListener("pagehide", () => {
    pip.clearInterval(heartbeat);
    pipRoot?.unmount();
    pipRoot = null;
    overlay = null;
    pipStore.set({ open: false });
  });
}

export function closePip() {
  overlay?.close();
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

/** PIP 모양 (창 크기·글자 크기·알림색 등) 을 PIP 안에서 바로 고친다 */
function pipStyle(p: { pipAlertColor: PipAlertColor; pipText: PipText }): React.CSSProperties {
  return { ...alertColorStyle(p.pipAlertColor), "--pip-text": PIP_TEXT[p.pipText]?.scale ?? 1 } as React.CSSProperties;
}

function Choice<K extends string>({ value, options, onChange }: { value: K; options: Array<[K, string]>; onChange: (k: K, e: React.MouseEvent) => void }) {
  return (
    <div className="pip-choice" role="group">
      {options.map(([k, label]) => (
        <button key={k} className={value === k ? "on" : ""} aria-pressed={value === k} onClick={(e) => onChange(k, e)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function PipSettings({ onClose }: { onClose: () => void }) {
  const p = profileStore.use((s) => s);
  const reset = () => {
    const d = defaultProfile();
    profileStore.set({ pipText: d.pipText, pipEmphasis: d.pipEmphasis, pipAlertColor: d.pipAlertColor, pipBackground: d.pipBackground });
  };
  return (
    <div className="pip-settings">
      <div className="pip-settings-head">
        <b>PIP 모양</b>
        <span className="spacer" />
        <button className="pip-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <PipPreview emphasis={p.pipEmphasis} />
      <label>글자 크기</label>
      <Choice value={p.pipText} options={(Object.keys(PIP_TEXT) as PipText[]).map((k) => [k, PIP_TEXT[k].label])} onChange={(k) => profileStore.set({ pipText: k })} />
      <label>알림이 울릴 때</label>
      <Choice
        value={p.pipEmphasis}
        options={(Object.keys(PIP_EMPHASIS) as PipEmphasis[]).map((k) => [k, PIP_EMPHASIS[k].split(" ")[0]])}
        onChange={(k) => profileStore.set({ pipEmphasis: k })}
      />
      <div className="pip-colors">
        {(Object.keys(PIP_ALERT_COLORS) as PipAlertColor[]).map((k) => (
          <button
            key={k}
            className={`pip-color ${p.pipAlertColor === k ? "on" : ""}`}
            style={{ "--chip": PIP_ALERT_COLORS[k].color ?? "var(--alert)" } as React.CSSProperties}
            aria-label={PIP_ALERT_COLORS[k].label}
            title={PIP_ALERT_COLORS[k].label}
            aria-pressed={p.pipAlertColor === k}
            onClick={() => profileStore.set({ pipAlertColor: k })}
          />
        ))}
      </div>
      <Toggle checked={p.pipBackground} onChange={(v) => profileStore.set({ pipBackground: v })} label="배경에 게임 화면" />
      <button className="pip-reset" onClick={reset}>
        기본 모양으로
      </button>
    </div>
  );
}

/** 미리 보기 내용 (실제 PIP 와 같은 줄 모양) */
function PreviewRows({ emphasis }: { emphasis: PipEmphasis }) {
  return (
    <>
      <div className="pip-preview-text">
        <div className="pip-item pip-running">
          <span className="pip-name">솔 야누스 새벽</span>
          <span className="pip-time mono">1:12</span>
        </div>
      </div>
      <div className="pip-preview-caption">알림이 울릴 때</div>
      <div className={`pip-preview-ring pip-ringing pip-emph-${emphasis}`}>
        <div className="pip-preview-text">
          <div className="pip-item pip-alert">
            <span className="pip-name">에르다 파운틴</span>
            <span className="pip-time mono">0:09</span>
          </div>
        </div>
      </div>
    </>
  );
}

const MAX_TEXT_SCALE = Math.max(...Object.values(PIP_TEXT).map((t) => t.scale));

/**
 * 고른 글자 크기·알림 모양·알림색이 실제로 어떻게 보이는지.
 * 가장 큰 글자로 그린 보이지 않는 사본이 같은 자리에서 높이를 잡아 두어,
 * 글자 크기를 바꿔도 아래 버튼들이 밀리지 않는다 (누르던 버튼이 손 밑에서 도망가지 않게).
 */
function PipPreview({ emphasis }: { emphasis: PipEmphasis }) {
  return (
    <div className="pip-preview-box" aria-label="미리 보기">
      <div className="pip-preview pip-preview-sizer" aria-hidden style={{ "--pip-text": MAX_TEXT_SCALE } as React.CSSProperties}>
        <PreviewRows emphasis="subtle" />
      </div>
      <div className="pip-preview">
        <PreviewRows emphasis={emphasis} />
      </div>
    </div>
  );
}

/** 오른쪽 위 ⚙ : 누르면 PIP 모양 설정 */
function PipGear() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="pip-gear" onClick={() => setOpen(!open)} aria-label="PIP 모양 설정" title="PIP 모양 설정">
        ⚙
      </button>
      {open && <PipSettings onClose={() => setOpen(false)} />}
    </>
  );
}

/** 울려야 했는데 안 울린 알림: 켜 둔 기능 중 하나를 누르면 그 순간 화면을 '놓침'으로 남긴다 */
export function missedOptions(p: ReturnType<typeof profileStore.get>): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  for (const s of p.skills) if (s.enabled) out.push({ key: preciseIcon(s) ? `buff:${preciseBuffId(s.id)}` : `skill:${s.id}`, label: shortName(s.name) });
  for (const b of p.buffs) if (b.enabled && (SPECIAL_CORE_ENABLED || b.kind !== "cooldown")) out.push({ key: `buff:${b.id}`, label: b.name });
  if (p.booster.enabled) out.push({ key: "booster", label: "부스터" });
  if (p.rune.enabled) out.push({ key: "rune", label: "룬" });
  if (p.stall.enabled) out.push({ key: "stall", label: "사냥 멈춤" });
  return out;
}

function PipMissed() {
  const p = profileStore.use((s) => s);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 1500);
    return () => clearTimeout(t);
  }, [done]);
  const options = missedOptions(p);
  if (screenCapture.state !== "live" || !options.length) return null;
  const pick = (o: { key: string; label: string }) => {
    setOpen(false);
    setDone(captureMissedAlert(o.key, `놓침: ${o.label}`) ? `'${o.label}' 남겼어요` : "지금은 못 남겨요");
  };
  return (
    <>
      <button className="pip-missed" onClick={() => setOpen(!open)} title="알림이 안 울렸으면 눌러서 그 순간을 남겨요">
        {done ?? "놓침"}
      </button>
      {open && (
        <div className="pip-missed-menu" role="menu" aria-label="안 울린 알림">
          <div className="pip-missed-head">어떤 알림이 안 울렸나요?</div>
          {options.map((o) => (
            <button key={o.key} role="menuitem" onClick={() => pick(o)}>{o.label}</button>
          ))}
          <button className="pip-missed-cancel" onClick={() => setOpen(false)}>닫기</button>
        </div>
      )}
    </>
  );
}

/** 알림이 안 울릴 수 있는 문제를 한 줄로 (가장 급한 것 하나만). 고치는 건 본 창에서 */
function PipIssue() {
  const issue = useIssues()[0];
  if (!issue) return null;
  return (
    <div className="pip-issue" title={issue.text}>
      ⚠ {issue.short}
    </div>
  );
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
    <div className={`pip pip-core ${soon ? "pip-ringing" : ""} pip-${p.pipSize} pip-emph-${p.pipEmphasis} ${p.pipBackground ? "pip-with-bg" : ""}`} style={pipStyle(p)}>
      <PipBackground />
      <PipGear />
      <PipIssue />
      <div className="pip-core-name">{core?.name ?? "특수 코어 항목 없음"}</div>
      <div className={`pip-core-time mono ${soon ? "urgent" : ""}`}>{ready ? "사용 가능" : fmtRemaining(rem)}</div>
      <div className="pip-core-state muted">{!core ? "특수 코어 알림에서 '+ 추가'를 눌러 주세요" : ready ? "" : soon ? "곧 사용 가능" : "쿨타임"}</div>
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
  return SPECIAL_CORE_ENABLED && mode === "core" ? <CorePipView /> : <PipView />;
}

function PipView() {
  const live = liveStore.use((s) => s);
  const p = profileStore.use((s) => s);
  const now = live.now;
  const items: Item[] = [];

  // 본 창에서 켠 기능은 모두 보여 준다 (PIP 에서 따로 고르지 않는다)
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
  for (const b of p.buffs) {
    if (!b.enabled || (!SPECIAL_CORE_ENABLED && b.kind === "cooldown")) continue;
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
  if (p.booster.enabled && live.booster.endsAt != null) {
    const rem = live.booster.endsAt - now;
    const urgent = rem <= p.booster.leadSec * 1000;
    items.push({ key: "booster", name: "부스터", remaining: rem, urgent, tone: urgent ? "alert" : "running", alertIn: rem - p.booster.leadSec * 1000 });
  }
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
  const next = items.filter((it) => it.alertIn != null && it.alertIn > 0).sort((a, b) => a.alertIn! - b.alertIn!)[0];

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
    <div className={`pip ${live.ringing.length ? "pip-ringing" : ""} pip-${p.pipSize} pip-emph-${p.pipEmphasis} ${p.pipBackground ? "pip-with-bg" : ""}`} style={pipStyle(p)}>
      <PipBackground />
      <PipGear />
      <PipIssue />
      {next && (
        <div className="pip-next">
          <span className="pip-next-label">다음 알림</span>
          <span className="pip-next-name">{next.name}</span>
          <span className="pip-next-time mono">{fmtRemaining(next.alertIn)}</span>
        </div>
      )}
      {(p.rune.enabled || p.stall.enabled) && (
        <div className="pip-status">
          {p.rune.enabled && <span className={`pip-chip ${live.rune.status === "present" ? "pip-chip-alert" : ""}`}>룬 · {runeText}</span>}
          {p.stall.enabled && <span className={`pip-chip ${live.stall.status === "stalled" ? "pip-chip-alert" : ""}`}>사냥 · {stallText}</span>}
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
        {SPECIAL_CORE_ENABLED && p.buffs.some((b) => b.kind === "cooldown") && <ModeSwitch />}
        <PipMissed />
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
