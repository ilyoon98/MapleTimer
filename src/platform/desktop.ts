export interface CaptureSource { id: string; name: string; thumbnail: string; recommended: boolean }
export interface UpdateState {
  currentVersion: string;
  status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "current" | "error" | "disabled";
  latestVersion: string | null;
  progress: number | null;
  error: string | null;
  checkedAt: number | null;
  revision: number;
}
declare global {
  interface Window {
    mapleDesktop?: {
      listSources(): Promise<CaptureSource[]>;
      selectSource(id: string): Promise<void>;
      appInfo?(): Promise<{version: string; packaged: boolean}>;
      settings?: {
        read(key: string): {value: string | null; recovered?: boolean; error?: string};
        write(key: string,value: string): {ok: boolean; error?: string};
      };
      updateStatus?(): Promise<UpdateState | null>;
      checkForUpdates?(): Promise<UpdateState>;
      onUpdateState?(cb: (info: UpdateState) => void): () => void;
      installUpdate?(): Promise<void>;
    };
  }
}
export const desktop = window.mapleDesktop;
