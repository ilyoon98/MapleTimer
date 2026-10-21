// 백그라운드 탭에서도 메인 스레드 setInterval 은 크게 느려지므로,
// 워커에서 주기적으로 tick 메시지를 보내 감지 루프를 깨운다.
let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<{ type: "start"; intervalMs: number } | { type: "stop" }>) => {
  if (timer) clearInterval(timer);
  timer = null;
  if (e.data.type === "start") {
    timer = setInterval(() => self.postMessage(performance.now()), e.data.intervalMs);
  }
};
