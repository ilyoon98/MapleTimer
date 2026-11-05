import { profileStore, type PanelId } from "../state/profile";

/** 기능 칸을 펼치고 그 칸으로 화면을 옮긴다 */
export function focusPanel(id: PanelId) {
  profileStore.set((p) => ({ ...p, collapsed: { ...p.collapsed, [id]: false } }));
  requestAnimationFrame(() => document.querySelector(`[data-panel="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
