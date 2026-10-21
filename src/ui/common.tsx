import { useEffect, useRef, useState, type ReactNode } from "react";
import { debugCrops, liveStore } from "../engine/engine";

export function fmtRemaining(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "--";
  const neg = ms < 0;
  const total = Math.ceil(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

export function fmtClock(at: number | null | undefined): string {
  if (!at) return "--";
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function leadLabel(sec: number) {
  return sec < 0 ? `${-sec}초 후` : `${sec}초 전`;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  width = 64,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let v = Number(text);
    if (!Number.isFinite(v)) v = value;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    onChange(v);
    setText(String(v));
  };
  return (
    <span className="num-input">
      <input
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        style={{ width }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function Panel({
  title,
  badge,
  actions,
  collapsed,
  onToggleCollapse,
  children,
}: {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <button className="collapse-btn" onClick={onToggleCollapse} aria-label={collapsed ? "펼치기" : "접기"}>
          {collapsed ? "▸" : "▾"}
        </button>
        <h2>{title}</h2>
        {badge}
        <div className="panel-actions">{actions}</div>
      </header>
      {!collapsed && <div className="panel-body">{children}</div>}
    </section>
  );
}

export function StatusDot({ tone, children }: { tone: "ok" | "warn" | "alert" | "idle" | "info"; children: ReactNode }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

/** 엔진이 마지막으로 잘라낸 영역을 확대해서 보여준다 (진단용) */
export function DebugCrop({
  cropKey,
  boxes,
  maxWidth = 280,
}: {
  cropKey: string;
  boxes?: Array<{ x: number; y: number; w: number; h: number }>;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const now = liveStore.use((s) => s.now);
  const img = debugCrops.get(cropKey);
  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    if (c.width !== img.width || c.height !== img.height) {
      c.width = img.width;
      c.height = img.height;
    }
    const ctx = c.getContext("2d")!;
    ctx.putImageData(img, 0, 0);
    if (boxes?.length) {
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 1;
      for (const b of boxes) ctx.strokeRect(b.x - 1.5, b.y - 1.5, b.w + 3, b.h + 3);
    }
  }, [img, now, boxes]);
  if (!img) return <div className="debug-empty">아직 잘라낸 화면이 없어요</div>;
  const scale = Math.max(1, Math.min(6, Math.floor(maxWidth / img.width)));
  return (
    <canvas
      ref={ref}
      className="debug-crop"
      style={{ width: img.width * scale, height: img.height * scale, maxWidth: "100%" }}
    />
  );
}
