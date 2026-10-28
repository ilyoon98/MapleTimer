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
  /** 마지막으로 새 프레임이 들어온 시각 (Date.now). 첫 프레임 전에는 공유 시작 시각 */
  lastFrameAt: number | null = null;
  /** 내부 캔버스에 마지막으로 그린 프레임이 들어온 시각 */
  drawnAt: number | null = null;
  private listeners = new Set<() => void>();
  private frameListeners = new Set<() => void>();
  private generation = 0;
  private releaseAwake: (() => void) | null = null;
  private awakeAbort: AbortController | null = null;
  private videoFrameId: number | null = null;
  private videoTime = -1;
  error: string | null = null;

  onFrame(l: () => void) {
    this.frameListeners.add(l);
    return () => { this.frameListeners.delete(l); };
  }

  private frameArrived() {
    this.frameStamp++;
    this.lastFrameAt = Date.now();
    for (const l of this.frameListeners) {
      try { l(); } catch (err) { console.error("[capture frame]", err); }
    }
  }

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
    const generation = this.generation;
    this.error = null;
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
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      // 게임 창이 닫히거나 브라우저의 '공유 중지'로 끊긴 경우
      track.addEventListener("ended", () => {
        if (generation === this.generation) this.stop("ended");
      });
      let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
      if (TrackProcessor) {
        try { reader = new TrackProcessor({ track }).readable.getReader(); }
        catch { /* API가 노출돼 있어도 사용할 수 없는 환경은 video로 대체 */ }
      }
      if (!reader) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.srcObject = stream;
        this.video = v;
        await v.play();
        if (generation !== this.generation) { v.srcObject = null; return; }
      }
      this.state = "live";
      // 최초 프레임이 오지 않는 경우도 멈춤으로 표시한다.
      this.lastFrameAt = Date.now();
      this.holdAwake();
      if (reader) void this.pump(reader, generation);
      else this.watchVideoFrames(generation);
    } catch (err) {
      if (generation !== this.generation) return;
      this.stop("user");
      this.error = (err as Error).message;
      throw err;
    }
    this.emit();
  }

  /**
   * 공유 세션마다 별도 잠금을 잡고 즉시 해제한다.
   * Web Lock은 브라우저의 백그라운드 실행을 보장하는 API는 아니다.
   */
  private holdAwake() {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return;
    const controller = new AbortController();
    this.awakeAbort = controller;
    void locks.request("maple-timer-awake", { mode: "shared", signal: controller.signal }, () => {
      if (controller.signal.aborted) return;
      return new Promise<void>((release) => { this.releaseAwake = release; });
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) console.warn("[capture lock]", err);
    });
  }

  private watchVideoFrames(generation: number) {
    const video = this.video;
    if (!video?.requestVideoFrameCallback) return;
    this.videoFrameId = video.requestVideoFrameCallback(() => {
      if (generation !== this.generation) return;
      this.videoTime = video.currentTime;
      this.frameArrived();
      this.watchVideoFrames(generation);
    });
  }

  private async pump(reader: ReadableStreamDefaultReader<VideoFrame>, generation: number) {
    this.reader = reader;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (generation !== this.generation) { value?.close(); return; }
        if (done || !value) break;
        this.latest?.close();
        this.latest = value;
        this.frameArrived();
      }
    } catch (err) {
      if (generation === this.generation) this.error = `화면 수신 오류: ${(err as Error).message}`;
    } finally {
      if (generation === this.generation && this.state === "live") {
        this.error ??= "화면 수신이 중단됐어요. 화면 공유를 다시 시작해 주세요.";
        this.stop("ended");
      }
    }
  }

  /** user: 이 앱에서 직접 멈춤(알림 없음), ended: 공유가 바깥에서 끊김 */
  stop(reason: "user" | "ended" = "user") {
    this.generation++;
    this.awakeAbort?.abort();
    this.awakeAbort = null;
    this.releaseAwake?.();
    this.releaseAwake = null;
    this.reader?.cancel().catch(() => {});
    this.reader = null;
    this.latest?.close();
    this.latest = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      if (this.videoFrameId != null) this.video.cancelVideoFrameCallback?.(this.videoFrameId);
      this.video.pause();
      this.video.srcObject = null;
    }
    this.videoFrameId = null;
    this.videoTime = -1;
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
    // video 대체 경로도 실제 재생 위치가 진행될 때만 도착 시각을 갱신한다.
    if (src instanceof HTMLVideoElement && src.currentTime !== this.videoTime) {
      this.videoTime = src.currentTime;
      this.lastFrameAt = Date.now();
    }
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
      this.drawnAt = this.lastFrameAt;
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
