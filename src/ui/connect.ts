/** '메이플 연결': 위쪽 연결 표시와 준비 안내의 버튼이 같이 쓴다 */
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { desktop } from "../platform/desktop";
import { createStore } from "../state/createStore";

export type CapturePickerSurface = "main" | "pip";

export const connectStore = createStore<{ picking: CapturePickerSurface | null; connecting: boolean; error: string | null }>({
  picking: null, connecting: false, error: null,
});

export async function startCapture() {
  connectStore.set({ error: null });
  audioEngine.unlock();
  try {
    await screenCapture.start();
  } catch (e) {
    if ((e as Error).name !== "NotAllowedError") connectStore.set({ error: (e as Error).message });
    if (desktop) throw e;
  }
}

export function stopCapture() {
  screenCapture.stop("user");
}

export function closeCapturePicker(surface: CapturePickerSurface) {
  if (connectStore.get().picking === surface) connectStore.set({ picking: null });
}

export async function connectSelectedSource(id: string, surface: CapturePickerSurface) {
  if (!desktop || connectStore.get().connecting || connectStore.get().picking !== surface) return;
  connectStore.set({ connecting: true });
  try {
    await desktop.selectSource(id);
    await startCapture();
    closeCapturePicker(surface);
  } finally {
    connectStore.set({ connecting: false });
  }
}

/** 데스크톱판은 창 목록을 열고, 웹은 브라우저의 공유 창을 연다 */
function connectFrom(surface: CapturePickerSurface) {
  if (desktop) {
    if (!connectStore.get().connecting) connectStore.set({ picking: surface });
  } else void startCapture();
}

export const connectMaple = () => connectFrom("main");
export const connectMapleFromPip = () => connectFrom("pip");
