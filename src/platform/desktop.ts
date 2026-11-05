export interface CaptureSource { id: string; name: string; thumbnail: string; recommended: boolean }
export interface UpdateInfo { version: string }
declare global {
  interface Window {
    mapleDesktop?: {
      listSources(): Promise<CaptureSource[]>;
      selectSource(id: string): Promise<void>;
      /** 아래 셋은 업데이트를 넣은 실행판에만 있다 */
      updateStatus?(): Promise<UpdateInfo | null>;
      onUpdateReady?(cb: (info: UpdateInfo) => void): void;
      installUpdate?(): Promise<void>;
    };
  }
}
export const desktop = window.mapleDesktop;
