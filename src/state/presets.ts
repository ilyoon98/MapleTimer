import { createPersistentStore } from "./createStore";
import { migrate, profileStore, uid, type Profile } from "./profile";

/** 사냥용·보스용처럼 설정 묶음을 이름 붙여 저장해 두고 바꿔 쓰기 */
export interface Preset {
  id: string;
  name: string;
  savedAt: number;
  profile: Profile;
}

export const presetStore = createPersistentStore<{ v: 1; presets: Preset[] }>("maple-timer-personal.presets.v1", { v: 1, presets: [] });

export function savePreset(name: string) {
  const trimmed = name.trim() || "프리셋";
  const profile = structuredClone(profileStore.get());
  presetStore.set((s) => {
    const existing = s.presets.find((p) => p.name === trimmed);
    const entry: Preset = { id: existing?.id ?? uid(), name: trimmed, savedAt: Date.now(), profile };
    return { ...s, presets: existing ? s.presets.map((p) => (p.id === existing.id ? entry : p)) : [...s.presets, entry] };
  });
}

export function loadPreset(id: string) {
  const p = presetStore.get().presets.find((x) => x.id === id);
  if (!p) return;
  // 실행 중인 타이머 상태는 지금 것을 유지하지 않고 프리셋에 저장된 그대로 (멈춘 상태로)
  const profile = migrate(structuredClone(p.profile));
  profile.timers = profile.timers.map((t) => ({ ...t, endsAt: null, pausedRemainingMs: null }));
  profileStore.set(() => profile);
}

export function deletePreset(id: string) {
  presetStore.set((s) => ({ ...s, presets: s.presets.filter((p) => p.id !== id) }));
}
