import type { Rect } from "./types";

type FrameSource = VideoFrame | HTMLVideoElement;

/* Chrome 전용 API (MediaStreamTrackProcessor) */
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
const TrackProcessor = (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor;

export type CaptureState = "idle" | "starting" | "live" | "ended";

/**
 * 화면 공유 스트림을 열고, 최신 프레임을 캔버스에 그려 영역별 픽셀을 꺼내준다.
 * 게임 창이 앞에 있어 이 탭이 가려져도 프레임이 계속 들어오도록
 * 가능하면 MediaStreamTrackProcessor 를 쓰고, 없으면 video 요소로 대체한다.
 */
export class ScreenCapture {
  state: CaptureState = "idle";
  width = 0;
  height = 0;
  private stream: MediaStream | null = null;
  private latest: VideoFrame | null = null;
  private video: HTMLVideoElement | null = null;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private frameStamp = 0;
  private drawnStamp = -1;
  /** 마지막으로 새 프레임이 들어온 시각 (Date.now). video 대체 경로에서는 알 수 없어 null */
  lastFrameAt: number | null = null;
  /** 내부 캔버스에 마지막으로 그린 프레임이 들어온 시각 */
  drawnAt: number | null = null;
  private listeners = new Set<() => void>();

  onChange(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  get mediaStream() {
    return this.stream;
  }

  async start() {
    this.stop("user");
    this.lastFrameAt = null;
    this.drawnAt = null;
    this.state = "starting";
    this.emit();
    try {
      const params = new URLSearchParams(location.search);
      const demo = import.meta.env.DEV && params.has("demo");
      const replay = import.meta.env.DEV && params.has("replay");
      const stream = demo
        ? (await import("../dev/demoStream")).createDemoStream()
        : replay
          ? (await import("../dev/replayStream")).createReplayStream()
          : await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: { ideal: 10, max: 15 } },
              audio: false,
              // @ts-expect-error Chrome 전용 옵션
              selfBrowserSurface: "exclude",
              surfaceSwitching: "include",
            });
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      // 게임 창이 닫히거나 브라우저의 '공유 중지'로 끊긴 경우
      track.addEventListener("ended", () => this.stop("ended"));
      if (TrackProcessor) {
        void this.pump(new TrackProcessor({ track }).readable.getReader());
      } else {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.srcObject = stream;
        await v.play();
        this.video = v;
      }
      this.state = "live";
    } catch (err) {
      this.state = "idle";
      this.emit();
      throw err;
    }
    this.emit();
  }

  private async pump(reader: ReadableStreamDefaultReader<VideoFrame>) {
    this.reader = reader;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        this.latest?.close();
        this.latest = value;
        this.frameStamp++;
        this.lastFrameAt = Date.now();
      }
    } catch {
      /* 스트림 종료 */
    }
  }

  /** user: 이 앱에서 직접 멈춤(알림 없음), ended: 공유가 바깥에서 끊김 */
  stop(reason: "user" | "ended" = "user") {
    this.reader?.cancel().catch(() => {});
    this.reader = null;
    this.latest?.close();
    this.latest = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    if (this.state !== "idle") {
      this.state = reason === "ended" ? "ended" : "idle";
      this.emit();
    }
  }

  /** 최신 프레임을 내부 캔버스에 그린다. 그릴 프레임이 없으면 false */
  refresh(): boolean {
    const src: FrameSource | null = this.latest ?? this.video;
    if (!src) return false;
    const w = src instanceof HTMLVideoElement ? src.videoWidth : src.displayWidth;
    const h = src instanceof HTMLVideoElement ? src.videoHeight : src.displayHeight;
    if (!w || !h) return false;
    if (src instanceof HTMLVideoElement || this.drawnStamp !== this.frameStamp) {
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const sizeChanged = this.width !== w || this.height !== h;
      this.width = w;
      this.height = h;
      this.ctx.drawImage(src, 0, 0);
      this.drawnStamp = this.frameStamp;
      this.drawnAt = src instanceof HTMLVideoElement ? Date.now() : this.lastFrameAt;
      if (sizeChanged) this.emit();
    }
    return true;
  }

  /** 마지막으로 그린 프레임에서 영역 픽셀을 꺼낸다 (화면 밖은 잘라냄) */
  crop(r: Rect): ImageData | null {
    if (!this.width) return null;
    const x = Math.max(0, Math.round(r.x));
    const y = Math.max(0, Math.round(r.y));
    const w = Math.min(this.width - x, Math.round(r.w));
    const h = Math.min(this.height - y, Math.round(r.h));
    if (w <= 0 || h <= 0) return null;
    return this.ctx.getImageData(x, y, w, h);
  }

  private tiny = document.createElement("canvas");
  /**
   * 마지막으로 그린 화면 전체의 평균 밝기(0~255)와 밝기 편차.
   * 게임 창 공유가 검은 화면으로만 들어오는지 확인하는 용도 (작게 줄여서 계산해 가볍다)
   */
  frameStats(): { mean: number; spread: number } | null {
    if (!this.width) return null;
    const w = 64,
      h = 36;
    this.tiny.width = w;
    this.tiny.height = h;
    const t = this.tiny.getContext("2d", { willReadFrequently: true })!;
    t.drawImage(this.canvas, 0, 0, w, h);
    const d = t.getImageData(0, 0, w, h).data;
    let sum = 0,
      min = 255,
      max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += l;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    return { mean: sum / (w * h), spread: max - min };
  }

  /** 영역 선택 화면용 전체 프레임 스냅샷 */
  snapshot(): HTMLCanvasElement | null {
    if (!this.refresh()) return null;
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    c.getContext("2d")!.drawImage(this.canvas, 0, 0);
    return c;
  }
}

export const screenCapture = new ScreenCapture();
