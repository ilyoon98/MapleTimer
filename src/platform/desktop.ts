export interface CaptureSource { id: string; name: string; thumbnail: string; recommended: boolean }
declare global {
  interface Window { mapleDesktop?: { listSources(): Promise<CaptureSource[]>; selectSource(id: string): Promise<void> } }
}
export const desktop = window.mapleDesktop;
