import { useCallback, useEffect, useRef, useState } from "react";
import { screenCapture } from "../capture/screenCapture";
import type { Rect, SavedRegion } from "../capture/types";

export interface PickResult {
  region: SavedRegion;
  /** 선택 영역의 픽셀 (아이콘 템플릿/기준 이미지 저장용) */
  pixels: ImageData;
}

/** 고른 영역을 확대해서 보여준다 (작은 아이콘을 딱 맞게 골랐는지 확인용) */
function SelectionPreview({ snap, rect }: { snap: HTMLCanvasElement; rect: Rect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = Math.max(1, Math.min(8, Math.floor(Math.min(240 / rect.w, 96 / rect.h))));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = rect.w * scale;
    c.height = rect.h * scale;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(snap, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w * scale, rect.h * scale);
  }, [snap, rect, scale]);
  return <canvas ref={ref} className="picker-preview" title={`${scale}배 확대`} />;
}

/**
 * 공유 화면을 한 장 멈춰 놓고, 드래그로 영역을 고르는 창.
 * within 을 주면 그 영역 안에서만 고른다 (예: 버프칸 안에서 아이콘 고르기).
 */
export function RegionPicker({
  title,
  guide,
  within,
  initial,
  onConfirm,
  onClose,
}: {
  title: string;
  guide: string[];
  within?: SavedRegion | null;
  initial?: SavedRegion | null;
  onConfirm: (r: PickResult) => void;
  onClose: () => void;
}) {
  const [snap, setSnap] = useState<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rect, setRect] = useState<Rect | null>(null);
  const [countdown, setCountdown] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // within 영역이 있으면 그 부분만 잘라 보여준다
  const offset = within ? { x: within.x, y: within.y } : { x: 0, y: 0 };

  const grab = useCallback(() => {
    const full = screenCapture.snapshot();
    if (!full) return;
    let c = full;
    if (within) {
      c = document.createElement("canvas");
      c.width = within.w;
      c.height = within.h;
      c.getContext("2d")!.drawImage(full, within.x, within.y, within.w, within.h, 0, 0, within.w, within.h);
    }
    setSnap(c);
    // 전체가 한눈에 보이도록 가로·세로 모두 맞춘 배율 (작은 영역은 최대 4배까지 확대)
    const availW = Math.min(window.innerWidth - 80, 1440);
    const availH = window.innerHeight * 0.62 - 4;
    const fit = Math.min(availW / c.width, availH / c.height);
    const z = fit >= 4 ? 4 : fit >= 3 ? 3 : fit >= 2 ? 2 : fit >= 1 ? 1 : Math.floor(fit * 100) / 100;
    setZoom(z);
  }, [within]);

  useEffect(() => {
    grab();
    if (initial) {
      setRect({ x: initial.x - offset.x, y: initial.y - offset.y, w: initial.w, h: initial.h });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) grab();
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, grab]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !snap) return;
    c.width = snap.width;
    c.height = snap.height;
    c.getContext("2d")!.drawImage(snap, 0, 0);
  }, [snap]);

  const toImg = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = snap!.width / r.width;
    return {
      x: Math.max(0, Math.min(snap!.width, (e.clientX - r.left) * sx)),
      y: Math.max(0, Math.min(snap!.height, (e.clientY - r.top) * sx)),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!snap) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toImg(e);
    dragRef.current = p;
    setRect({ x: Math.floor(p.x), y: Math.floor(p.y), w: 0, h: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s || !snap) return;
    const p = toImg(e);
    const x = Math.floor(Math.min(s.x, p.x)),
      y = Math.floor(Math.min(s.y, p.y));
    setRect({ x, y, w: Math.ceil(Math.max(s.x, p.x)) - x, h: Math.ceil(Math.max(s.y, p.y)) - y });
  };
  const onUp = () => {
    dragRef.current = null;
  };

  // 방향키로 1px(Shift: 크기 조절) 미세 조정
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (!rect) return;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      setRect((r) =>
        r && (e.shiftKey ? { ...r, w: Math.max(2, r.w + d[0]), h: Math.max(2, r.h + d[1]) } : { ...r, x: r.x + d[0], y: r.y + d[1] }),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rect, onClose]);

  const confirm = () => {
    if (!rect || !snap || rect.w < 2 || rect.h < 2) return;
    const pixels = snap.getContext("2d")!.getImageData(rect.x, rect.y, rect.w, rect.h);
    onConfirm({
      region: {
        x: rect.x + offset.x,
        y: rect.y + offset.y,
        w: rect.w,
        h: rect.h,
        frameW: screenCapture.width,
        frameH: screenCapture.height,
      },
      pixels,
    });
  };

  const scale = snap ? zoom : 1;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <ul className="guide-list">
          {guide.map((g) => (
            <li key={g}>{g}</li>
          ))}
          <li>드래그로 영역을 고르고, 방향키로 1px 이동 · Shift+방향키로 크기 조절할 수 있어요.</li>
        </ul>
        <div className="picker-toolbar">
          <button onClick={grab}>지금 화면 다시 가져오기</button>
          <button onClick={() => setCountdown(3)} disabled={countdown > 0}>
            {countdown > 0 ? `${countdown}초 후 가져옴…` : "3초 후 가져오기"}
          </button>
          <span className="spacer" />
          <label>
            배율{" "}
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
              {[zoom, 0.5, 1, 2, 3, 4, 6, 8]
                .filter((v, i, a) => a.indexOf(v) === i)
                .sort((a, b) => a - b)
                .map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="picker-stage">
          {!snap && <div className="debug-empty">화면 공유를 먼저 시작해 주세요.</div>}
          {snap && (
            <div className="picker-canvas-wrap" style={{ width: snap.width * scale, height: snap.height * scale }}>
              <canvas
                ref={canvasRef}
                style={{ width: snap.width * scale, height: snap.height * scale }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
              />
              {rect && rect.w > 0 && (
                <div
                  className="picker-rect"
                  style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale }}
                />
              )}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          {snap && rect && rect.w >= 2 && rect.h >= 2 && <SelectionPreview snap={snap} rect={rect} />}
          <span className="muted">{rect ? `선택: ${rect.w}×${rect.h}px @ (${rect.x + offset.x}, ${rect.y + offset.y})` : "영역을 드래그하세요"}</span>
          <span className="spacer" />
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={confirm} disabled={!rect || rect.w < 2 || rect.h < 2}>
            이 영역 사용
          </button>
        </footer>
      </div>
    </div>
  );
}
