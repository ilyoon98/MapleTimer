import { useSyncExternalStore } from "react";

/** localStorage 에 자동 저장되는 아주 작은 전역 상태 저장소 */
export function createPersistentStore<T extends object>(key: string, initial: T, migrate?: (raw: unknown) => T) {
  let state: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = migrate ? migrate(parsed) : { ...initial, ...parsed };
    }
  } catch {
    /* 저장된 값이 깨졌으면 기본값 사용 */
  }
  const listeners = new Set<() => void>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        /* 저장 공간 부족 등은 무시 */
      }
    }, 300);
  };

  const store = {
    get: () => state,
    set(update: Partial<T> | ((s: T) => T)) {
      state = typeof update === "function" ? update(state) : { ...state, ...update };
      save();
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use<S>(selector: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(store.subscribe, () => selector(state));
    },
  };
  return store;
}

/** 저장하지 않는 런타임 상태용 */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set(update: Partial<T> | ((s: T) => T)) {
      state = typeof update === "function" ? update(state) : { ...state, ...update };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use<S>(selector: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(store.subscribe, () => selector(state));
    },
  };
  return store;
}
