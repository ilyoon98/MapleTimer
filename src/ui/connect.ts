/** '메이플 연결': 위쪽 연결 표시와 준비 안내의 버튼이 같이 쓴다 */
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { desktop } from "../platform/desktop";
import { createStore } from "../state/createStore";

/** picking: 데스크톱판의 창 고르기 열림 */
export const connectStore = createStore<{ picking: boolean; error: string | null }>({ picking: false, error: null });

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

/** 데스크톱판은 창 목록을 열고, 웹은 브라우저의 공유 창을 연다 */
export function connectMaple() {
  if (desktop) connectStore.set({ picking: true });
  else void startCapture();
}
