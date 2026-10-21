type Listener = (now: number) => void;

/** 워커 기반 주기 실행기. 탭이 가려져 있어도 일정 간격으로 콜백을 호출한다. */
export class Ticker {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();

  constructor(private intervalMs: number) {}

  start() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./tickerWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = () => {
      const now = Date.now();
      for (const l of this.listeners) {
        try {
          l(now);
        } catch (err) {
          console.error("[ticker]", err);
        }
      }
    };
    this.worker.postMessage({ type: "start", intervalMs: this.intervalMs });
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** 앱 전역 1초 미만 간격 ticker (타이머 표시·알림 스케줄용) */
export const appTicker = new Ticker(250);
